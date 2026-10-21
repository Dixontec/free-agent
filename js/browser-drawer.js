(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const drawer = $('browserDrawer');
  const viewport = $('browserViewport');
  $('layout').append(drawer);
  let workspace;
  const bridge = await window.FreeAgentBrowserAdapters.create();
  const bridged = !!bridge && typeof bridge.invoke === 'function' && typeof bridge.onState === 'function';
  let state = { tabs: [], activeId: null, downloads: [] };
  let opened = false, expanded = false, moving = false, dragging = null;
  let frame = 0, geometryTimer = 0, motionTimer = 0, unsubscribe, disposed = false, stateVersion = 0;
  let pendingLayout = null, sendingLayout = false, lastLayout = '';
  let downloadSignature = '', tabSignature = '';
  const blockers = 'dialog[open], .modal, [role="dialog"], [aria-modal="true"], [role="menu"], [popover], '
    + '#coreOverlay, #sandboxOverlay, #restOverlay, #selPop, #updCard, #attachMenu, '
    + '#modelQuickPop, #skillMentionPop, #voiceBlur, #voiceFloat, #toasts .toast, '
    + '[id$="Overlay"], [id$="Menu"], [id$="Pop"], .overlay, .menu, .dropdown-menu';

  function error(message) {
    $('browserError').textContent = String(message || '');
    $('browserError').hidden = !message;
  }

  async function invoke(command, payload = {}) {
    if (!bridged || (disposed && command !== 'layout')) return;
    try { return await bridge.invoke(command, payload); }
    catch (err) { if (!disposed) error(`Navegador: ${err && err.message ? err.message : 'falha de comunicação'}`); }
  }

  // All bounds are renderer CSS coordinates. Main applies getZoomFactor(), NOT devicePixelRatio.
  function layout(value) {
    const key = JSON.stringify(value);
    if (!bridged || key === lastLayout) return;
    lastLayout = key;
    pendingLayout = value;
    void flushLayout();
  }

  async function flushLayout() {
    if (sendingLayout) return;
    sendingLayout = true;
    try {
      while (pendingLayout) {
        const next = pendingLayout;
        pendingLayout = null;
        await invoke('layout', next);
      }
    } finally { sendingLayout = false; }
  }

  function visible(element) {
    if (!element || element.closest('[hidden], [inert]')) return false;
    if (typeof element.checkVisibility === 'function'
        && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0) return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
      && rect.top < innerHeight && rect.left < innerWidth;
  }

  function syncLayout() {
    if (opened) {
      const headerBottom = Math.max(0, $('topbar').getBoundingClientRect().bottom + 8);
      const top = `${headerBottom}px`;
      if (drawer.style.getPropertyValue('--browser-top') !== top) drawer.style.setProperty('--browser-top', top);
    }
    const blocked = Array.from(document.querySelectorAll(blockers))
      .some(element => (!drawer.contains(element) || element.matches('dialog[open]')) && visible(element));
    const rect = viewport.getBoundingClientRect();
    const active = state.tabs.some(tab => tab.id === state.activeId && tab.url !== 'about:blank');
    const show = opened && active && !moving && dragging === null && !blocked
      && (bridge.engine === 'native' || document.visibilityState === 'visible') && visible(drawer) && visible(viewport)
      && rect.width > 0 && rect.height > 0;
    layout(show ? { visible: true, x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: Math.max(1, Math.min(2, devicePixelRatio || 1)) }
      : { visible: false });
  }

  function tick() {
    frame = 0;
    if (disposed) return;
    syncLayout();
    // Also catches CSS transitions, renderer zoom and visibility changes without DOM mutations.
    if (opened) geometryTimer = setTimeout(schedule, 100);
  }

  function schedule() { clearTimeout(geometryTimer); if (!frame && !disposed) frame = requestAnimationFrame(tick); }

  function setOpen(value) {
    opened = value;
    if (value) document.body.classList.remove('browser-show-chat');
    endDrag();
    moving = true;
    clearTimeout(motionTimer);
    layout({ visible: false });
    drawer.classList.toggle('browser-open', opened);
    document.body.classList.toggle('browser-workspace', opened);
    document.body.classList.toggle('browser-full', opened && expanded);
    drawer.inert = !opened;
    drawer.setAttribute('aria-hidden', String(!opened));
    $('btnBrowser').setAttribute('aria-expanded', String(opened));
    motionTimer = setTimeout(() => { moving = false; schedule(); }, 240);
    if (opened) { $('browserAddress').focus(); void invoke('state'); }
    else $('btnBrowser').focus();
    schedule();
  }

  function setExpanded(value) {
    expanded = value;
    endDrag();
    layout({ visible: false });
    drawer.classList.toggle('browser-expanded', value);
    document.body.classList.toggle('browser-full', opened && value);
    $('browserExpand').setAttribute('aria-pressed', String(value));
    $('browserExpand').title = value ? 'Restaurar largura' : 'Expandir';
    $('browserExpand').setAttribute('aria-label', $('browserExpand').title);
    schedule();
  }

  let immersive = false, sourceFullscreen = false, webPageFullscreen = false;
  let changingFullscreen = false;
  const nativeFullscreen = bridge.engine === 'native';
  function present(value) {
    if (immersive === value) return;
    immersive = value;
    document.body.classList.toggle('browser-immersive', value);
    $('browserFullscreen').setAttribute('aria-pressed', String(value));
    lastLayout = ''; schedule();
  }
  async function fullscreen(value) {
    if (changingFullscreen) return;
    changingFullscreen = true;
    try {
      if (nativeFullscreen) { await invoke('fullscreen', {enabled:value}); return; }
      webPageFullscreen = value;
      present(value);
      if (value && !document.fullscreenElement) {
        try { await document.documentElement.requestFullscreen(); }
        catch { error('Tela ampliada. Para ocultar também a barra do navegador externo, pressione F11.'); }
      } else if (!value) {
        // The local gesture must not wait behind capture/RTC work in the worker.
        void invoke('fullscreen', {enabled:false});
        if (document.fullscreenElement) await document.exitFullscreen().catch(()=>{});
      }
    } finally { changingFullscreen = false; }
  }
  $('browserFullscreen').addEventListener('click', () => void fullscreen(!immersive));
  document.addEventListener('keydown', event => {
    if (!opened || event.repeat) return;
    if (event.key === 'F11' || event.key === 'Escape' && immersive) {
      event.preventDefault(); event.stopImmediatePropagation();
      void fullscreen(event.key === 'F11' ? !immersive : false);
    }
  }, true);
  document.addEventListener('fullscreenchange', () => {
    if (!nativeFullscreen && !document.fullscreenElement && immersive) {
      webPageFullscreen = false; present(false);
      void invoke('fullscreen', {enabled:false});
    }
  });

  function fallbackTarget() {
    const value = $('browserAddress').value.trim();
    let url;
    if (value) url = new URL(window.FreeAgentNavigation(value));
    else if (!value) url = new URL('https://www.google.com/');
    else {
      try {
        const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value
          : /^(localhost|[^\s/]+\.[^\s/]+)([:/]|$)/i.test(value) ? `https://${value}` : '';
        url = new URL(candidate);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
      } catch (_) { url = new URL(`https://www.google.com/search?q=${encodeURIComponent(value)}`); }
    }
    const link = $('browserFallbackLink');
    link.href = url.href;
    link.textContent = value ? `Abrir externamente: ${url.href}` : 'Abrir Google externamente';
    return url.href;
  }

  function render(next) {
    if (disposed || !next || !Array.isArray(next.tabs)) return;
    if (next.shortcut === 'l') { $('browserAddress').focus(); $('browserAddress').select(); }
    if (next.shortcut === 't') void invoke('create');
    if (next.shortcut === 'w' && state.activeId) void invoke('close', { id: state.activeId });
    if (next.collapsed && opened) setOpen(false);
    if (nativeFullscreen) present(!!next.presentation?.active);
    else {
      const previous = sourceFullscreen;
      sourceFullscreen = !!next.presentation?.active;
      if (sourceFullscreen && !previous) {
        present(true);
        if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {
          error('Vídeo ampliado. Use Tela cheia ou F11 para ocultar a barra do navegador externo.');
        });
      }
      if (!sourceFullscreen && previous && !webPageFullscreen) {
        present(false);
        if (document.fullscreenElement) void document.exitFullscreen().catch(()=>{});
      }
    }
    const switched = next.activeId !== state.activeId;
    stateVersion++;
    state = { ...next, tabs: next.tabs, activeId: next.activeId, downloads: Array.isArray(next.downloads) ? next.downloads : [] };
    const web = (state.engine || bridge.engine) !== 'native';
    $('browserDiagnostic').textContent = state.diagnostic ? String(state.diagnostic) : web
      ? state.connected ? 'Serviço web conectado.' : 'Serviço web desconectado. Inicie npm run server OU python serve.py em uma origem autorizada.'
      : 'Navegador nativo conectado.';
    if (state.mediaFailureCode) $('browserDiagnostic').textContent += ' Mídia: ' + state.mediaFailureCode;
    $('browserRetry').hidden = !web || !!state.connected;
    $('browserMediaNotice').hidden = !web;
    const rtc = web && state.capabilities && state.capabilities.transport === 'webrtc';
    $('browserMediaNotice').textContent = rtc ? 'Áudio da aba ativa; reprodução protegida depende do site'
      : 'Mídia web indisponível neste transporte.';
    const currentHasPage = state.tabs.some(t=>t.id===state.activeId && t.url!=='about:blank');
    const soundTab = state.tabs.find(t=>t.id===state.audioTabId);
    $('browserMediaControls').hidden = !rtc || !currentHasPage && !(soundTab && state.mediaMuted===false);
    selectAudio.hidden = !rtc || !currentHasPage || !soundTab || soundTab.id === state.activeId;
    selectAudio.disabled = !state.mediaReady;
    audioSource.textContent = soundTab && state.mediaMuted===false ? `Áudio: ${soundTab.title || soundTab.url}` : '';
    $('browserAudio').textContent = state.mediaPlaybackBlocked ? 'Reproduzir áudio' : state.mediaMuted === false ? 'Silenciar' : 'Ativar áudio';
    $('browserAudio').setAttribute('aria-pressed', String(state.mediaMuted === false));
    $('browserAudio').disabled = !state.connected || !state.controlling || !state.mediaReady;
    $('browserMediaRetry').disabled = !state.connected || !state.controlling;
    $('browserFallback').hidden = !web || !!state.connected;
    if (web && !state.connected) fallbackTarget();
    const focus = document.activeElement;
    const focusedTab = focus && focus.closest('[data-browser-tab]');
    const focusId = focusedTab && focusedTab.dataset.browserTab;
    const focusClose = focus && focus.classList.contains('browser-tab-close');
    const signature = JSON.stringify([state.activeId, state.tabs]);
    if (signature !== tabSignature) {
    tabSignature = signature;
    $('browserTabs').replaceChildren();
    for (const tab of state.tabs) {
      const item = document.createElement('div');
      item.className = 'browser-tab';
      item.dataset.browserTab = String(tab.id);
      const select = document.createElement('button');
      select.type = 'button';
      select.setAttribute('role', 'tab');
      select.setAttribute('aria-selected', String(tab.id === state.activeId));
      select.textContent = `${tab.loading ? '◌ ' : ''}${tab.title || tab.url || 'Nova aba'}`;
      select.title = String(tab.url || tab.title || 'Nova aba');
      select.addEventListener('click', () => void invoke('activate', { id: tab.id }));
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'browser-tab-close';
      close.textContent = '×';
      close.setAttribute('aria-label', `Fechar ${tab.title || 'aba'}`);
      close.addEventListener('click', () => void invoke('close', { id: tab.id }));
      item.append(select, close);
      $('browserTabs').append(item);
      if (String(tab.id) === focusId) (focusClose ? close : select).focus();
    }
    }
    const active = state.tabs.find(tab => tab.id === state.activeId);
    if (switched || document.activeElement !== $('browserAddress')) $('browserAddress').value = active && active.url !== 'about:blank' ? active.url || '' : '';
    $('browserBack').disabled = !active || !active.canGoBack;
    $('browserForward').disabled = !active || !active.canGoForward;
    $('browserReload').disabled = !active;
    $('browserStop').disabled = !active || !active.loading;
    const home = !active || active.url === 'about:blank';
    viewport.dataset.home = String(home);
    error(!home && (state.mediaError || (active && active.error)));
    workspace?.render(state);
    $('browserEmpty').hidden = !home;
    $('browserMediaNotice').hidden = true;
    // Media/input updates must not detach an unchanged authorization button
    // between pointer movement and click.
    const nextDownloads = JSON.stringify([web, state.downloads]);
    if (nextDownloads !== downloadSignature) {
      downloadSignature = nextDownloads;
      $('browserDownloads').replaceChildren();
      $('browserDownloads').hidden = !state.downloads.length;
      for (const download of state.downloads) {
      const row = document.createElement('div');
      row.className = 'browser-download';
      const name = document.createElement('span');
      name.textContent = String(download.name || 'Download');
      const status = document.createElement('span');
      const received = Math.max(0, Number(download.received) || 0);
      const total = Math.max(0, Number(download.total) || 0);
      status.textContent = `${download.state || ''} · ${(received / 1048576).toFixed(1)}${total ? ` / ${(total / 1048576).toFixed(1)}` : ''} MB`;
      const progress = document.createElement('progress');
      progress.setAttribute('aria-label', String(download.name || 'Download'));
      if (total > 0) { progress.max = total; progress.value = Math.min(total, received); }
      row.append(name, status, progress);
      if (web) {
        const actions = download.state === 'awaiting-authorization' ? [['Permitir', 'download-accept'], ['Cancelar', 'download-cancel']]
          : download.state === 'progressing' ? [['Cancelar', 'download-cancel']]
          : download.state === 'completed' ? [['Salvar', 'download-save']] : [];
        for (const [label, command] of actions) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.addEventListener('click', async () => {
            button.disabled = true;
            try { await invoke(command, { id: download.id }); } finally { button.disabled = false; }
          });
          row.append(button);
        }
      }
        $('browserDownloads').append(row);
      }
    }
    schedule();
  }

  function width(value) {
    const total = $('layout').clientWidth;
    const share = Math.max(.25, Math.min(.75, value / total));
    document.documentElement.style.setProperty('--browser-share', `${share * 100}%`);
    try { localStorage.setItem('free-agent-browser-share', String(share)); } catch {}
    schedule();
  }
  function endDrag() {
    if (dragging === null) return;
    const id = dragging;
    dragging = null;
    if ($('browserResize').hasPointerCapture(id)) $('browserResize').releasePointerCapture(id);
    document.body.classList.remove('browser-resizing');
    document.getElementById('browserDragShield')?.remove();
    schedule();
  }
  $('browserResize').addEventListener('pointerdown', event => {
    if (event.button !== 0 || expanded) return;
    event.preventDefault();
    dragging = event.pointerId;
    $('browserResize').setPointerCapture(dragging);
    document.body.classList.add('browser-resizing');
    const shield = document.createElement('div');
    shield.id = 'browserDragShield'; shield.setAttribute('aria-hidden', 'true');
    document.body.append(shield);
    layout({ visible: false });
  });
  // Detaching an Electron WebContentsView can transfer focus and cancel pointer
  // capture. Keep the drag on the trusted document until the button is released.
  document.addEventListener('pointermove', event => {
    if (dragging !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    width($('layout').getBoundingClientRect().right - event.clientX);
  }, true);
  for (const name of ['pointerup', 'pointercancel']) document.addEventListener(name, event => {
    if (dragging !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); endDrag();
  }, true);
  $('browserResize').addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    width(drawer.getBoundingClientRect().width + (event.key === 'ArrowLeft' ? 24 : -24));
  });
  window.addEventListener('blur', () => { if (document.hidden) endDrag(); });
  $('btnBrowser').addEventListener('click', () => setOpen(document.body.classList.contains('browser-show-chat') || !opened));
  $('browserCollapse').addEventListener('click', () => setOpen(false));
  $('browserExpand').addEventListener('click', () => setExpanded(!expanded));
  $('browserCreate').addEventListener('click', () => void invoke('create', {}));
  for (const [id, command] of [['browserBack', 'back'], ['browserForward', 'forward'], ['browserReload', 'reload'], ['browserStop', 'stop']]) {
    $(id).addEventListener('click', () => void invoke(command));
  }
  $('browserNavigation').addEventListener('submit', event => {
    event.preventDefault();
    if (!bridged) { fallbackTarget(); $('browserFallbackLink').focus(); return; }
    const value = $('browserAddress').value.trim();
    if (value) void invoke(state.tabs.some(tab => tab.id === state.activeId) ? 'navigate' : 'create',
      state.tabs.some(tab => tab.id === state.activeId) ? { value } : { url: value });
  });
  $('browserExternal').addEventListener('click', () => {
    if (bridge.engine === 'native') void invoke('external', { value: $('browserAddress').value.trim() || 'https://www.google.com/' });
    else { fallbackTarget(); $('browserFallbackLink').click(); }
  });
  $('browserAddress').addEventListener('input', () => { if (bridge.engine !== 'native') fallbackTarget(); });
  $('browserRetry').addEventListener('click', async () => {
    $('browserRetry').disabled = true;
    try { render(await invoke('retry')); lastLayout = ''; schedule(); }
    finally { $('browserRetry').disabled = false; }
  });
  $('browserAudio').addEventListener('click', () => void invoke('media-audio', { muted: state.mediaMuted === false }));
  const selectAudio = document.createElement('button');
  selectAudio.type = 'button'; selectAudio.id = 'browserSelectAudio'; selectAudio.textContent = 'Ouvir esta aba';
  selectAudio.addEventListener('click', () => void invoke('media-select-audio'));
  $('browserMediaControls').append(selectAudio);
  const audioSource = document.createElement('span'); audioSource.id = 'browserAudioSource'; $('browserMediaControls').append(audioSource);
  $('browserMediaRetry').addEventListener('click', () => void invoke('media-retry'));
  document.addEventListener('keydown', event => {
    if (opened && !$('chatPane').contains(event.target) && (event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (['l', 't', 'w'].includes(key)) {
        event.preventDefault();
        if (key === 'l') { $('browserAddress').focus(); $('browserAddress').select(); }
        if (key === 't') void invoke('create');
        if (key === 'w' && state.activeId) void invoke('close', { id: state.activeId });
      }
    }
    // Outside fullscreen/dialogs, Escape belongs to the site.
  });
  document.addEventListener('visibilitychange', () => {
    // Native child views may occlude their host in fullscreen. Hiding that
    // child here makes the host visible again and creates a detach/attach loop.
    // The main process already handles minimize, restore and native dialogs.
    if (bridge.engine !== 'native' && document.visibilityState !== 'visible') { endDrag(); layout({ visible: false }); }
    schedule();
  });
  window.addEventListener('resize', schedule);
  const observer = new MutationObserver(() => { if (opened) schedule(); });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['hidden', 'class', 'style', 'open', 'inert', 'aria-hidden'] });
  const sizes = new ResizeObserver(schedule);
  sizes.observe($('topbar'));
  sizes.observe(viewport);
  window.addEventListener('pagehide', () => {
    endDrag();
    layout({ visible: false });
    disposed = true;
    observer.disconnect();
    sizes.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(geometryTimer);
    clearTimeout(motionTimer);
    if (typeof unsubscribe === 'function') unsubscribe();
    bridge.dispose();
  }, { once: true });
  workspace = window.FreeAgentBrowserWorkspace.setup({ bridge, invoke, setOpen, setExpanded, schedule });
  bridge.mount(viewport);
  $('browserFallback').hidden = bridged;
  if (bridged) {
    try { unsubscribe = bridge.onState(render); }
    catch (err) { error(`Não foi possível acompanhar o navegador: ${err.message}`); }
    const version = stateVersion;
    void invoke('state').then(next => { if (version === stateVersion) render(next); });
  } else {
    render(state);
    for (const id of ['browserCreate', 'browserBack', 'browserForward', 'browserReload', 'browserStop']) $(id).disabled = true;
    fallbackTarget();
  }
  syncLayout();
})();
