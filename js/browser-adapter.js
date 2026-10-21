(() => {
  'use strict';
  const instructions = 'Inicie npm run server OU python serve.py; abra a interface em uma origem autorizada pelo serviço.';
  async function create() {
    const native = window.freeAgentBrowser;
    if (native && typeof native.invoke === 'function' && typeof native.onState === 'function') {
      // A trusted preload identifies the native engine. Slow startup must never
      // attach this window to an unrelated web service or lose early state events.
      const decorate = state => ({ ...state, engine: 'native', connected: true });
      return {
        engine: 'native',
        async invoke(command, payload = {}) {
          const result = await native.invoke(command, payload);
          return command === 'state' ? decorate(result) : result;
        },
        onState(listener) {
          let stopped = false, revision = 0;
          const unsubscribe = native.onState(state => { revision++; if (!stopped) listener(decorate(state)); });
          const initialRevision = revision;
          Promise.resolve(native.invoke('state')).then(state => {
            if (!stopped && revision === initialRevision) listener(decorate(state));
          }, () => {
            if (!stopped && revision === initialRevision) listener({tabs:[],engine:'native',connected:false,diagnostic:'Não foi possível consultar o navegador nativo. Reabra o aplicativo.'});
          });
          return () => { stopped = true; unsubscribe(); };
        },
        mount() {}, dispose() {}
      };
    }
    return createWeb();
  }

  async function createWeb() {
    let serviceOrigin = 'http://127.0.0.1:47812';
    try {
      const response = await fetch('/browser-config.json', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(1000) });
      const config = await response.json();
      if (Number.isInteger(config.browserPort) && config.browserPort >= 1024 && config.browserPort <= 65535) serviceOrigin = `http://127.0.0.1:${config.browserPort}`;
    } catch { /* Python/legacy static servers use the default loopback service. */ }
    let state = { tabs: [], activeId: null, downloads: [], engine: 'web', connected: false, diagnostic: instructions };
    let socket, connecting, disposed = false, sequence = 0, generation = 0;
    let layout = { visible: false, width: 800, height: 600 };
    let layoutReady = false;
    let viewport, canvas, video, surface, keyboardSink, context, overlay, pendingFrame, decoding = false, surfaceEpoch = 0;
    let token = '', pc, stream, mediaGeneration = 0, mediaRetries = 0, retryTimer, mediaTimer, negotiating = false;
    const volume = 1;
    let audioWanted = false;
    let lastSentAt = -Infinity, imageWidth = 0, imageHeight = 0;
    let mouse = { x: 0, y: 0 }, heldButtons = 0, moveTimer, wheelTimer, move, wheel;
    let composing = false;
    const keys = new Map(), listeners = new Set(), pending = new Map(), cleanup = [];
    const adapter = { engine: 'web', invoke, onState, mount, dispose };
    function publish(next = {}) {
      const switched = next.activeId !== undefined && next.activeId !== state.activeId;
      const previousTransport = transport();
      state = { ...state, ...next, engine: 'web', connected: !!(socket && socket.readyState === WebSocket.OPEN && authenticated) };
      const keepAudio = switched && audioWanted && pc?.connectionState === 'connected' && transport() === 'webrtc';
      if (switched) releaseInput();
      if (switched && !keepAudio || previousTransport !== transport() || !state.connected || !state.controlling) {
        releaseInput(); stopMedia(); clearSurface();
        if (switched || previousTransport !== transport()) { mediaRetries = 0; state.mediaError = ''; }
        if (!state.connected || !state.controlling) layoutReady = false;
      }
      updateOverlay();
      for (const listener of listeners) listener({ ...state });
      void startMedia();
    }
    let authenticated = false;
    function clearSurface() {
      surfaceEpoch++;
      pendingFrame = null;
      lastSentAt = -Infinity;
      imageWidth = imageHeight = 0;
      state.mediaReady = false; state.mediaMuted = !audioWanted;
      if (canvas) delete canvas.dataset.frameTab;
      if (video) delete video.dataset.frameTab;
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    }
    function updateOverlay() {
      if (!overlay) return;
      if (canvas) canvas.hidden = transport() !== 'jpeg';
      if (video) video.hidden = transport() !== 'webrtc' || !!state.videoTabId && state.videoTabId !== state.activeId;
      overlay.hidden = !state.activeId || state.tabs.find(t => t.id === state.activeId)?.url === 'about:blank' || state.connected && imageWidth > 0;
      overlay.textContent = !state.connected ? 'Desconectado — use Tentar novamente. ' + instructions
        : state.mediaError || (transport() === 'webrtc' ? 'Conectando mídia da aba ativa…' : transport() === 'jpeg' ? 'Aguardando imagem da aba ativa…' : 'Transporte de mídia indisponível.');
    }
    function transport() { return state.capabilities && state.capabilities.transport || (state.transport === 'jpeg' ? 'jpeg' : ''); }
    function eligible() {
      if (!disposed && state.connected && state.controlling && audioWanted && pc?.connectionState === 'connected' && state.tabs.some(t=>t.id===state.audioTabId)) return true;
      return !disposed && state.connected && state.controlling && layoutReady && layout.visible && !document.hidden
        && layout.width > 0 && layout.height > 0 && state.tabs.some(tab => tab.id === state.activeId && tab.url !== 'about:blank');
    }
    function stopMedia() {
      mediaGeneration++; negotiating = false;
      state.mediaReady = false;
      clearTimeout(retryTimer); clearTimeout(mediaTimer); retryTimer = mediaTimer = null;
      if (pc) { pc.ontrack = pc.onconnectionstatechange = null; pc.close(); pc = null; }
      if (stream) { stream.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = null; }
      if (video) { video.pause(); video.srcObject = null; video.muted = true; delete video.dataset.frameTab; }
    }
    function mediaFailed() {
      stopMedia(); clearSurface();
      publish({ mediaError: 'Mídia WebRTC indisponível. Use Reconectar mídia.', mediaMuted: true });
      if (eligible() && mediaRetries < 2) {
        mediaRetries++;
        retryTimer = setTimeout(() => { retryTimer = null; void startMedia(true); }, 750);
      }
    }
    async function startMedia(retry = false) {
      if (!video || transport() !== 'webrtc' || !eligible() || pc || negotiating || retryTimer || (state.mediaError && !retry)) return;
      if (typeof RTCPeerConnection !== 'function' || typeof MediaStream !== 'function') {
        publish({ mediaError: 'WebRTC indisponível neste navegador.' }); return;
      }
      const epoch = ++mediaGeneration, tabId = state.activeId;
      const current = () => epoch === mediaGeneration && eligible();
      negotiating = true;
      try {
        const peer = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
        pc = peer; stream = new MediaStream(); video.srcObject = stream; video.muted = !audioWanted; video.volume = volume;
        peer.ontrack = event => {
          if (!current() || pc !== peer) { event.track.stop(); return; }
          stream.addTrack(event.track);
          event.track.onended = () => { if (current()) mediaFailed(); };
          void video.play().catch(() => { if (current()) publish({ mediaPlaybackBlocked: true }); });
        };
        peer.onconnectionstatechange = () => {
          if (!current()) return;
          if (peer.connectionState === 'failed') mediaFailed();
          else if (peer.connectionState === 'disconnected') {
            clearTimeout(mediaTimer); mediaTimer = setTimeout(() => { if (current()) mediaFailed(); }, 4000);
          } else if (peer.connectionState === 'connected') { clearTimeout(mediaTimer); }
        };
        peer.addTransceiver('audio', { direction: 'recvonly' });
        peer.addTransceiver('video', { direction: 'recvonly' });
        await peer.setLocalDescription(await peer.createOffer());
        await new Promise((resolve, reject) => {
          if (peer.iceGatheringState === 'complete') { resolve(); return; }
          const finish = () => { if (peer.iceGatheringState === 'complete') { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', finish); resolve(); } };
          const timer = setTimeout(() => { peer.removeEventListener('icegatheringstatechange', finish); reject(new Error('ICE expirou')); }, 4000);
          peer.addEventListener('icegatheringstatechange', finish);
        });
        if (!current()) return;
        const sdp = peer.localDescription.sdp;
        if (new TextEncoder().encode(JSON.stringify({ id: sequence + 1, command: 'rtc-offer', payload: { sdp } })).length > 32768) throw new Error('Oferta excede limite');
        const answer = await rpc('rtc-offer', { sdp });
        if (!current()) return;
        if (!answer || answer.type !== 'answer' || answer.tabId !== tabId || typeof answer.sdp !== 'string') throw new Error('Resposta de mídia inválida');
        await peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
        if (!current()) return;
        negotiating = false;
        publish({ mediaError: '', mediaFailureCode: '', mediaMuted: !audioWanted });
        mediaTimer = setTimeout(() => { if (current() && !imageWidth) mediaFailed(); }, 10000);
      } catch (err) { if (current()) {
        const policy = /^RTC policy: [A-Z_]+$/.test(String(err?.message || '')) ? err.message : null;
        state.mediaFailureCode = policy || (['NotAllowedError','NotFoundError','NotSupportedError','InvalidAccessError','OperationError'].includes(err?.name) ? err.name : 'Falha na negociação audiovisual');
        mediaFailed();
      } }
    }
    async function saveDownload(id) {
      if (!state.connected || !token || !state.downloads.some(item => item.id === id && item.state === 'completed')) throw new Error('Download indisponível');
      const response = await fetch(`${serviceOrigin}/download/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store', redirect: 'error'
      });
      if (!response.ok) throw new Error(`Download HTTP ${response.status}`);
      const limit = 64 * 1024 * 1024;
      if (Number(response.headers.get('Content-Length')) > limit) { if (response.body) await response.body.cancel(); throw new Error('Download excede 64 MiB'); }
      if (!response.body) throw new Error('Download sem conteúdo');
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.byteLength;
          if (size > limit) { await reader.cancel(); throw new Error('Download excede 64 MiB'); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const disposition = response.headers.get('Content-Disposition') || '';
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(disposition);
      let name = 'download';
      try { name = encoded ? decodeURIComponent(encoded[1].trim()) : plain ? plain[1] || plain[2].trim() : name; } catch (_) {}
      name = name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/g, '_').replace(/^\.+|[. ]+$/g, '').slice(0, 180) || 'download';
      const url = URL.createObjectURL(new Blob(chunks));
      const link = document.createElement('a'); link.href = url; link.download = name;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }
    function failPending(message) {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
      pending.clear();
    }
    function rpc(command, payload) {
      if (!state.connected) return Promise.reject(new Error('Serviço de navegador desconectado. ' + instructions));
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Tempo esgotado: ${command}`)); }, 10000);
        pending.set(id, { resolve, reject, timer });
        try { socket.send(JSON.stringify({ id, command, payload })); }
        catch (err) { clearTimeout(timer); pending.delete(id); reject(err); }
      });
    }
    async function connect() {
      if (disposed || state.connected) return state;
      if (connecting) return connecting;
      connecting = (async () => {
        const epoch = ++generation;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1400);
        try {
          const response = await fetch(serviceOrigin + '/bootstrap', { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
          if (!response.ok) throw new Error(`Bootstrap HTTP ${response.status}`);
          const bootstrap = await response.json();
          if (bootstrap.protocol !== 'free-agent-browser/2' || bootstrap.engine !== 'web' || typeof bootstrap.token !== 'string' || !bootstrap.token) throw new Error('Bootstrap incompatível');
          clearTimeout(timer);
          if (disposed || epoch !== generation) return state;
          token = bootstrap.token;
          const ws = new WebSocket(serviceOrigin.replace('http:', 'ws:') + '/session');
          socket = ws;
          authenticated = false;
          await new Promise((resolve, reject) => {
            const authTimer = setTimeout(() => { reject(new Error('Autenticação expirou')); ws.close(); }, 1500);
            const stopAuth = () => clearTimeout(authTimer);
            ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: bootstrap.token }));
            ws.onmessage = event => {
              if (disposed || socket !== ws) return;
              let message;
              try { message = JSON.parse(event.data); } catch (_) { return; }
              if (message.type === 'state' && message.state && Array.isArray(message.state.tabs)) {
                const first = !authenticated;
                const acquired = message.state.controlling && !state.controlling;
                authenticated = true;
                stopAuth();
                publish({ ...message.state, diagnostic: message.state.diagnostic || bootstrap.diagnostic || '' });
                if (first) resolve(state);
                 if (first || acquired) void sendLayout();
              } else if (authenticated && message.type === 'frame') receiveFrame(message);
              else if (authenticated && pending.has(message.id)) {
                const request = pending.get(message.id);
                pending.delete(message.id); clearTimeout(request.timer);
                if (message.error) request.reject(new Error(typeof message.error === 'string' ? message.error : message.error.message || 'Falha no serviço'));
                else request.resolve(message.result);
              }
            };
            ws.onerror = () => { stopAuth(); reject(new Error('WebSocket indisponível')); ws.close(); };
            ws.onclose = () => {
              stopAuth(); reject(new Error('Conexão encerrada'));
              if (socket !== ws) return;
              authenticated = false; socket = null;
               token = ''; releaseInput(); stopMedia(); clearSurface(); failPending('Conexão encerrada');
              publish({ connected: false, diagnostic: 'Serviço desconectado. ' + instructions });
            };
          });
        } catch (err) {
          if (!disposed && epoch === generation) {
            const old = socket; socket = null; authenticated = false;
            if (old) old.close();
             token = ''; stopMedia(); clearSurface(); failPending('Conexão indisponível');
            publish({ connected: false, diagnostic: `${err.message}. ${instructions}` });
          }
        } finally { clearTimeout(timer); }
        return state;
      })();
      try { return await connecting; } finally { connecting = null; }
    }
    async function invoke(command, payload = {}) {
      if (disposed) throw new Error('Adaptador encerrado');
      if (command === 'download-save') return saveDownload(payload.id);
      if (command === 'media-retry') {
        stopMedia(); clearSurface(); mediaRetries = 0;
        publish({ mediaError: '', mediaPlaybackBlocked: false, mediaMuted: true }); return;
      }
      if (command === 'media-audio') {
        if (!video || transport() !== 'webrtc' || !eligible() || !imageWidth) throw new Error('Áudio indisponível: aguarde a mídia da aba ativa.');
        if (payload.muted) { audioWanted = false; video.muted = true; publish({ mediaMuted: true }); if(!layout.visible) void invoke('layout',{visible:false}); return; }
        audioWanted = true;
        video.muted = false;
        try { await video.play(); publish({ mediaMuted: false, mediaPlaybackBlocked: false }); }
        catch (_) { audioWanted = false; video.muted = true; publish({ mediaMuted: true, mediaPlaybackBlocked: true }); throw new Error('Reprodução bloqueada. Clique em Reproduzir áudio.'); }
        return;
      }
      if (command === 'media-select-audio') { await rpc('audio-source',{}); return; }
      if (command === 'retry' && socket) {
        const old = socket; socket = null; authenticated = false;
        token = ''; mediaRetries = 0; state.mediaError = '';
        failPending('Reconectando'); publish({ connected: false }); old.close();
      }
      if (command === 'state' || command === 'retry') {
        await connect();
        if (state.connected) publish(await rpc('state', {}));
        return state;
      }
      if (command === 'layout') {
        const wasVisible = layout.visible;
        if (!payload.visible) releaseInput();
        const backgroundAudio = audioWanted && pc?.connectionState === 'connected';
        layout = { ...layout, ...payload, backgroundAudio, width: Math.max(1, Math.min(1920, Math.round(payload.width || layout.width))), height: Math.max(1, Math.min(1200, Math.round(payload.height || layout.height))) };
        if (!layout.visible && !backgroundAudio) { layoutReady = false; stopMedia(); clearSurface(); updateOverlay(); }
        if (layout.visible && !wasVisible) { mediaRetries = 0; state.mediaError = ''; }
        if (layout.visible && !wasVisible) await connect();
        if (!state.connected) return;
        return sendLayout();
      }
      if (command === 'input') throw new Error('Entrada reservada à superfície do navegador');
      await connect();
      return rpc(command, payload);
    }
    async function sendLayout() {
      const sent = layout, epoch = generation;
      try {
        const result = await rpc('layout', sent);
        if (epoch === generation && sent === layout) { layoutReady = !!sent.visible || !!sent.backgroundAudio; void startMedia(); }
        return result;
      } catch (_) {
        layoutReady = false;
        if (layout.visible) publish({ mediaError: 'Layout da mídia indisponível. Use Reconectar mídia.' });
      }
    }
    function onState(listener) {
      listeners.add(listener); listener({ ...state });
      void connect();
      return () => listeners.delete(listener);
    }
    function receiveFrame(frame) {
      if (transport() !== 'jpeg' || !canvas || !layout.visible || !state.connected || document.hidden || frame.tabId !== state.activeId
        || !Number.isFinite(frame.sentAt) || frame.sentAt <= lastSentAt || typeof frame.data !== 'string'
        || !(frame.width > 0 && frame.height > 0)) return;
      lastSentAt = frame.sentAt;
      pendingFrame = { ...frame, epoch: surfaceEpoch };
      void decodeFrame();
    }
    async function decodeFrame() {
      if (decoding || !pendingFrame) return;
      decoding = true;
      const frame = pendingFrame; pendingFrame = null;
      let image;
      try {
        image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img); img.onerror = () => reject(new Error('JPEG inválido'));
          img.src = 'data:image/jpeg;base64,' + frame.data;
        });
        if (transport() !== 'jpeg' || disposed || frame.epoch !== surfaceEpoch || !layout.visible || !state.connected || document.hidden || frame.tabId !== state.activeId) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        imageWidth = frame.width; imageHeight = frame.height;
        const fit = fitted(canvas.width, canvas.height);
        context.fillStyle = '#15151b'; context.fillRect(0, 0, canvas.width, canvas.height);
         context.drawImage(image, fit.x, fit.y, fit.width, fit.height);
         canvas.dataset.frameTab = frame.tabId;
        updateOverlay();
      } catch (_) { /* Leave the previous frame; never turn corrupt data into DOM. */ }
      finally { if (image) { image.onload = image.onerror = null; image.src = ''; } decoding = false; if (pendingFrame) void decodeFrame(); }
    }
    function fitted(width, height) {
      const scale = Math.min(width / imageWidth, height / imageHeight);
      return { x: (width - imageWidth * scale) / 2, y: (height - imageHeight * scale) / 2, width: imageWidth * scale, height: imageHeight * scale, scale };
    }
    function point(event, clamp = false) {
      if (!imageWidth || transport()==='webrtc' && state.videoTabId && state.videoTabId!==state.activeId) return null;
      if (transport() === 'webrtc') { imageWidth = video.videoWidth || imageWidth; imageHeight = video.videoHeight || imageHeight; }
      const rect = surface.getBoundingClientRect(), fit = fitted(rect.width, rect.height);
      const x = (event.clientX - rect.left - fit.x) / fit.scale, y = (event.clientY - rect.top - fit.y) / fit.scale;
      if (!clamp && (x < 0 || y < 0 || x >= imageWidth || y >= imageHeight)) return null;
      const logicalWidth = transport() === 'webrtc' && state.viewport?.width || imageWidth;
      const logicalHeight = transport() === 'webrtc' && state.viewport?.height || imageHeight;
      return { x: Math.max(0, Math.min(imageWidth - 1, x)) / imageWidth * logicalWidth,
        y: Math.max(0, Math.min(imageHeight - 1, y)) / imageHeight * logicalHeight };
    }
    function input(payload) {
      if (state.connected && layout.visible && !document.hidden && imageWidth) void rpc('input', payload).catch(() => {});
    }
    const button = value => ['left', 'middle', 'right'][value] || 'none';
    const mask = value => [1, 4, 2][value] || 0;
    function flushMove() { clearTimeout(moveTimer); moveTimer = null; if (move) { input(move); move = null; } }
    function releaseInput() {
      clearTimeout(moveTimer); clearTimeout(wheelTimer); moveTimer = wheelTimer = null; move = wheel = null;
      for (const [code, value] of keys) input({ ...value, eventType: 'keyUp', text: undefined });
      keys.clear();
      for (const [bit, name] of [[1, 'left'], [4, 'middle'], [2, 'right']]) if (heldButtons & bit) {
        heldButtons &= ~bit;
        input({ kind: 'mouse', eventType: 'mouseReleased', ...mouse, button: name, buttons: heldButtons, clickCount: 1 });
      }
      heldButtons = 0;
    }
    function mount(element) {
      if (canvas || disposed) return;
      viewport = element; viewport.classList.add('browser-web-viewport');
      surface = document.createElement('div'); surface.className = 'browser-web-surface'; surface.tabIndex = 0;
      canvas = document.createElement('canvas'); canvas.className = 'browser-web-canvas'; canvas.hidden = true;
      video = document.createElement('video'); video.className = 'browser-web-video';
      video.playsInline = true; video.autoplay = true; video.muted = true; video.volume = volume; video.hidden = true;
      // An editing host is needed for real browser IME/composition and paste events.
      // Its DOM is never used as remote page content.
      keyboardSink = document.createElement('textarea');
      keyboardSink.className = 'browser-web-input'; keyboardSink.tabIndex = -1;
      keyboardSink.spellcheck = false;
      keyboardSink.setAttribute('aria-label', 'Entrada de teclado do navegador remoto');
      surface.setAttribute('role', 'application');
      surface.setAttribute('aria-label', 'Navegador remoto: imagem ao vivo, sem DOM acessível. Use teclado e mouse; Control+L abre o endereço.');
      surface.setAttribute('aria-describedby', 'browserMediaNotice');
      context = canvas.getContext('2d', { alpha: false });
      overlay = document.createElement('p'); overlay.className = 'browser-web-overlay'; overlay.setAttribute('role', 'status');
      surface.append(canvas, video); viewport.append(surface, keyboardSink, overlay); updateOverlay();
      function listen(target, type, handler, options) { target.addEventListener(type, handler, options); cleanup.push(() => target.removeEventListener(type, handler, options)); }
      const videoReady = () => {
        if (!pc || !eligible() || transport() !== 'webrtc' || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
        imageWidth = video.videoWidth; imageHeight = video.videoHeight;
        video.dataset.frameTab = state.activeId; clearTimeout(mediaTimer);
        publish({ mediaReady: true, mediaVolume: volume });
      };
      for (const type of ['loadedmetadata', 'loadeddata', 'playing', 'resize']) listen(video, type, videoReady);
      listen(document, 'visibilitychange', () => { if (document.hidden) void invoke('layout', { visible: false }); });
      listen(window, 'pagehide', () => { if (state.connected) void rpc('layout', { ...layout, visible: false }).catch(() => {}); dispose(); });
      listen(surface, 'contextmenu', event => event.preventDefault());
      listen(surface, 'pointerdown', event => {
        const position = point(event);
        if (!position || !state.connected || !layout.visible || !mask(event.button)) return;
        event.preventDefault(); keyboardSink.focus({ preventScroll: true }); flushMove(); surface.setPointerCapture(event.pointerId);
        mouse = position; heldButtons = event.buttons;
        input({ kind: 'mouse', eventType: 'mousePressed', ...mouse, button: button(event.button), buttons: heldButtons, clickCount: event.detail === 2 ? 2 : 1 });
      });
      listen(surface, 'pointermove', event => {
        const position = point(event, !!heldButtons); if (!position) return;
        mouse = position;
        move = { kind: 'mouse', eventType: 'mouseMoved', ...mouse, button: 'none', buttons: event.buttons, clickCount: 1 };
        if (!moveTimer) moveTimer = setTimeout(flushMove, 34);
      });
      listen(surface, 'pointerup', event => {
        if (!(heldButtons & mask(event.button))) return;
        event.preventDefault(); flushMove(); mouse = point(event, true) || mouse; heldButtons = event.buttons;
        input({ kind: 'mouse', eventType: 'mouseReleased', ...mouse, button: button(event.button), buttons: heldButtons, clickCount: event.detail === 2 ? 2 : 1 });
        if (!heldButtons && surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
      });
      for (const type of ['pointercancel', 'lostpointercapture']) listen(surface, type, releaseInput);
      listen(keyboardSink, 'blur', releaseInput);
      listen(surface, 'focus', () => { if (eligible() && imageWidth) keyboardSink.focus({ preventScroll: true }); });
      listen(window, 'blur', releaseInput);
      listen(surface, 'wheel', event => {
        event.preventDefault(); const position = point(event); if (!position) return;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? layout.height : 1;
        wheel = { kind: 'mouse', eventType: 'mouseWheel', ...position, button: 'none', buttons: heldButtons, clickCount: 1,
          deltaX: (wheel ? wheel.deltaX : 0) + event.deltaX * unit, deltaY: (wheel ? wheel.deltaY : 0) + event.deltaY * unit };
        if (!wheelTimer) wheelTimer = setTimeout(() => { wheelTimer = null; const value = wheel; wheel = null; if (value) input(value); }, 34);
      }, { passive: false });
      for (const type of ['keydown', 'keyup']) listen(keyboardSink, type, event => {
        if ((event.ctrlKey || event.metaKey) && ['l','t','w'].includes(event.key.toLowerCase())) {
          event.preventDefault(); event.stopPropagation(); if (event.key.toLowerCase() === 'l') { document.getElementById('browserAddress').focus(); document.getElementById('browserAddress').select(); }
          if (event.key.toLowerCase() === 't') document.getElementById('browserCreate').click();
          if (event.key.toLowerCase() === 'w' && state.activeId) void invoke('close', { id: state.activeId });
          return;
        }
        if (composing || event.isComposing || event.key === 'Process' || event.key === 'Dead') return;
        // Let the trusted paste event carry Unicode. Copy is not emulated without a clipboard API.
        if ((event.ctrlKey || event.metaKey) && ['v', 'c'].includes(event.key.toLowerCase())) { event.stopPropagation(); return; }
        event.preventDefault(); event.stopPropagation();
        const value = { kind: 'key', eventType: type === 'keydown' ? 'keyDown' : 'keyUp', key: event.key, code: event.code,
          modifiers: (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0),
          windowsVirtualKeyCode: Number(event.keyCode || event.which || 0) };
        if (type === 'keydown' && Array.from(event.key).length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) value.text = event.key;
        if (type === 'keydown') keys.set(event.code, value); else keys.delete(event.code);
        input(value);
      });
      listen(keyboardSink, 'compositionstart', () => { composing = true; });
      listen(keyboardSink, 'compositionend', event => { composing = false; keyboardSink.value = ''; if (event.data) input({ kind: 'text', text: event.data }); });
      listen(keyboardSink, 'beforeinput', event => {
        if (event.isComposing || composing) return;
        event.preventDefault();
        // Virtual keyboards and insertText may not emit a physical keydown.
        if (event.inputType === 'insertText' && event.data) input({ kind: 'text', text: event.data });
      });
      listen(keyboardSink, 'input', () => { if (!composing) keyboardSink.value = ''; });
      listen(keyboardSink, 'paste', event => { event.preventDefault(); event.stopPropagation(); const text = event.clipboardData && event.clipboardData.getData('text/plain'); if (text) input({ kind: 'text', text }); });
    }
    function dispose() {
      releaseInput(); disposed = true; generation++; token = ''; stopMedia(); clearSurface();
      failPending('Adaptador encerrado');
      if (socket) socket.close(); socket = null;
      for (const remove of cleanup) remove();
      listeners.clear();
      if (surface) surface.remove(); if (keyboardSink) keyboardSink.remove(); if (overlay) overlay.remove();
      if (viewport) viewport.classList.remove('browser-web-viewport');
    }
    await connect();
    return adapter;
  }
  window.FreeAgentBrowserAdapters = Object.freeze({ create });
})();
