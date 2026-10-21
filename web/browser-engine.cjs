'use strict';

const { chromium } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createBrowserNetwork } = require('../desktop/browser-network');
const { navigation, publicUrl } = require('../desktop/browser-policy');

const DIAGNOSTIC = 'Visualização interativa; transmissão de áudio indisponível.';
const LIMITATIONS = ' Downloads bloqueados nesta versão; service workers desativados por isolamento de rede.';

function createBrowserEngine(options, notify, frame) {
  const workspace = path.resolve(__dirname, '..');
  const profileDir = path.resolve(options.profileDir || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'FreeAgent', 'browser-web'));
  const relative = path.relative(workspace, profileDir);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('O perfil do navegador deve ficar fora do workspace.');
  }
  const restoreFile = path.join(profileDir, 'free-agent-tabs.json');
  const tabs = new Map();
  const closeTimers = new Set();
  const attaching = new WeakMap();
  let context, network, launching, activeId = null, closing = false, controller = null, controlEpoch = 0;
  let diagnostic = DIAGNOSTIC + ' Navegador ainda não iniciado.' + LIMITATIONS;
  let viewport = { width: 1000, height: 700 };
  let streamQueue = Promise.resolve(), saveQueue = Promise.resolve();
  async function releaseInput(t) {
    if (!t?.cdp) return;
    const releases = [];
    for (const key of t.heldKeys?.values() || []) releases.push(t.cdp.send('Input.dispatchKeyEvent', { ...key, type: 'keyUp', text: undefined, modifiers: 0 }).catch(() => {}));
    t.heldKeys?.clear();
    for (const [bit, button] of [[1, 'left'], [2, 'right'], [4, 'middle']]) {
      if (t.heldButtons & bit) releases.push(t.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button, buttons: 0, x: t.mouseX || 0, y: t.mouseY || 0, clickCount: 1 }).catch(() => {}));
    }
    t.heldButtons = 0;
    await Promise.all(releases);
  }
  function state() {
    return { tabs: [...tabs.values()].map(t => ({ id: t.id, title: t.title, url: t.url,
      loading: t.loading, error: t.error, canGoBack: t.canGoBack, canGoForward: t.canGoForward })),
    activeId, downloads: [], engine: 'web', connected: Boolean(context), diagnostic, capabilities: { audio: false, transport: 'jpeg' } };
  }
  function emit() { notify(state()); }
  function save() {
    const body = JSON.stringify({ urls: [...tabs.values()].map(t => t.url).filter(publicUrl) });
    saveQueue = saveQueue.catch(() => {}).then(() => fs.writeFile(restoreFile, body, { mode: 0o600 })).catch(() => {});
    return saveQueue;
  }
  async function update(t) {
    if (!tabs.has(t.id)) return;
    const owner = t.page.context();
    const previousUrl = t.url;
    const actualUrl = t.page.url();
    if (publicUrl(actualUrl) || actualUrl === 'about:blank') t.url = actualUrl;
    try {
      t.title = (await t.page.title()).slice(0, 1024);
      const h = await t.cdp.send('Page.getNavigationHistory');
      if (actualUrl.startsWith('chrome-error:')) {
        const attempted = h.entries[h.currentIndex]?.url;
        if (publicUrl(attempted)) t.url = attempted;
        t.error = 'Página indisponível. Use atualizar para tentar novamente.';
      }
      t.canGoBack = h.currentIndex > 0;
      t.canGoForward = h.currentIndex < h.entries.length - 1;
    } catch { /* A closing or navigating page may briefly have no execution context. */ }
    if (closing || context !== owner || tabs.get(t.id) !== t || t.page.isClosed()) return;
    emit();
    if (!closing && previousUrl !== t.url) void save();
  }
  function syncStream() {
    streamQueue = streamQueue.catch(() => {}).then(async () => {
      for (const t of tabs.values()) {
        const wanted = Boolean(controller && controller.visible && t.id === activeId && !t.page.isClosed());
        if (t.streaming && !wanted) {
          t.streaming = false;
          await t.cdp.send('Page.stopScreencast').catch(() => {});
        }
        if (wanted && !t.streaming) {
          try {
            await t.page.bringToFront();
            t.streaming = true;
            await t.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 65,
              maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 1 });
          } catch { t.streaming = false; }
        }
      }
    }).catch(() => {});
    return streamQueue;
  }
  function attach(page) {
    if (!attaching.has(page)) attaching.set(page, attachPage(page));
    return attaching.get(page);
  }
  async function attachPage(page) {
    const existing = [...tabs.values()].find(t => t.page === page);
    if (existing) return existing;
    if (closing || tabs.size >= 16) { await page.close(); throw new Error('Limite de 16 abas.'); }
    const t = { id: randomUUID(), page, title: '', url: page.url(), loading: false, error: null,
      canGoBack: false, canGoForward: false, streaming: false, lastFrame: 0, heldKeys: new Map(), heldButtons: 0 };
    // Reserve a slot before awaiting CDP, including simultaneous popups.
    tabs.set(t.id, t);
    try {
      await page.setViewportSize(viewport); t.cdp = await page.context().newCDPSession(page); await t.cdp.send('Page.enable');
      // Persistent Chrome window geometry can survive a restart independently
      // of Playwright's emulated viewport. Keep the captured surface in sync.
      await t.cdp.send('Emulation.setVisibleSize', viewport).catch(() => {});
    }
    catch (error) { tabs.delete(t.id); await page.close().catch(() => {}); throw error; }
    if (!activeId) activeId = t.id;
    t.cdp.on('Page.screencastFrame', e => {
      t.receivedFrames = (t.receivedFrames || 0) + 1;
      // Always acknowledge, including throttled, stale and backpressured frames.
      void t.cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
      const now = Date.now();
      if (!t.streaming || !controller?.visible || activeId !== t.id || now - t.lastFrame < 1000 / 12) return;
      // CDP may deliver an old-size frame just after a viewport change. Read JPEG SOF dimensions.
      const dimensions = jpegDimensions(Buffer.from(e.data, 'base64'));
      t.lastDimensions = dimensions;
      if (!dimensions) return;
      if (dimensions.width !== viewport.width || dimensions.height !== viewport.height) {
        // Windows persistent profiles can restore an outer window matching
        // the requested viewport, leaving its captured content 18/96px smaller.
        // Correct the actual browser window rather than stretching coordinates.
        if (!t.fixingSurface && (t.surfaceFixes || 0) < 6) {
          t.fixingSurface = true; t.surfaceFixes = (t.surfaceFixes || 0) + 1;
          void (async () => {
            const { windowId, bounds } = await t.cdp.send('Browser.getWindowForTarget');
            await t.cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
            await t.cdp.send('Browser.setWindowBounds', { windowId, bounds: {
              width: Math.max(300, bounds.width + viewport.width - dimensions.width),
              height: Math.max(200, bounds.height + viewport.height - dimensions.height)
            } });
          })().catch(() => {}).finally(async () => {
            // Ignore in-flight old-size frames while the compositor settles.
            await new Promise(resolve => setTimeout(resolve, 300));
            t.fixingSurface = false;
          });
        }
        if (!t.fixingSurface && t.surfaceFixes >= 6 && !t.surfaceError) {
          t.surfaceError = true;
          t.error = 'Não foi possível ajustar a imagem da aba. Recolha e reabra a gaveta para tentar novamente.';
          emit();
        }
        return;
      }
      if (t.surfaceError) { t.surfaceError = false; t.error = null; emit(); }
      t.lastFrame = now;
      frame(controller.socket, { type: 'frame', tabId: t.id, data: e.data, ...dimensions, sentAt: now });
    });
    t.cdp.on('Page.frameStartedLoading', () => { t.loading = true; emit(); });
    t.cdp.on('Page.frameStoppedLoading', () => { t.loading = false; void update(t); });
    t.cdp.on('Page.navigatedWithinDocument', () => void update(t));
    page.on('domcontentloaded', () => void update(t));
    page.on('load', () => { t.loading = false; void update(t); });
    page.on('framenavigated', f => {
      const url = f.url();
      if (url !== 'about:blank' && !publicUrl(url) && !url.startsWith('about:srcdoc')) {
        t.error = 'Navegação não pública bloqueada.';
        void t.cdp.send('Page.stopLoading').catch(() => {});
        if (f === page.mainFrame()) void page.close().catch(() => {});
      }
      if (f === page.mainFrame()) void update(t);
    });
    page.on('download', download => { void download.cancel().catch(() => {}); t.error = 'Downloads bloqueados nesta versão.'; emit(); });
    page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
    page.on('crash', () => { t.loading = false; t.error = 'A aba falhou; feche-a e crie outra.'; emit(); });
    page.on('close', () => {
      tabs.delete(t.id);
      void t.cdp.detach().catch(() => {});
      if (activeId === t.id) activeId = tabs.keys().next().value || null;
      if (!closing) {
        // A browser disconnect closes every page before context.close fires.
        // Do not overwrite the recovery snapshot with that transient empty set.
        const owner = page.context();
        const timer = setTimeout(() => { closeTimers.delete(timer); if (context === owner && !closing) void save(); }, 250);
        closeTimers.add(timer); timer.unref();
        emit(); void syncStream();
      }
    });
    await update(t);
    void syncStream();
    return t;
  }
  async function ensure() {
    if (closing) throw new Error('Serviço encerrando.');
    if (context) return;
    if (launching) return launching;
    launching = (async () => {
      await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
      network = createBrowserNetwork();
      const proxyPort = await network.start();
      const settings = { headless: true, chromiumSandbox: true, viewport, deviceScaleFactor: 1,
        acceptDownloads: false, serviceWorkers: 'block', permissions: [],
        proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: '<-loopback>' },
        args: ['--webrtc-ip-handling-policy=disable_non_proxied_udp', '--mute-audio'] };
      const candidates = process.env.FA_BROWSER_EXECUTABLE ? [{ executablePath: process.env.FA_BROWSER_EXECUTABLE }] : [{ channel: 'chrome' }, {}];
      let launched;
      for (const candidate of candidates) {
        try { launched = await chromium.launchPersistentContext(profileDir, { ...settings, ...candidate }); break; }
        catch { /* Fall back from installed Chrome to Playwright Chromium. Never log launch arguments. */ }
      }
      if (!launched) throw new Error('Navegador indisponível. Instale Chrome ou execute: npx playwright-core install chromium');
      context = launched;
      context.setDefaultTimeout(10000);
      context.setDefaultNavigationTimeout(20000);
      context.on('close', () => {
        if (context !== launched) return;
        context = null; tabs.clear(); activeId = null;
        network?.close(); network = null;
        if (!closing) { diagnostic = DIAGNOSTIC + ' Navegador desconectado; crie uma aba para reiniciar.' + LIMITATIONS; emit(); }
      });
      await context.clearPermissions();
      // Single route guard applies to all pages, frames and redirects. SW are blocked above.
      // fixture is an export-only test hook restricted to one synthetic HTTPS origin.
      await context.route('**/*', async route => {
        const request = route.request(), url = request.url();
        try {
          if (options.fixture && new URL(url).origin === 'https://fixture.test') {
            await options.fixture(route, request); return;
          }
          if (publicUrl(url)) { await route.continue(); return; }
          if (!request.isNavigationRequest() && /^(data:|blob:)/.test(url) && publicUrl(request.frame().url())) {
            await route.continue(); return;
          }
          await route.abort('blockedbyclient');
        } catch { await route.abort('blockedbyclient').catch(() => {}); }
      });
      // Browser sockets still use the pinned proxy; reject non-public WS URLs before connecting.
      if (context.routeWebSocket) await context.routeWebSocket('**/*', ws => {
        if (publicUrl(ws.url(), true)) ws.connectToServer(); else ws.close();
      });
      context.on('page', page => { const epoch = controlEpoch; void attach(page).then(async t => {
        if (await page.opener()) {
          if (epoch === controlEpoch) {
            await releaseInput(tabs.get(activeId));
            if (epoch === controlEpoch) activeId = t.id;
          }
          // Initial popup requests can precede target interception. Retry once
          // through the fully attached page; never retry a continuing failure.
          if (page.url().startsWith('chrome-error:') && publicUrl(t.url)) void go(t, t.url);
          await syncStream(); emit();
        }
      }).catch(() => {}); });
      let restored = [];
      try { restored = JSON.parse(await fs.readFile(restoreFile, 'utf8')).urls || []; } catch { /* First launch. */ }
      for (const page of context.pages()) {
        if (page.url() === 'about:blank') await page.close(); else await attach(page);
      }
      for (const url of (Array.isArray(restored) ? restored : []).filter(url => publicUrl(url)).slice(0, 16 - tabs.size)) {
        const t = await attach(await context.newPage());
        void go(t, url);
      }
      diagnostic = DIAGNOSTIC + LIMITATIONS; emit();
    })().catch(async error => {
      const failed = context; context = null;
      await failed?.close().catch(() => {});
      tabs.clear(); activeId = null; network?.close(); network = null;
      diagnostic = DIAGNOSTIC + ' ' + error.message + LIMITATIONS; emit(); throw error;
    }).finally(() => { launching = null; });
    return launching;
  }
  async function go(t, url) {
    t.error = null; t.loading = true; emit();
    try { await t.page.goto(url, { waitUntil: 'domcontentloaded' }); }
    catch { if (tabs.has(t.id)) t.error = 'Falha ao carregar a página (destino bloqueado ou indisponível).'; }
    finally { t.loading = false; await update(t); }
  }
  async function command(command, p, socket) {
    if (command === 'state') {
      if (!context && !launching && !closing) {
        try { const saved = JSON.parse(await fs.readFile(restoreFile, 'utf8')); if (saved.urls?.length) await ensure(); } catch {}
      }
      return state();
    }
    if (command === 'external') throw new Error('Abertura externa indisponível no navegador web.');
    if (command === 'layout') {
      if (controller?.socket !== socket) return state();
      const reactivated = p.visible && !controller.visible;
      if (!p.visible) await releaseInput(tabs.get(activeId));
      controller.visible = p.visible;
      if (reactivated) {
        const current = tabs.get(activeId);
        if (current) { current.surfaceFixes = 0; if (current.surfaceError) { current.surfaceError = false; current.error = null; } }
      }
      const next = { width: Math.max(240, Math.min(1920, Math.round(p.width || viewport.width))), height: Math.max(160, Math.min(1200, Math.round(p.height || viewport.height))) };
      if (next.width !== viewport.width || next.height !== viewport.height) {
        controller.visible = false; await syncStream(); viewport = next;
        for (const t of tabs.values()) {
          t.surfaceFixes = 0;
          await t.page.setViewportSize(viewport);
          await t.cdp.send('Emulation.setVisibleSize', viewport).catch(() => {});
        }
        controller.visible = p.visible;
      }
      await syncStream(); return state();
    }
    if (command === 'create') {
      controlEpoch++;
      const target = navigation(p.url || 'https://www.google.com/');
      await ensure();
      if (tabs.size >= 16) throw new Error('Limite de 16 abas.');
      await releaseInput(tabs.get(activeId));
      const t = await attach(await context.newPage()); activeId = t.id;
      await t.page.setViewportSize(viewport); await syncStream();
      void go(t, target);
      emit(); return state();
    }
    const t = tabs.get(command === 'activate' || command === 'close' ? p.id : activeId);
    if (!t) throw new Error('Aba inexistente.');
    if (command === 'activate') { controlEpoch++; await releaseInput(tabs.get(activeId)); activeId = t.id; await syncStream(); }
    else if (command === 'close') { controlEpoch++; await releaseInput(t); await t.page.close(); await save(); }
    else if (command === 'navigate') { const url = navigation(p.value); void go(t, url); }
    else if (command === 'stop') { await t.cdp.send('Page.stopLoading'); t.loading = false; }
    else if (command === 'reload' || command === 'back' || command === 'forward') {
      const method = { reload: 'reload', back: 'goBack', forward: 'goForward' }[command];
      t.error = null;
      void t.page[method]({ waitUntil: 'domcontentloaded' }).then(() => update(t)).catch(() => {
        t.loading = false; t.error = 'Falha de navegação.'; emit();
      });
    } else if (command === 'input') {
      if (!controller?.visible) throw new Error('Visualização oculta.');
      if (p.kind === 'mouse') {
        const { kind, eventType, ...rest } = p;
        await t.cdp.send('Input.dispatchMouseEvent', { ...rest, type: eventType,
          x: Math.max(0, Math.min(viewport.width - 1, p.x)), y: Math.max(0, Math.min(viewport.height - 1, p.y)) });
        t.mouseX = p.x; t.mouseY = p.y;
        const mask = { left: 1, right: 2, middle: 4 }[p.button] || 0;
        if (eventType === 'mousePressed') t.heldButtons |= mask;
        if (eventType === 'mouseReleased') t.heldButtons &= ~mask;
      } else if (p.kind === 'key') {
        const { kind, eventType, ...rest } = p;
        await t.cdp.send('Input.dispatchKeyEvent', { ...rest, type: eventType });
        if (eventType === 'keyDown') t.heldKeys.set(p.code, rest); else t.heldKeys.delete(p.code);
      } else await t.cdp.send('Input.insertText', { text: p.text });
    }
    emit(); return state();
  }
  // Title changes after interaction need not coincide with a load event.
  let polling = false;
  const poll = setInterval(async () => {
    if (polling || closing || !context) return;
    polling = true;
    try { for (const t of tabs.values()) if (t.cdp) await update(t); }
    finally { polling = false; }
  }, 1000);
  poll.unref();
  return { state, command, profileDir,
    debugState: () => ({ visible: controller?.visible, viewport, tabs: [...tabs.values()].map(t => ({ id: t.id, streaming: t.streaming, size: t.page.viewportSize(), receivedFrames: t.receivedFrames, dimensions: t.lastDimensions })) }),
    control(socket) { controller = { socket, visible: false }; void syncStream(); },
    release(socket) { if (controller?.socket === socket) { void releaseInput(tabs.get(activeId)); controller = null; void syncStream(); } },
    async close() {
      closing = true; controller = null; clearInterval(poll);
      for (const timer of closeTimers) clearTimeout(timer);
      closeTimers.clear();
      await launching?.catch(() => {});
      await syncStream();
      if (context) await save();
      await saveQueue;
      for (const t of tabs.values()) await t.cdp.detach().catch(() => {});
      await context?.close().catch(() => {}); context = null;
      network?.close(); network = null;
    }
  };
}

function jpegDimensions(bytes) {
  if (bytes[0] !== 255 || bytes[1] !== 216) return null;
  for (let i = 2; i + 8 < bytes.length;) {
    if (bytes[i] !== 255) return null;
    const marker = bytes[i + 1];
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
    const length = bytes.readUInt16BE(i + 2);
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}
module.exports = { createBrowserEngine };
