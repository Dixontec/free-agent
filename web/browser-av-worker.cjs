'use strict';

const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createBrowserNetwork } = require('../desktop/browser-network');
const { publicUrl, navigation } = require('../desktop/browser-policy');
const { sanitizeOffer } = require('./rtc-policy.cjs');
const { createBrowserControls, CONTROL_COMMANDS } = require('../desktop/browser-controls');

const argument = name => process.argv.find(a => a.startsWith(name + '='))?.slice(name.length + 1);
const profileDir = argument('--av-profile');
if (!profileDir || !path.isAbsolute(profileDir) || !process.send) throw Error('Worker requer perfil e IPC privado.');
const fixtureDirectory = argument('--av-fixtures');
const senderFile = path.join(__dirname, 'browser-av-sender.html');
const senderURL = pathToFileURL(senderFile).href;
const restoreFile = path.join(profileDir, 'free-agent-tabs.json');
const staging = path.join(profileDir, 'download-staging');
const tabs = new Map(), downloads = new Map();
let sourceSession, senderSession, sender, network, activeId = null, visible = false, closing = false;
let captureEpoch = 0;
let captureId = null, streamingId = null, audioTabId = null, viewport = { width: 1000, height: 700, scale: 1 }, queue = Promise.resolve(), saves = Promise.resolve();
let poll, polling = false, mediaFailure = '', controls, fullscreenOwner = null;
app.setPath('userData', profileDir);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});
const send = message => { if (process.connected) process.send(message, () => {}); };
function state() {
  return { tabs: [...tabs.values()].map(t => ({ id: t.id, title: t.url === 'about:blank' ? 'Nova aba' : t.title, url: t.url, loading: t.loading, error: t.error,
    canGoBack: t.win.webContents.navigationHistory.canGoBack(), canGoForward: t.win.webContents.navigationHistory.canGoForward() })),
   activeId, audioTabId, videoTabId:streamingId, presentation: {active:fullscreenOwner===activeId && !!activeId,kind:fullscreenOwner?'video':null}, controls: controls?.state(), viewport: { ...viewport }, downloads: [...downloads.values()].map(d => ({ id: d.id, name: d.name, received: d.received, total: d.total, state: d.state })),
  engine: 'web', connected: !closing, diagnostic: mediaFailure || 'Transmissão audiovisual privada por WebRTC.',
  capabilities: { audio: true, video: true, transport: 'webrtc', serviceWorkers: true, downloads: true } };
}
function emit() { if (!closing) send({ event: 'state', state: state() }); }
function save() {
  const list = [...tabs.values()].filter(t => publicUrl(t.url));
  const body = JSON.stringify({ urls: list.map(t => t.url), activeIndex: list.findIndex(t => t.id === activeId) });
  saves = saves.catch(() => {}).then(async () => { const temp = restoreFile + '.tmp'; await fs.writeFile(temp, body, { mode: 0o600 }); await fs.rename(temp, restoreFile); });
  return saves;
}
const prefs = () => ({ sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false,
  webSecurity: true, allowRunningInsecureContent: false, disableDialogs: true, disableHtmlFullscreenWindowResize: true, backgroundThrottling: false, session: sourceSession });
function trusted(wc) { return Boolean(sender && !sender.isDestroyed() && wc === sender.webContents && wc.session === senderSession && wc.getURL() === senderURL); }
function mute() { for (const t of tabs.values()) if (!t.win.isDestroyed()) t.win.webContents.setAudioMuted(true); streamingId = null; }
async function releaseInput(t) {
  if (!t || t.win.isDestroyed()) return;
  const wc = t.win.webContents;
  if (wc.debugger.isAttached()) {
    for (const key of t.keys.values()) await wc.debugger.sendCommand('Input.dispatchKeyEvent', { ...key, type: 'keyUp', text: undefined, modifiers: 0 }).catch(() => {});
    for (const [button, bit] of [['left', 1], ['right', 2], ['middle', 4]]) if (t.buttons & bit) await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button, buttons: 0, x: t.x || 0, y: t.y || 0 }).catch(() => {});
  }
  t.keys.clear(); t.buttons = 0;
}
async function stopCapture() {
  captureEpoch++; mute(); captureId = null; audioTabId = null;
  if (sender && !sender.isDestroyed() && trusted(sender.webContents)) await sender.webContents.executeJavaScript('window.avStop()').catch(() => {});
}
function throttle() {
  for (const t of tabs.values()) t.win.webContents.setBackgroundThrottling(!(visible && t.id === activeId || t.id === audioTabId));
}
async function activate(id) {
  await releaseInput(tabs.get(activeId));
  activeId = id;
  const t = tabs.get(id);
  if (streamingId && t && t.url !== 'about:blank' && trusted(sender?.webContents)) {
    captureId = id;
    try { await sender.webContents.executeJavaScript(`window.avSwitchVideo(${JSON.stringify(viewport)})`, true); streamingId = id; }
    catch { await stopCapture(); }
  }
  throttle(); emit(); void save().catch(() => {});
}
function allowed(url, resourceType) {
  if (publicUrl(url, true)) return true;
  return !['mainFrame', 'subFrame'].includes(resourceType) && /^(blob:|data:)/.test(url);
}
function update(t) {
  if (!tabs.has(t.id) || t.win.isDestroyed()) return;
  const wc = t.win.webContents, url = wc.getURL();
  if (publicUrl(url) || url === 'about:blank') t.url = url;
  t.title = wc.getTitle().slice(0, 1024); t.loading = wc.isLoading(); emit();
  void save().catch(() => {});
}
function go(t, url) {
  t.url = url; t.error = null; t.loading = true; emit();
  void t.win.loadURL(url).then(()=>{
    if(t.id===activeId && streamingId && streamingId!==t.id)queue=queue.then(()=>activate(t.id)).catch(()=>{});
  }).catch(error => {
    if (tabs.has(t.id) && t.url === url && error.code !== 'ERR_ABORTED') {
      const code = String(error.code || error.errno || '').replace(/[^A-Z0-9_-]/gi, '').slice(0, 40);
      t.error = `Página indisponível ou destino bloqueado${code ? ' (' + code + ')' : ''}.`; t.loading = false; emit();
    }
  });
}
function create(url) {
  if (tabs.size >= 16) throw Error('Limite de 16 abas.');
  const win = new BrowserWindow({ show: false, useContentSize: true, width: Math.round(viewport.width * viewport.scale), height: Math.round(viewport.height * viewport.scale), webPreferences: prefs() });
  const wc = win.webContents;
  controls.track(wc); wc.setZoomFactor(viewport.scale);
  wc.setAudioMuted(true); wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  const t = { id: randomUUID(), win, url, title: '', loading: false, error: null, keys: new Map(), buttons: 0 };
  tabs.set(t.id, t);
  const guard = (event, target) => { if (!publicUrl(target) && !(target === 'about:blank' && t.url === 'about:blank')) { event.preventDefault(); t.error = 'Navegação não pública bloqueada.'; emit(); } };
  wc.on('will-navigate', guard); wc.on('will-redirect', guard);
  wc.on('will-prevent-unload', event => event.preventDefault());
  wc.on('will-frame-navigate', event => guard(event, event.url));
  wc.setWindowOpenHandler(details => {
    if (publicUrl(details.url) && tabs.size < 16 && !closing) {
      // Always construct an owned window; never inherit popup preferences or preload.
      queue = queue.then(async () => { if (!closing && tabs.size < 16) { const child = create(details.url); await activate(child.id); } }).catch(() => {});
    }
    return { action: 'deny' };
  });
  wc.on('page-title-updated', () => update(t)); wc.on('did-navigate', () => update(t)); wc.on('did-navigate-in-page', () => update(t));
  wc.on('did-start-loading', () => { t.loading = true; emit(); }); wc.on('did-stop-loading', () => update(t));
  wc.on('did-fail-load', (_event, code, _description, _url, main) => { if (main && code !== -3) { t.error = 'Página indisponível ou destino bloqueado.'; t.loading = false; emit(); } });
  wc.on('render-process-gone', () => { t.error = 'A aba falhou; recarregue para tentar novamente.'; t.loading = false; mute(); emit(); });
  wc.on('enter-html-full-screen', () => { if (t.id === activeId) { fullscreenOwner=t.id; emit(); } });
  wc.on('leave-html-full-screen', () => { if (fullscreenOwner===t.id) { fullscreenOwner=null; emit(); } });
  wc.on('did-start-navigation', (_e,_url,inPlace,main) => { if(main&&!inPlace&&fullscreenOwner===t.id){fullscreenOwner=null;emit()} });
  wc.on('before-input-event', (event, input) => { if (input.key === 'F12' || (input.control && input.shift && ['i', 'j', 'c'].includes(input.key.toLowerCase()))) event.preventDefault(); });
  win.on('close', event => { if (!closing) { event.preventDefault(); queue = queue.then(() => closeTab(t)).catch(() => {}); } });
  win.on('closed', () => { tabs.delete(t.id); });
  go(t, url); throttle(); return t;
}
async function closeTab(t) {
  await releaseInput(t);
  if (streamingId === t.id || audioTabId === t.id) await stopCapture();
  tabs.delete(t.id); t.win.destroy();
  if (activeId === t.id) activeId = tabs.keys().next().value || null;
  throttle(); await save(); emit();
}
function downloadSetup() {
  sourceSession.on('will-download', (_event, item) => {
    // Finished/cancelled history must not permanently consume active slots.
    for (const [id, previous] of downloads) {
      if (downloads.size < 20) break;
      if (['cancelled', 'failed', 'completed'].includes(previous.state)) {
        downloads.delete(id);
        void fs.rm(previous.path, { force: true }).catch(() => {});
      }
    }
    if (closing || downloads.size >= 20 || item.getTotalBytes() > 64 * 1024 * 1024) { item.cancel(); return; }
    const id = randomUUID();
    const name = path.basename(item.getFilename().replace(/\\/g, '/')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180) || 'download';
    const d = { id, name, path: path.join(staging, id), item, received: 0, total: item.getTotalBytes(), state: 'awaiting-authorization', accepted: false, last: 0 };
    item.setSavePath(d.path); item.pause(); downloads.set(id, d); emit();
    item.on('updated', () => {
      d.received = item.getReceivedBytes(); d.total = item.getTotalBytes();
      if (d.received > 64 * 1024 * 1024 || d.total > 64 * 1024 * 1024) { d.state = 'cancelled'; item.cancel(); return; }
      if (d.accepted) d.state = item.isPaused() ? 'interrupted' : 'progressing';
      if (Date.now() - d.last >= 250) { d.last = Date.now(); emit(); }
    });
    item.once('done', (_event, result) => {
      d.received = item.getReceivedBytes(); d.total = item.getTotalBytes(); d.item = null;
      // Very small/cached responses may finish despite pause(). Keep them
      // quarantined, inaccessible to HTTP, until the user explicitly accepts.
      d.finished = result === 'completed' && d.received <= 64 * 1024 * 1024;
      d.state = d.finished ? d.accepted ? 'completed' : 'awaiting-authorization' : result === 'cancelled' ? 'cancelled' : 'failed';
      if (!d.finished) void fs.rm(d.path, { force: true }).catch(() => {});
      emit();
    });
  });
}
async function input(t, p) {
  if (!visible) throw Error('Visualização oculta.');
  const wc = t.win.webContents;
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  const number = (value, min, max, fallback = 0) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  if (p.kind === 'mouse') {
    if (!['mouseMoved', 'mousePressed', 'mouseReleased', 'mouseWheel'].includes(p.eventType)) throw Error('Evento de mouse inválido.');
    const button = ['left', 'right', 'middle', 'none'].includes(p.button) ? p.button : 'none';
    const params = { type: p.eventType, x: number(p.x, 0, viewport.width - 1), y: number(p.y, 0, viewport.height - 1), button,
      buttons: number(p.buttons, 0, 7), modifiers: number(p.modifiers, 0, 15), clickCount: number(p.clickCount, 0, 3) };
    if (p.eventType === 'mouseWheel') { params.deltaX = number(p.deltaX, -10000, 10000); params.deltaY = number(p.deltaY, -10000, 10000); }
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', params);
    t.x = params.x; t.y = params.y;
    const bit = { left: 1, right: 2, middle: 4 }[button] || 0;
    if (p.eventType === 'mousePressed') t.buttons |= bit;
    if (p.eventType === 'mouseReleased') t.buttons &= ~bit;
  } else if (p.kind === 'key') {
    if (!['keyDown', 'rawKeyDown', 'keyUp', 'char'].includes(p.eventType)) throw Error('Evento de teclado inválido.');
    const params = { type: p.eventType, modifiers: number(p.modifiers, 0, 15) };
    for (const key of ['key', 'code', 'text', 'unmodifiedText']) if (typeof p[key] === 'string') params[key] = p[key].slice(0, 128);
    for (const key of ['windowsVirtualKeyCode', 'nativeVirtualKeyCode', 'location']) if (Number.isInteger(p[key])) params[key] = number(p[key], 0, 65535);
    if (typeof p.autoRepeat === 'boolean') params.autoRepeat = p.autoRepeat;
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', params);
    if (['keyDown', 'rawKeyDown'].includes(p.eventType)) t.keys.set(params.code || params.key, params);
    if (p.eventType === 'keyUp') t.keys.delete(params.code || params.key);
  } else if (p.kind === 'text') {
    if (typeof p.text !== 'string' || p.text.length > 16384) throw Error('Texto inválido.');
    await wc.debugger.sendCommand('Input.insertText', { text: p.text });
  } else throw Error('Entrada inválida.');
}
async function command(cmd, p = {}) {
  if (cmd === 'shutdown') { await shutdown(); return true; }
  if (closing) throw Error('Worker encerrando.');
  if (cmd === 'state') return state();
  if (cmd === 'fullscreen') { if(typeof p.enabled!=='boolean')throw Error('Modo inválido.');if(!p.enabled){const t=tabs.get(fullscreenOwner);fullscreenOwner=null;if(t&&!t.win.isDestroyed())await t.win.webContents.executeJavaScript('document.fullscreenElement ? document.exitFullscreen() : undefined').catch(()=>{});}emit();return state(); }
  if (CONTROL_COMMANDS.includes(cmd)) { const result = await controls.command(cmd, p); emit(); return result === undefined ? state() : result; }
  if (cmd === 'metrics') {
    const metrics = app.getAppMetrics().map(m => ({ pid: m.pid, type: m.type, cpu: m.cpu, memory: m.memory }));
    if (metrics.length && trusted(sender?.webContents)) metrics[0].capture = await sender.webContents.executeJavaScript('window.avDiagnostics()');
    const current = tabs.get(activeId);
    if (metrics.length && current && !current.win.isDestroyed()) metrics[0].pageMedia = await current.win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('video,audio')).slice(0,8).map(v=>({paused:v.paused,currentTime:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:null,readyState:v.readyState,muted:v.muted,error:v.error?.code||null}))`).catch(() => []);
    return metrics;
  }
  if (cmd === 'release') { visible = false; await releaseInput(tabs.get(activeId)); await stopCapture(); throttle(); return state(); }
  if (cmd === 'audio-source') {
    const t=tabs.get(activeId);if(!t||t.url==='about:blank'||!streamingId||!trusted(sender?.webContents))throw Error('Abra uma aba com mídia primeiro.');
    const previous=audioTabId;captureId=t.id;
    await sender.webContents.executeJavaScript('window.avSwitchAudio()',true);audioTabId=t.id;
    if(previous!==t.id){const old=tabs.get(previous);if(old&&!old.win.isDestroyed())old.win.webContents.setAudioMuted(true)}
    throttle();emit();return state();
  }
  if (cmd === 'layout') {
    const width = Number.isFinite(p.width) ? Math.round(p.width) : viewport.width;
    const height = Number.isFinite(p.height) ? Math.round(p.height) : viewport.height;
    const next = { width: Math.max(240, Math.min(1920, width)), height: Math.max(160, Math.min(1200, height)), scale: Math.max(1, Math.min(2, Number(p.scale) || viewport.scale)) };
    if (!p.visible) { await releaseInput(tabs.get(activeId)); if(!p.backgroundAudio || !audioTabId) await stopCapture(); }
    if (next.width !== viewport.width || next.height !== viewport.height || next.scale !== viewport.scale) {
      viewport = next;
      for (const t of tabs.values()) { t.win.setContentSize(Math.round(next.width * next.scale), Math.round(next.height * next.scale)); t.win.webContents.setZoomFactor(next.scale); }
      if (streamingId && trusted(sender?.webContents)) await sender.webContents.executeJavaScript(`window.avResize(${JSON.stringify(next)})`).catch(() => {});
    }
    visible = Boolean(p.visible); throttle(); emit(); return state();
  }
  if (cmd.startsWith('download-')) {
    const d = downloads.get(p.id);
    if (!d) throw Error('Download inexistente.');
    if (cmd === 'download-file') { if (d.state !== 'completed') throw Error('Download não concluído.'); await fs.access(d.path); return d.path; }
    if (cmd === 'download-accept') {
      if (d.state !== 'awaiting-authorization' || (!d.item && !d.finished)) throw Error('Download não aguarda autorização.');
      d.accepted = true; d.state = d.finished ? 'completed' : 'progressing';
      if (!d.finished) d.item.resume();
    } else if (cmd === 'download-cancel') {
      if (d.item) d.item.cancel(); d.state = 'cancelled'; await fs.rm(d.path, { force: true }).catch(() => {});
    } else throw Error('Comando de download inválido.');
    emit(); return state();
  }
  if (cmd === 'create') { const t = create(p.url ? navigation(p.url) : 'about:blank'); await activate(t.id); return state(); }
  const t = tabs.get(['activate', 'close'].includes(cmd) ? p.id : activeId);
  if (!t) throw Error('Aba inexistente.');
  const wc = t.win.webContents;
  if (cmd === 'activate') await activate(t.id);
  else if (cmd === 'close') await closeTab(t);
  else if (cmd === 'navigate') go(t, navigation(p.value ?? p.url));
  else if (cmd === 'back' || cmd === 'forward' || cmd === 'reload') {
    t.error = null;
    if (cmd === 'reload') wc.reload();
    if (cmd === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (cmd === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  } else if (cmd === 'stop') wc.stop();
  else if (cmd === 'input') await input(t, p);
  else if (cmd === 'rtc-offer') {
    if (!visible) throw Error('Visualização oculta.');
    const sdp = await sanitizeOffer(p.sdp);
    if (!/^m=audio /m.test(sdp) || !/^m=video /m.test(sdp)) throw Error('Oferta requer áudio e vídeo.');
    await stopCapture(); captureId = t.id; mediaFailure = '';
    try {
      const result = await sender.webContents.executeJavaScript(`window.avAnswer(${JSON.stringify({ sdp, ...viewport })})`, true);
      if (!visible || activeId !== t.id || !captureId) throw Error('Captura interrompida.');
      streamingId = t.id; audioTabId = t.id; throttle(); emit();
      return { type: 'answer', sdp: result.sdp, tabId: t.id };
    } catch { await stopCapture(); throw Error('Falha ao estabelecer captura audiovisual.'); }
  } else throw Error('Comando audiovisual inválido.');
  emit(); return state();
}
async function shutdown() {
  if (closing) return;
  closing = true; clearInterval(poll); controls?.dispose();
  await stopCapture();
  for (const d of downloads.values()) {
    if (d.item) d.item.cancel();
    for (const file of [d.path, d.path + '.crdownload']) await fs.rm(file, { force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
  await save().catch(() => {}); await saves.catch(() => {});
  for (const t of tabs.values()) { await releaseInput(t); t.win.destroy(); }
  tabs.clear(); sender?.destroy(); network?.close();
  await sourceSession?.closeAllConnections();
}
process.on('message', message => {
  if (!message || !Number.isSafeInteger(message.id) || typeof message.command !== 'string' || !message.payload || typeof message.payload !== 'object') return;
  queue = queue.then(async () => {
    try { const result = await command(message.command, message.payload); send({ id: message.id, result }); }
    catch (error) { send({ id: message.id, error: /^RTC policy:/.test(error.message) ? 'Oferta RTC bloqueada.' : error.message }); }
    if (message.command === 'shutdown') setTimeout(() => app.exit(0), 50);
  });
});
process.on('disconnect', () => { void shutdown().finally(() => app.exit(0)); });
app.on('before-quit', event => { if (!closing) { event.preventDefault(); void shutdown().finally(() => app.exit(0)); } });

app.whenReady().then(async () => {
  await fs.mkdir(staging, { recursive: true, mode: 0o700 });
  // Only this dedicated staging directory is owned by this engine.
  for (const name of await fs.readdir(staging)) if (/^[0-9a-f-]{36}(?:\.crdownload)?$/.test(name)) await fs.rm(path.join(staging, name), { force: true }).catch(() => {});
  sourceSession = session.fromPartition('persist:av-browser');
  controls = createBrowserControls({ session: sourceSession, dataDirectory: profileDir, getActive: () => tabs.get(activeId)?.win.webContents, getTabs: () => [...tabs.values()].map(t => t.win.webContents), changed: emit });
  await controls.ready;
  network = createBrowserNetwork(); const port = await network.start();
  await sourceSession.setProxy({ mode: 'fixed_servers', proxyRules: `http://127.0.0.1:${port}`, proxyBypassRules: '<-loopback>' });
  sourceSession.webRequest.onBeforeRequest((details, callback) => callback(allowed(details.url,details.resourceType)?controls.requestDecision(details):{cancel:true}));
  if (fixtureDirectory) {
    const root = await fs.realpath(fixtureDirectory);
    await sourceSession.protocol.handle('https', async request => {
      try {
        const url = new URL(request.url);
        if (url.origin !== 'https://fixture.test') return sourceSession.fetch(request, { bypassCustomProtocolHandlers: true });
        if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
        const candidate = await fs.realpath(path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
        const rel = path.relative(root, candidate);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return new Response(null, { status: 403 });
        const mime = { '.html': 'text/html', '.js': 'text/javascript', '.webm': 'video/webm', '.css': 'text/css', '.txt': 'text/plain' }[path.extname(candidate)];
        if (!mime) return new Response(null, { status: 403 });
        const headers = { 'content-type': mime };
        if (url.searchParams.has('download')) headers['content-disposition'] = 'attachment; filename="fixture.txt"';
        return new Response(request.method === 'HEAD' ? null : await fs.readFile(candidate), { headers });
      } catch { return new Response(null, { status: 404 }); }
    });
  }
  downloadSetup();
  senderSession = session.fromPartition('av-sender-' + randomUUID());
  sender = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, session: senderSession } });
  senderSession.setPermissionCheckHandler((wc, permission) => trusted(wc) && ['media', 'display-capture'].includes(permission));
  senderSession.setPermissionRequestHandler((wc, permission, callback) => callback(trusted(wc) && ['media', 'display-capture'].includes(permission)));
  senderSession.setDevicePermissionHandler(() => false);
  senderSession.setDisplayMediaRequestHandler((request, callback) => {
    const t = tabs.get(captureId);
    if (!trusted(sender.webContents) || request.frame !== sender.webContents.mainFrame || !request.videoRequested || !t || t.id !== activeId || t.win.isDestroyed()) return callback({});
    const frame = t.win.webContents.mainFrame;
    // Chromium snapshots the source's mute state when the frame sink is bound.
    // This is the authorized capture boundary, with local echo disabled below.
    if(request.audioRequested)t.win.webContents.setAudioMuted(false);
    callback(request.audioRequested ? {video:frame,audio:frame,enableLocalEcho:false} : {video:frame});
  });
  senderSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== senderURL }));
  sender.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  sender.webContents.on('will-navigate', event => event.preventDefault());
  sender.webContents.on('will-redirect', event => event.preventDefault());
  const senderFailed = () => {
    if (closing) return;
    mute(); mediaFailure = 'O processo de captura falhou; reconecte o navegador para restaurar a sessão.'; emit();
    const deadline = setTimeout(() => app.exit(1), 2500); deadline.unref();
    void shutdown().finally(() => app.exit(1));
  };
  sender.webContents.on('render-process-gone', senderFailed);
  sender.on('closed', senderFailed);
  await sender.loadFile(senderFile);
  let restored = { urls: [] };
  try { restored = JSON.parse(await fs.readFile(restoreFile, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') {
      try { restored = JSON.parse(await fs.readFile(path.join(path.dirname(profileDir), 'browser-web', 'free-agent-tabs.json'), 'utf8')); } catch { /* No legacy public URL list. */ }
    }
  }
  const urls = Array.isArray(restored.urls) ? restored.urls.filter(url => typeof url === 'string' && publicUrl(url)).slice(0, 16) : [];
  for (const url of urls) create(url);
  activeId = [...tabs.keys()][Math.max(0, Math.min(urls.length - 1, Number.isInteger(restored.activeIndex) ? restored.activeIndex : 0))] || null;
  throttle(); await save();
  poll = setInterval(() => {
    if (closing || !streamingId || polling) return;
    if (!sender || sender.isDestroyed() || sender.webContents.isDestroyed()) { senderFailed(); return; }
    polling = true;
    const epoch = captureEpoch;
    void sender.webContents.executeJavaScript('window.avStatus()').then(async status => {
      if (!status.streaming && !closing && streamingId && epoch === captureEpoch) {
        await stopCapture(); mediaFailure = 'Transmissão interrompida ou sem receptor. Use Reconectar mídia.'; emit();
      }
    }).catch(senderFailed).finally(() => { polling = false; });
  }, 1000);
  emit(); send({ event: 'ready' });
}).catch(async () => { send({ event: 'fatal' }); await shutdown().catch(() => {}); app.exit(1); });
