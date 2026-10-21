'use strict';
// Host-only browser capabilities. Never expose this module or privileged IPC to a site.
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const {ipcMain}=require('electron');
const {parse:getDomain}=require('tldts-experimental');
const filterAssets=require('./browser-filter-assets');
const { publicUrl, navigation } = require('./browser-policy');
const RESOURCES = ['camera', 'microphone', 'geolocation', 'notifications', 'ai'];
const DECISIONS = ['ask', 'once', 'session', 'always', 'block'];
const COMMANDS = ['normalize', 'permission-set', 'permission-answer', 'extension-load', 'extension-set', 'extension-remove', 'blocker-set', 'blocker-update', 'selection', 'observe', 'agent-action', 'agent-navigate', 'capture', 'ai-stop'];

function createBrowserControls({ session, dataDirectory, getActive, getTabs, changed, pickExtension }) {
  const file = path.join(dataDirectory, 'browser-controls.json');
  let saved = { permissions: {}, extensions: [], blocker: { enabled: true, exceptions: [] } };
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); if (v && v.version === 1) saved = { ...saved, ...v }; } catch {}
  saved.permissions = saved.permissions && typeof saved.permissions === 'object' && !Array.isArray(saved.permissions) ? saved.permissions : {};
  saved.extensions = Array.isArray(saved.extensions) ? saved.extensions.slice(0, 20) : [];
  saved.blocker = { enabled: saved.blocker?.enabled !== false, exceptions: Array.isArray(saved.blocker?.exceptions) ? saved.blocker.exceptions.filter(publicUrl).slice(0, 500) : [] };
  const temporary = new Map(), documents = new Map(), pending = new Map(), tracked = new WeakSet(), snapshots = new Map(), preparations = new Map(), mediaStatus = new Map();
  const mediaScript = `(() => {
    if (!navigator.mediaDevices || window.__freeAgentMediaStatus) return;
    const tracks = new Set(), original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function(constraints) {
      const stream = await original(constraints);
      for (const track of stream.getTracks()) { tracks.add(track); track.addEventListener('ended', () => tracks.delete(track), {once:true}); }
      return stream;
    };
    Object.defineProperty(window,'__freeAgentMediaStatus',{value:()=>({camera:[...tracks].some(t=>t.kind==='video'&&t.readyState==='live'),microphone:[...tracks].some(t=>t.kind==='audio'&&t.readyState==='live')})});
  })()`;
  const mediaPending = new Set();
  const mediaPoll = setInterval(() => {
    for (const wc of getTabs()) {
      if (wc.isDestroyed() || wc.isLoadingMainFrame() || mediaPending.has(wc.id) || !publicUrl(wc.getURL())) continue;
      mediaPending.add(wc.id);
      void wc.executeJavaScript('window.__freeAgentMediaStatus?.() || {camera:false,microphone:false}').then(status => {
        if (disposed || wc.isDestroyed()) return;
        const safe = { camera: status?.camera === true, microphone: status?.microphone === true };
        if (JSON.stringify(mediaStatus.get(wc.id)) !== JSON.stringify(safe)) { mediaStatus.set(wc.id, safe); changed(); }
      }).catch(() => {}).finally(() => mediaPending.delete(wc.id));
    }
  }, 1000); mediaPoll.unref();
  let disposed = false, blocker = null, blockerError = '', blocked = 0;
  function persist() {
    fs.mkdirSync(dataDirectory, { recursive: true });
    const temp = file + '.tmp'; fs.writeFileSync(temp, JSON.stringify({ ...saved, version: 1 }), { mode: 0o600 }); fs.renameSync(temp, file);
  }
  const originOf = url => { if (!publicUrl(url)) throw Error('Origem de site inválida.'); return new URL(url).origin; };
  const active = () => { const wc = getActive(); if (!wc || wc.isDestroyed() || !publicUrl(wc.getURL())) throw Error('Abra uma página pública primeiro.'); return wc; };
  const key = (origin, resource) => origin + '|' + resource;
  function decision(wc, origin, resource) {
    const t = temporary.get(key(origin, resource));
    if (t && (t.decision !== 'once' || t.document === documents.get(wc.id))) return t.decision;
    return saved.permissions[origin]?.[resource] || 'ask';
  }
  function allowed(wc, origin, resource) { return ['once', 'session', 'always'].includes(decision(wc, origin, resource)); }
  function set(origin, resource, value, wc) {
    origin = originOf(origin);
    if (!RESOURCES.includes(resource) || !DECISIONS.includes(value)) throw Error('Permissão inválida.');
    temporary.delete(key(origin, resource));
    const row = saved.permissions[origin] || {};
    delete row[resource];
    if (['always', 'block'].includes(value)) row[resource] = value;
    else if (value !== 'ask') temporary.set(key(origin, resource), { decision: value, document: wc ? documents.get(wc.id) : null });
    if (Object.keys(row).length) saved.permissions[origin] = row; else delete saved.permissions[origin];
    // Revoking camera/microphone stops ongoing tracks by replacing the document.
    if (['ask', 'block'].includes(value)) for (const tab of getTabs()) {
      if (!tab.isDestroyed() && publicUrl(tab.getURL()) && new URL(tab.getURL()).origin === origin) {
        snapshots.delete(tab.id);
        if (['camera', 'microphone'].includes(resource)) tab.reload();
      }
    }
    persist(); changed();
  }
  function request(wc, resources, callback, requestedOrigin) {
    let origin; try { origin = originOf(requestedOrigin || wc.getURL()); } catch { callback(false); return; }
    if (resources.some(r => decision(wc, origin, r) === 'block')) { callback(false); return; }
    if (resources.every(r => allowed(wc, origin, r))) { callback(true); return; }
    const doc = documents.get(wc.id), identity = `${wc.id}|${doc}|${origin}|${resources.slice().sort().join(',')}`;
    const existing = [...pending.values()].find(p => p.identity === identity);
    if (existing) { existing.callbacks.push(callback); return; }
    if (pending.size >= 16) { callback(false); return; }
    const id = randomUUID();
    const entry = { id, wc, origin, resources, document: doc, identity, callbacks: [callback] };
    entry.timer = setTimeout(() => finish(entry, 'deny'), 60000); entry.timer.unref(); pending.set(id, entry); changed();
  }
  function finish(entry, value) {
    if (!pending.delete(entry.id)) return;
    clearTimeout(entry.timer);
    const current = !disposed && !entry.wc.isDestroyed() && documents.get(entry.wc.id) === entry.document;
    if (current && DECISIONS.includes(value)) for (const r of entry.resources) set(entry.origin, r, value, entry.wc);
    const granted = current && ['once', 'session', 'always'].includes(value);
    for (const callback of entry.callbacks) callback(granted); changed();
  }
  const resourcesFor = (permission, details = {}) => {
    if (permission === 'media') return (details.mediaTypes?.length ? details.mediaTypes : [details.mediaType]).flatMap(t => t === 'video' ? ['camera'] : t === 'audio' ? ['microphone'] : ['camera', 'microphone']);
    return ['geolocation', 'geolocation-approximate'].includes(permission) ? ['geolocation'] : permission === 'notifications' ? ['notifications'] : [];
  };
  session.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    if (!wc || wc.isDestroyed() || !getTabs().includes(wc) || !publicUrl(wc.getURL())) return false;
    if (permission === 'fullscreen') return wc === getActive() && publicUrl(requestingOrigin);
    const origin = new URL(wc.getURL()).origin;
    try { if (new URL(requestingOrigin).origin !== origin) return false; } catch { return false; }
    const resources = resourcesFor(permission, details); return resources.length > 0 && resources.every(r => allowed(wc, origin, r));
  });
  session.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (permission === 'fullscreen') { callback(!!wc && wc === getActive() && publicUrl(wc.getURL()) && publicUrl(details.requestingUrl || wc.getURL())); return; }
    const resources = resourcesFor(permission, details);
    if (!wc || wc.isDestroyed() || wc !== getActive() || !resources.length) { callback(false); return; }
    try { if (originOf(details.requestingUrl || wc.getURL()) !== originOf(wc.getURL())) { callback(false); return; } } catch { callback(false); return; }
    request(wc, [...new Set(resources)], callback);
  });
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  function track(wc) {
    if (tracked.has(wc)) return; tracked.add(wc); documents.set(wc.id, randomUUID());
    preparations.set(wc.id, (async () => {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Page.enable');
      await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: mediaScript });
    })().catch(() => {}));
    wc.on('did-start-navigation', (_event, _url, inPlace, main) => {
      if (!main || inPlace) return;
      documents.set(wc.id, randomUUID()); snapshots.delete(wc.id);
      for (const p of [...pending.values()]) if (p.wc === wc) finish(p, 'deny');
    });
    wc.on('destroyed', () => { preparations.delete(wc.id); mediaStatus.delete(wc.id); snapshots.delete(wc.id); documents.delete(wc.id); for (const p of [...pending.values()]) if (p.wc === wc) finish(p, 'deny'); });
    wc.on('did-finish-load', () => { void cosmetics(wc); void wc.executeJavaScript(mediaScript).catch(() => {}); });
  }
  const enabledFor = url => { try { return saved.blocker.enabled && !saved.blocker.exceptions.includes(new URL(url).origin); } catch { return false; } };
  let Request, bundle, updating = false, scriptsApplied = 0;
  function cosmeticRules(event, dom) {
    const wc=event.sender, frame=event.senderFrame;
    if(disposed||!frame||!getTabs().includes(wc)||wc.isDestroyed()||!blocker||!publicUrl(frame.url))return {active:false};
    const top=frame===wc.mainFrame?frame.url:wc.getURL();
    if(!enabledFor(top))return {active:false};
    const u=new URL(frame.url);
    const safe={};for(const key of ['classes','ids','hrefs'])safe[key]=Array.isArray(dom?.[key])?dom[key].filter(v=>typeof v==='string'&&v.length<=300).slice(0,150):[];
    const result=blocker.getCosmeticsFilters({url:u.href,hostname:u.hostname,domain:getDomain(u.hostname).domain||u.hostname,...safe,getBaseRules:!dom,getInjectionRules:!dom,getExtendedRules:false,getRulesFromDOM:!!dom,getRulesFromHostname:!dom});
    scriptsApplied+=result.scripts.length;
    return {active:result.active,styles:result.styles,scripts:result.scripts};
  }
  const initialRules=event=>{try{event.returnValue=cosmeticRules(event)}catch{event.returnValue={active:false}}};
  ipcMain.on('fa-browser:adblock-rules',initialRules);
  ipcMain.handle('fa-browser:adblock-dom',(event,dom)=>cosmeticRules(event,dom));
  const preloadId=session.registerPreloadScript({type:'frame',filePath:path.join(__dirname,'browser-content-preload.js')});
  const ready = Promise.resolve().then(() => {
    const lib = require('@ghostery/adblocker'); Request = lib.Request;
    bundle=filterAssets.load(dataDirectory);blocker=filterAssets.engine(lib,bundle);changed();
  }).catch(() => { blockerError = 'Bloqueador indisponível: pacote de filtros inválido ou ausente.'; changed(); });
  function requestDecision(details) {
    if (!blocker || !saved.blocker.enabled || details.resourceType==='mainFrame') return {};
    const wc = getTabs().find(w => w.id === details.webContentsId);
    const source = wc?.getURL() || details.referrer;
    if (!enabledFor(source)) return {};
    const result = blocker.match(Request.fromRawDetails({ url: details.url, sourceUrl: details.referrer || source, type: details.resourceType || 'other' }));
    if(result.exception||!result.match)return {};
    blocked++;
    if(result.redirect?.dataUrl?.startsWith('data:')&&result.redirect.dataUrl.length<1024*1024)return {redirectURL:result.redirect.dataUrl};
    return {cancel:true};
  }
  function shouldBlock(details){const decision=requestDecision(details);return !!(decision.cancel||decision.redirectURL)}
  async function cosmetics(wc) {
    // The isolated session preload injects at document start and follows DOM
    // changes. This fallback supplies stylesheet rules if no preload ran.
    try {
      if (!blocker || wc.isDestroyed() || !publicUrl(wc.getURL()) || !enabledFor(wc.getURL())) return;
      const u=new URL(wc.getURL());const result=blocker.getCosmeticsFilters({url:u.href,hostname:u.hostname,domain:getDomain(u.hostname).domain||u.hostname,getBaseRules:true,getInjectionRules:false,getExtendedRules:false,getRulesFromDOM:false,getRulesFromHostname:true});
      if(result.styles)await wc.insertCSS(result.styles,{cssOrigin:'user'});
    }catch{}
  }
  function controlsState() {
    const permissions = JSON.parse(JSON.stringify(saved.permissions));
    const wc = getActive();
    for (const [k, t] of temporary) {
      const i = k.lastIndexOf('|'), origin = k.slice(0, i), resource = k.slice(i + 1);
      if (t.decision === 'once' && (!wc || t.document !== documents.get(wc.id))) continue;
      (permissions[origin] ||= {})[resource] = t.decision;
    }
    return { permissions, media: mediaStatus.get(wc?.id) || {camera:false,microphone:false}, pending: [...pending.values()].map(p => ({ id: p.id, origin: p.origin, resources: p.resources })),
      extensions: saved.extensions.map(({ id, name, version, enabled, error }) => ({ id, name, version, enabled, error })),
      blocker: { ...saved.blocker, available: !!blocker, blocked, updating, scriptsApplied, revision:bundle?.commit,updatedAt:bundle?.fetchedAt,status: blockerError || (blocker ? 'Ghostery 2.20.1 · filtros específicos, scripts e proteção de rede' : 'Carregando filtros…') } };
  }
  async function loadExtension(entry) {
    try {
      const extension = await session.extensions.loadExtension(entry.path, { allowFileAccess: false });
      Object.assign(entry, { id: extension.id, name: extension.name, version: extension.version, enabled: true, error: '' });
    } catch (error) { entry.enabled = false; entry.error = 'Extensão incompatível ou pasta indisponível.'; }
  }
  const extensionsReady = (async () => { for (const entry of saved.extensions) if (entry.enabled) await loadExtension(entry); })();
  function ensureAI(wc) {
    const origin = originOf(wc.getURL());
    if (!allowed(wc, origin, 'ai')) { request(wc, ['ai'], () => {}); throw Error('Autorize o acesso da IA neste site e repita a operação.'); }
  }
  async function evaluate(wc, expression) {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    const { frameTree } = await wc.debugger.sendCommand('Page.getFrameTree');
    const { executionContextId } = await wc.debugger.sendCommand('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'free-agent-browser-observation', grantUniveralAccess: false });
    const result = await wc.debugger.sendCommand('Runtime.evaluate', { expression, contextId: executionContextId, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description?.split('\n')[0] || 'A página mudou; observe novamente.');
    return result.result.value;
  }
  async function observe(wc, options = {}) {
    ensureAI(wc);
    const offset = Math.max(0, Math.min(160, Math.floor(Number(options.offset) || 0)));
    const textOffset = Math.max(0, Math.min(500000, Math.floor(Number(options.textOffset) || 0)));
    const token = randomUUID(), documentId = documents.get(wc.id), url = wc.getURL();
    const value = await evaluate(wc, `(() => {
      if (globalThis.__faObserver) globalThis.__faObserver.disconnect();
      const nodes = [...document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(e => {
        const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&s.visibility==='visible'&&s.display!=='none'&&e.type!=='hidden'&&e.type!=='password';
      }).slice(0,160);
      const fingerprint=e=>JSON.stringify([e.tagName,e.type||'',e.getAttribute('aria-label')||e.labels?.[0]?.innerText||e.innerText||e.placeholder||'',e.getAttribute('href')||'']);
      globalThis.__faSnapshot={token:${JSON.stringify(token)},nodes,dirty:false,fingerprint,signatures:nodes.map(fingerprint)};
      globalThis.__faObserver=new MutationObserver(()=>{globalThis.__faSnapshot.dirty=true});
      globalThis.__faObserver.observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
      const copy=document.body?.cloneNode(true); copy?.querySelectorAll('script,style,noscript,input,textarea,[contenteditable]').forEach(e=>e.remove());
      const full=(copy?.innerText||copy?.textContent||'').replace(/\\s+/g,' ').slice(0,512000);
      return {title:document.title,text:full.slice(${textOffset},${textOffset}+12000),nextTextOffset:full.length>${textOffset}+1000?${textOffset}+1000:null,nextOffset:nodes.length>${offset}+12?${offset}+12:null,elements:nodes.map((e,i)=>{const r=e.getBoundingClientRect();return {id:String(i),tag:e.tagName.toLowerCase(),role:e.getAttribute('role')||'',name:(e.getAttribute('aria-label')||e.labels?.[0]?.innerText||e.innerText||e.placeholder||'').slice(0,180),type:e.type||'',bounds:{x:r.x,y:r.y,width:r.width,height:r.height}}}).slice(${offset},${offset}+12),scrollY:window.scrollY};
    })()`);
    if (wc.isDestroyed() || documents.get(wc.id) !== documentId || wc.getURL() !== url) throw Error('A página mudou; observe novamente.');
    snapshots.set(wc.id, { token, documentId, url, created: Date.now() });
    return { ...value, observation: token, url, untrustedContent: true, verified: true };
  }
  async function action(wc, p) {
    ensureAI(wc);
    const snapshot = snapshots.get(wc.id);
    if (!snapshot || p.observation !== snapshot.token || snapshot.documentId !== documents.get(wc.id) || snapshot.url !== wc.getURL() || Date.now() - snapshot.created > 120000) throw Error('Observação expirada; observe a página novamente.');
    if (!['click', 'fill', 'scroll'].includes(p.action)) throw Error('Ação inválida.');
    if (p.action === 'fill' && (typeof p.text !== 'string' || p.text.length > 8192)) throw Error('Texto inválido.');
    if (p.expectedText !== undefined && (typeof p.expectedText !== 'string' || !p.expectedText.trim() || p.expectedText.length > 300)) throw Error('Resultado esperado inválido.');
    const evidence = await evaluate(wc, `(() => {
      const s=globalThis.__faSnapshot;if(!s||s.token!==${JSON.stringify(p.observation)})throw Error('A página mudou; observe novamente.');
      const before={url:location.href,title:document.title,text:document.body.innerText.slice(0,16000),y:scrollY};
      if(${JSON.stringify(p.action)}==='scroll') { scrollBy(0,${Math.max(-2000,Math.min(2000,Number(p.deltaY)||600))});return {before}; }
      const index=${JSON.stringify(String(p.element || ''))},e=s.nodes[index];if(!e||!e.isConnected||e.disabled||e.type==='password'||s.fingerprint(e)!==s.signatures[index])throw Error('Elemento mudou; observe novamente.');
      e.scrollIntoView({block:'center',inline:'center'});e.focus();const r=e.getBoundingClientRect();
      if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)!==e&&!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw Error('Elemento coberto.');
      if(${JSON.stringify(p.action)}==='fill') { if(!['INPUT','TEXTAREA'].includes(e.tagName)||e.readOnly||['file','password','hidden'].includes(e.type))throw Error('Campo não editável.'); e.select(); }
      return {before,x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    snapshots.delete(wc.id);
    if (p.action === 'click') {
      const zoom = wc.getZoomFactor();
      wc.sendInputEvent({ type: 'mouseDown', x: Math.round(evidence.x * zoom), y: Math.round(evidence.y * zoom), button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: Math.round(evidence.x * zoom), y: Math.round(evidence.y * zoom), button: 'left', clickCount: 1 });
    } else if (p.action === 'fill') await wc.insertText(p.text);
    await new Promise(resolve => setTimeout(resolve, 180));
    if (!allowed(wc, originOf(wc.getURL()), 'ai')) return { performed: true, verified: false, reason: 'Destino precisa de autorização própria.' };
    const after = await evaluate(wc, `({url:location.href,title:document.title,text:document.body.innerText.slice(0,16000),y:scrollY,value:document.activeElement?.type==='password'?null:document.activeElement?.value})`);
    const observedChange = after.url !== evidence.before.url || after.title !== evidence.before.title || after.text !== evidence.before.text;
    // A clock/ad animation is not evidence that the clicked control succeeded.
    const verified = p.action === 'fill' ? after.value === p.text : p.action === 'scroll' ? after.y !== evidence.before.y : after.url !== evidence.before.url || typeof p.expectedText === 'string' && !evidence.before.text.includes(p.expectedText) && after.text.includes(p.expectedText);
    const observation = await observe(wc);
    return { performed: true, verified, observedChange, reason: verified ? 'Resultado conferido na página.' : 'Comando enviado; efeito pretendido não confirmado. Use expectedText para uma confirmação específica.', observation };
  }
  async function command(cmd, p = {}) {
    if (cmd === 'normalize') return { url: navigation(p.value) };
    if (cmd === 'permission-answer') { const entry = pending.get(p.id); if (!entry || !DECISIONS.includes(p.decision) || p.decision === 'ask') throw Error('Pedido de permissão expirado.'); finish(entry, p.decision); return; }
    if (cmd === 'permission-set') { set(p.origin, p.resource, p.decision, getActive()); return; }
    if (cmd === 'blocker-update') {
      if (updating) throw Error('Atualização de filtros já em andamento.');
      updating = true; blockerError = ''; changed();
      // Keep navigation and input responsive while bounded downloads run.
      void (async () => {
        const next = await filterAssets.download();
        if (disposed) return;
        const engine = filterAssets.engine(require('@ghostery/adblocker'), next);
        filterAssets.save(dataDirectory, next); bundle = next; blocker = engine;
      })().catch(() => { blockerError = 'Atualização falhou; os filtros anteriores foram preservados.'; })
        .finally(() => { updating = false; if (!disposed) changed(); });
      return;
    }
    if (cmd === 'blocker-set') {
      if (typeof p.enabled !== 'boolean') throw Error('Configuração inválida.');
      if (p.origin) { const origin = originOf(p.origin); saved.blocker.exceptions = saved.blocker.exceptions.filter(x => x !== origin); if (!p.enabled) saved.blocker.exceptions.push(origin); }
      else saved.blocker.enabled = p.enabled;
      persist(); changed(); return;
    }
    if (cmd.startsWith('extension-')) {
      if (!pickExtension) throw Error('Gerencie extensões no executável.');
      await extensionsReady;
      if (cmd === 'extension-load') {
        if (saved.extensions.length >= 20) throw Error('Limite de vinte extensões.');
        const folder = await pickExtension(); if (!folder) return;
        const real = fs.realpathSync(folder), manifestFile = path.join(real, 'manifest.json');
        if (fs.statSync(manifestFile).size > 512000) throw Error('Manifesto muito grande.');
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        if (!manifest.name || ![2, 3].includes(manifest.manifest_version)) throw Error('Manifesto de extensão inválido.');
        // Extension networking must not create a second, conflicting adblock implementation.
        if ((manifest.permissions || []).some(x => ['webRequest', 'webRequestBlocking', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess'].includes(x))) throw Error('Esta extensão exige APIs de rede que conflitam com o isolamento. Use o bloqueador integrado.');
        if (saved.extensions.some(x => x.path === real)) throw Error('Esta pasta já está cadastrada.');
        const entry = { id: randomUUID(), path: real, name: String(manifest.name), version: String(manifest.version || ''), enabled: true };
        await loadExtension(entry); saved.extensions.push(entry);
      } else {
        const entry = saved.extensions.find(x => x.id === p.id); if (!entry) throw Error('Extensão inexistente.');
        if (cmd === 'extension-remove' || p.enabled === false) { if (entry.enabled) session.extensions.removeExtension(entry.id); entry.enabled = false; }
        else if (cmd === 'extension-set' && p.enabled === true) await loadExtension(entry);
        else throw Error('Configuração inválida.');
        if (cmd === 'extension-remove') saved.extensions.splice(saved.extensions.indexOf(entry), 1);
      }
      persist(); changed(); return;
    }
    const wc = active(); track(wc);
    if (cmd === 'selection') return { text: await evaluate(wc, `String(getSelection()).slice(0,12000)`), url: wc.getURL() };
    if (cmd === 'ai-stop') { set(originOf(wc.getURL()), 'ai', 'block', wc); return; }
    if (cmd === 'observe') return observe(wc, p);
    if (cmd === 'agent-action') return action(wc, p);
    if (cmd === 'agent-navigate') {
      ensureAI(wc); const url = navigation(p.value);
      await wc.loadURL(url); return observe(wc);
    }
    if (cmd === 'capture') { ensureAI(wc); const image = await wc.capturePage(); const size = image.getSize(), resized = size.width > 1280 ? image.resize({ width: 1280 }) : image; return { url: wc.getURL(), size: resized.getSize(), mime: 'image/jpeg', data: resized.toJPEG(65).toString('base64'), verified: true }; }
    throw Error('Comando de controle inválido.');
  }
  return { ready, track, prepare: wc => preparations.get(wc.id) || Promise.resolve(), command, state: controlsState, shouldBlock, requestDecision, dispose() { if(disposed)return; disposed = true; session.unregisterPreloadScript(preloadId);ipcMain.removeListener('fa-browser:adblock-rules',initialRules);ipcMain.removeHandler('fa-browser:adblock-dom'); clearInterval(mediaPoll); for (const entry of [...pending.values()]) finish(entry, 'deny'); persist(); } };
}
module.exports = { createBrowserControls, CONTROL_COMMANDS: COMMANDS };
