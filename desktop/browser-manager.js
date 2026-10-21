// JavaScript, desktop/browser-manager.js, Electron 44; isolated native browser.
'use strict';
const { WebContentsView, session, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { publicUrl, navigation, trustedFrame } = require('./browser-policy');
const { createBrowserFullscreen } = require('./browser-fullscreen');
const { createBrowserNetwork } = require('./browser-network');
const { createBrowserControls, CONTROL_COMMANDS } = require('./browser-controls');

function createBrowserManager(win, origin, dataDirectory) {
  const browserSession = session.fromPartition('persist:free-agent-browser');
  const statePath = path.join(dataDirectory, 'browser-tabs.json');
  const tabs = new Map();
  const downloads = [];
  let activeId = null, nextId = 0, visible = false, attached = null, disposed = false;
  let bounds = null, persistTimer = null, resizeTimer = null, modalDepth = 0;
  const fullscreen = createBrowserFullscreen(win, () => { attach(); emit(); }, () => tabs.get(activeId)?.view.webContents);
  const controls = createBrowserControls({ session: browserSession, dataDirectory, getActive: () => tabs.get(activeId)?.view.webContents, getTabs: () => [...tabs.values()].map(t => t.view.webContents), changed: () => emit(), pickExtension: async () => {
    modalDepth++; suspend();
    try { const result = await dialog.showOpenDialog(win, { title: 'Carregar extensão descompactada', properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0]; }
    finally { modalDepth--; attach(); }
  } });
  const network = createBrowserNetwork();
  const proxyReady = Promise.all([network.start(),controls.ready]).then(([port]) => port).then(port => browserSession.setProxy({
    proxyRules: `http=127.0.0.1:${port};https=127.0.0.1:${port}`, proxyBypassRules: '<-loopback>'
  }));
  // A rejected proxy setup must not fall back to direct connections.
  let networkReady = false;
  proxyReady.then(() => { networkReady = true; }, error => console.error('[browser] Network isolation unavailable:', error.message));

  async function allowedRequest(value) {
    return !disposed && networkReady && publicUrl(value, true);
  }

  browserSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    // data/blob subresources cannot reach the local network and remain sandboxed.
    if (/^(data|blob):/.test(details.url) && details.resourceType !== 'mainFrame') return callback({});
    allowedRequest(details.url).then(allowed => callback(allowed ? controls.requestDecision(details) : {cancel:true}), () => callback({ cancel: true }));
  });

  function state() {
    return { activeId, presentation: fullscreen.state(), controls: controls.state(), capabilities: { agent: true, extensions: true, permissions: true }, tabs: [...tabs.values()].map(tab => {
      const wc = tab.view.webContents;
      return { id: tab.id, title: tab.url === 'about:blank' ? 'Nova aba' : wc.getTitle() || 'Nova aba', url: tab.url,
        loading: wc.isLoading(), error: tab.error, canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() };
    }), downloads: downloads.map(item => ({ ...item })) };
  }
  function emit() {
    if (disposed || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('fa-browser:state', state());
  }
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(save, 250);
  }
  function save() {
    try {
      const urls = [...tabs.values()].map(tab => tab.url).filter(url => publicUrl(url));
      fs.writeFileSync(statePath + '.tmp', JSON.stringify({ urls, active: [...tabs.keys()].indexOf(activeId) }));
      fs.renameSync(statePath + '.tmp', statePath);
    } catch (error) { console.warn('[browser] Não foi possível salvar abas:', error.message); }
  }
  function suspend() {
    if (attached) { win.contentView.removeChildView(attached); attached = null; }
  }
  function attach() {
    const tab = tabs.get(activeId);
    if (disposed || modalDepth || controls.state().pending.length || !visible || !bounds || !tab || win.isMinimized() || !win.isVisible()) { suspend(); return; }
    const [width,height] = win.getContentSize();
    const desired = fullscreen.state().active ? {x:0,y:0,width,height} : bounds;
    const current = tab.view.getBounds();
    if (Object.keys(desired).some(key => desired[key] !== current[key])) tab.view.setBounds(desired);
    // Reparenting the same view clears native keyboard focus and flashes the
    // compositor. Geometry polling must never detach an unchanged surface.
    if (attached !== tab.view) {
      suspend(); win.contentView.addChildView(tab.view); attached = tab.view;
    }
  }
  function load(tab, value) {
    const url = value === undefined ? 'about:blank' : navigation(value);
    const requestId = tab.requestId = (tab.requestId || 0) + 1;
    tab.url = url; tab.error = '';
    proxyReady.then(() => {
      if (!disposed && tabs.has(tab.id) && !tab.view.webContents.isDestroyed()) return tab.view.webContents.loadURL(url);
    }).catch(error => {
      if (!disposed && tabs.has(tab.id) && tab.requestId === requestId && error.code !== 'ERR_ABORTED') { tab.error = 'Não foi possível abrir esta página. Verifique o endereço ou a conexão.'; emit(); }
    });
    persist(); emit();
  }
  function create(value) {
    if (tabs.size >= 16) throw new Error('Limite de 16 abas. Feche uma aba antes de abrir outra.');
    const url = value === undefined ? 'about:blank' : navigation(value);
    if (fullscreen.state().active) void fullscreen.exit();
    const view = new WebContentsView({ webPreferences: {
      session: browserSession, sandbox: true, contextIsolation: true, nodeIntegration: false,
      nodeIntegrationInSubFrames: false, webviewTag: false, webSecurity: true,
      allowRunningInsecureContent: false, navigateOnDragDrop: false, disableHtmlFullscreenWindowResize: true,
      backgroundThrottling: false
    } });
    const tab = { id: String(++nextId), view, url, error: '' };
    tabs.set(tab.id, tab); activeId = tab.id;
    const wc = view.webContents;
    controls.track(wc); fullscreen.track(wc);
    wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    wc.setWindowOpenHandler(({ url: target }) => {
      if (publicUrl(target) && tabs.size < 16) { try { create(target); } catch {} }
      return { action: 'deny' };
    });
    const guard = (event, target) => {
      const url = typeof target === 'string' ? target : target?.url;
      if (!publicUrl(url) && !(url === 'about:blank' && tab.url === 'about:blank')) { event.preventDefault(); tab.error = 'Destino bloqueado: apenas sites públicos HTTP/HTTPS.'; emit(); }
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', guard);
    wc.on('will-frame-navigate', event => guard(event, event.url));
    wc.on('did-navigate', (_, target) => { tab.url = target; tab.error = ''; persist(); emit(); });
    wc.on('did-navigate-in-page', (_, target, main) => { if (main) { tab.url = target; persist(); emit(); } });
    for (const event of ['page-title-updated', 'did-start-loading', 'did-stop-loading']) wc.on(event, emit);
    wc.on('did-fail-load', (_, code, description, failedUrl, main) => {
      if (main && code !== -3) { tab.error = 'Página indisponível: ' + String(description).slice(0, 120); emit(); }
    });
    wc.on('render-process-gone', () => { tab.error = 'A página foi encerrada. Use atualizar para tentar novamente.'; emit(); });
    wc.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && (input.control || input.meta) && ['l','t','w'].includes(input.key.toLowerCase())) {
        event.preventDefault();
        win.webContents.send('fa-browser:state', { ...state(), shortcut: input.key.toLowerCase() });
        win.webContents.focus();
      }

    });
    load(tab, url === 'about:blank' ? undefined : url); attach(); return tab;
  }

  const downloadHandler = (event, item, contents) => {
    let safeDownload = publicUrl(item.getURL());
    if (!safeDownload && item.getURL().startsWith('blob:') && contents && publicUrl(contents.getURL())) {
      try { safeDownload = new URL(item.getURL()).origin === new URL(contents.getURL()).origin; } catch {}
    }
    if (![...tabs.values()].some(tab => tab.view.webContents === contents) || !safeDownload) { event.preventDefault(); return; }
    const record = { id: 'd' + Date.now() + '-' + downloads.length, name: item.getFilename().slice(0, 180), received: 0, total: item.getTotalBytes(), state: 'choosing' };
    downloads.push(record); if (downloads.length > 20) downloads.shift(); emit();
    // Chromium owns its native save dialog; this must be configured inside
    // will-download, not after awaiting a second async save dialog.
    item.setSaveDialogOptions({ title: 'Salvar download', defaultPath: path.basename(record.name) });
    item.on('updated', (_, status) => { record.received = item.getReceivedBytes(); record.total = item.getTotalBytes(); record.state = status; emit(); });
    item.once('done', (_, status) => { record.received = item.getReceivedBytes(); record.state = status; emit(); });
  };
  browserSession.on('will-download', downloadHandler);

  async function command(event, action, payload = {}) {
    if (!trustedFrame(event, win.webContents, origin)) throw new Error('Origem IPC não autorizada.');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Dados inválidos.');
    if (CONTROL_COMMANDS.includes(action)) { const result = await controls.command(action, payload); emit(); return result === undefined ? state() : result; }
    const tab = tabs.get(activeId);
    switch (action) {
      case 'state': return state();
      case 'fullscreen': if (typeof payload.enabled !== 'boolean') throw Error('Modo inválido.'); fullscreen.set(payload.enabled); break;
      case 'create': create(payload.url); break;
      case 'activate': {
        if (typeof payload.id !== 'string' || !tabs.has(payload.id)) throw new Error('Aba inválida.');
        await fullscreen.exit(); activeId = payload.id; attach(); persist(); break;
      }
      case 'close': {
        if (typeof payload.id !== 'string' || !tabs.has(payload.id)) throw new Error('Aba inválida.');
        if (activeId === payload.id) await fullscreen.exit();
        const closing = tabs.get(payload.id);
        if (attached === closing.view) suspend();
        tabs.delete(payload.id);
        closing.view.webContents.close({ waitForBeforeUnload: false });
        if (activeId === payload.id) activeId = [...tabs.keys()].at(-1) || null;
        attach(); persist(); break;
      }
      case 'navigate': if (tab) load(tab, payload.value); break;
      case 'back': if (tab?.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack(); break;
      case 'forward': if (tab?.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward(); break;
      case 'reload': if (tab) { tab.error = ''; tab.view.webContents.reload(); } break;
      case 'stop': tab?.view.webContents.stop(); break;
      case 'external': await shell.openExternal(navigation(payload.value)); break;
      case 'layout': {
        if (typeof payload.visible !== 'boolean') throw new Error('Visibilidade inválida.');
        visible = payload.visible;
        if (visible) {
          const zoom = win.webContents.getZoomFactor();
          const [width, height] = win.getContentSize();
          const values = ['x', 'y', 'width', 'height'].map(key => payload[key]);
          if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 20000)) throw new Error('Limites inválidos.');
          const [x, y, w, h] = values.map(value => Math.round(value * zoom));
          bounds = { x: Math.min(width, x), y: Math.min(height, y), width: Math.max(0, Math.min(w, width - x)), height: Math.max(0, Math.min(h, height - y)) };
        }
        attach(); return state();
      }
      default: throw new Error('Comando inválido.');
    }
    emit(); return state();
  }
  ipcMain.handle('fa-browser:command', command);
  const onResize = () => {
    clearTimeout(resizeTimer);
    if (fullscreen.state().active) attach();
    else {
      suspend();
      // Windows can emit its last resize after the renderer already reported
      // unchanged restored bounds. Reattach even when that report is deduplicated.
      resizeTimer = setTimeout(attach, 100);
    }
  };
  win.on('resize', onResize); // renderer reports fresh bounds after reflow
  win.on('minimize', suspend);
  win.on('restore', attach);
  win.on('show', attach);
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
  if (Array.isArray(saved?.urls)) {
    for (const url of saved.urls.slice(0, 16)) { if (publicUrl(url)) { try { create(url); } catch {} } }
    if (Number.isInteger(saved.active)) activeId = [...tabs.keys()][saved.active] || activeId;
  }
  const onAppLoad = () => { visible = false; suspend(); emit(); };
  win.webContents.on('did-finish-load', onAppLoad);
  return { state, command, allowedRequest, dispose() {
    if (disposed) return;
    clearTimeout(persistTimer); clearTimeout(resizeTimer); save(); suspend(); disposed = true; fullscreen.dispose(); controls.dispose();
    ipcMain.removeHandler('fa-browser:command');
    win.removeListener('resize', onResize);
    win.removeListener('minimize', suspend);
    win.removeListener('restore', attach);
    win.removeListener('show', attach);
    win.webContents.removeListener('did-finish-load', onAppLoad);
    browserSession.removeListener('will-download', downloadHandler);
    network.close();
    for (const tab of tabs.values()) tab.view.webContents.close({ waitForBeforeUnload: false });
    tabs.clear();
  } };
}
module.exports = { createBrowserManager };
