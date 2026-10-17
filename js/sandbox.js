/* ═══════════ Free Agent · Monitor Sandbox ═══════════
   Card-monitor no painel direito: mini tela do "computador Nexus".
   - Clique amplia em overlay; ESC/fundo/X fecha.
   - Mostra preview do código criado pelo harness (HTML renderiza; resto vira código).
   - Sem dependências externas (iframe srcdoc sandboxed + <pre>).
*/
'use strict';
window.Sandbox = (() => {
  const state = { title: 'Nexus · standby', html: '', code: '', lang: 'txt', video: null };
  const PREVIEW_EXT = /\.(html?|css|js|json|md|txt|py|sh|xml|svg|jsx|tsx|yml)$/i;

  function icons() { try { if (window.lucide) lucide.createIcons(); } catch {} }
  function ytId(url) {
    const m = String(url || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function standbyHTML() {
    return `<div class="sb-idle"><span class="sb-pulse"></span><b>FREE AGENT</b><small>monitor standby · o preview do código aparece aqui</small></div>`;
  }
  function bodyHTML() {
    if (state.video) return `<div class="sb-video-slot"></div>`;
    if (state.err) return `<div class="sb-err"><b>Vídeo indisponível p/ incorporar</b><small>O YouTube bloqueou o embed de todas as opções.</small><a href="${esc(state.err.url)}" target="_blank" rel="noopener">Abrir no YouTube</a></div>`;
    if (state.html) return `<iframe class="sb-frame" sandbox="" srcdoc="${esc(state.html)}"></iframe>`;
    if (state.code) {
      const lines = state.code.split('\n').slice(0, 400).join('\n');
      return `<div class="sb-codehead"><span>${esc(state.lang)}</span><span>${esc(state.title)}</span></div><pre class="sb-code">${esc(lines)}</pre>`;
    }
    return standbyHTML();
  }
  function paint() {
    try {
      const t = document.querySelector('#sandboxTitle');
      if (t) t.textContent = state.title;
      const s = document.querySelector('#sandboxScreen');
      if (s) s.innerHTML = bodyHTML();
      const bt = document.querySelector('#sandboxBigTitle');
      if (bt) bt.textContent = state.title;
      const b = document.querySelector('#sandboxBig');
      if (b) b.innerHTML = bodyHTML();
      mountSlot();
    } catch {}
  }
  function show(opts = {}) {
    state.title = String(opts.title || 'Preview').slice(0, 80);
    state.html = opts.html ? String(opts.html).slice(0, 200000) : '';
    state.code = opts.code ? String(opts.code).slice(0, 200000) : '';
    state.lang = String(opts.lang || 'txt').slice(0, 12);
    state.video = null;
    state.err = null;
    paint();
  }
  function previewFile(rel, content) {
    if (!PREVIEW_EXT.test(String(rel || ''))) return false;
    const text = String(content ?? '');
    if (/\.html?$/i.test(rel)) show({ title: rel, html: text });
    else show({ title: rel, code: text, lang: (rel.match(/\.([a-z0-9]+)$/i) || [])[1] || 'txt' });
    try {
      const card = document.querySelector('#sandboxCard');
      if (card) { card.classList.remove('sb-flash'); void card.offsetWidth; card.classList.add('sb-flash'); }
    } catch {}
    return true;
  }
  /* ── Player YouTube (1 iframe persistente, movido mini ↔ overlay) ── */
  let playerWrap = null, ytPlayer = null, ytReady = false, ytLoading = false;
  function loadYTAPI() {
    if (window.YT && window.YT.Player) return;
    if (ytLoading) return;
    ytLoading = true;
    try {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { ytLoading = false; };
      document.head.appendChild(s);
    } catch { ytLoading = false; }
  }
  function playNext() {
    try {
      const q = (state.video && state.video.queue) || [];
      const next = q.shift();
      if (!next) {
        const url = state.video ? state.video.watch : '';
        state.video = null;
        state.err = { url };
        try { if (typeof log === 'function') log('Vídeo bloqueado p/ embed — fila esgotada', 'warn'); } catch {}
        paint();
        return;
      }
      state.video.id = next;
      state.video.watch = `https://www.youtube.com/watch?v=${next}`;
      buildPlayer(next);
      paint();
      mountSlot();
      try { if (typeof log === 'function') log('Vídeo bloqueado — próxima opção: ' + next, 'warn'); } catch {}
    } catch {}
  }
  try {
    window.onYouTubeIframeAPIReady = () => {
      try {
        const fr = playerWrap && playerWrap.querySelector('iframe');
        if (fr && window.YT) {
          ytPlayer = new window.YT.Player(fr, { events: {
            onReady: () => { ytReady = true; syncVolUI(); },
            onError: e => { const c = +(e && e.data); if ([100, 101, 150].includes(c)) playNext(); },
          } });
        }
      } catch {}
    };
  } catch {}
  function syncVolUI() {
    try {
      let muted = true, vol = 80;
      if (ytReady && ytPlayer && ytPlayer.isMuted) { muted = ytPlayer.isMuted(); vol = ytPlayer.getVolume(); }
      if (playerWrap) {
        const mb = playerWrap.querySelector('[data-vmute]');
        if (mb) mb.innerHTML = `<i data-lucide="${muted ? 'volume-x' : 'volume-2'}"></i>`;
        const sl = playerWrap.querySelector('[data-vvol]');
        if (sl) sl.value = muted ? 0 : vol;
        icons();
      }
    } catch {}
  }
  function buildPlayer(id) {
    ytReady = false;
    try { ytPlayer && ytPlayer.destroy && ytPlayer.destroy(); } catch {}
    ytPlayer = null;
    const w = document.createElement('div');
    w.className = 'sb-player';
    w.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="YouTube" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
      <div class="sb-vctrl"><button data-vmute title="Mudo"><i data-lucide="volume-x"></i></button><input data-vvol type="range" min="0" max="100" value="80" title="Volume" /><button data-vexpand title="Ampliar"><i data-lucide="maximize"></i></button></div>`;
    w.querySelector('[data-vmute]').onclick = e => {
      e.stopPropagation();
      try {
        if (ytReady && ytPlayer && ytPlayer.isMuted) {
          ytPlayer.isMuted() ? ytPlayer.unMute() : ytPlayer.mute();
        }
      } catch {}
      setTimeout(syncVolUI, 120);
    };
    w.querySelector('[data-vvol]').oninput = e => {
      e.stopPropagation();
      const v = +e.target.value;
      try {
        if (ytReady && ytPlayer && ytPlayer.setVolume) {
          ytPlayer.setVolume(v);
          if (v > 0 && ytPlayer.isMuted && ytPlayer.isMuted()) ytPlayer.unMute();
          if (v === 0) ytPlayer.mute();
        }
      } catch {}
      setTimeout(syncVolUI, 120);
    };
    w.querySelector('[data-vexpand]').onclick = e => { e.stopPropagation(); open(); };
    playerWrap = w;
    icons();
    loadYTAPI();
    // Se a API já estava pronta, instancia direto
    try {
      if (window.YT && window.YT.Player && !ytPlayer) window.onYouTubeIframeAPIReady();
    } catch {}
  }
  function mountSlot() {
    try {
      if (!state.video || !playerWrap) return;
      const bigOpen = (() => { try { return !document.querySelector('#sandboxOverlay').hidden; } catch { return false; } })();
      const slot = document.querySelector(bigOpen ? '#sandboxBig .sb-video-slot' : '#sandboxScreen .sb-video-slot');
      if (slot && playerWrap.parentNode !== slot) slot.appendChild(playerWrap);
    } catch {}
  }
  function playVideo(url, title, queue = []) {
    const id = ytId(url);
    if (!id) return false;
    const q = Array.isArray(queue) ? queue.filter(x => /^[A-Za-z0-9_-]{11}$/.test(x) && x !== id) : [];
    state.video = { id, title: String(title || 'YouTube').slice(0, 80), watch: `https://www.youtube.com/watch?v=${id}`, queue: q };
    state.title = state.video.title;
    state.html = ''; state.code = ''; state.err = null;
    buildPlayer(id);
    paint();
    mountSlot();
    try {
      const card = document.querySelector('#sandboxCard');
      if (card) { card.classList.remove('sb-flash'); void card.offsetWidth; card.classList.add('sb-flash'); }
    } catch {}
    return true;
  }
  function open() {
    paint();
    mountSlot();
    try { document.querySelector('#sandboxOverlay').hidden = false; } catch {}
    mountSlot();
  }
  function close() {
    try { document.querySelector('#sandboxOverlay').hidden = true; } catch {}
    try { paint(); mountSlot(); } catch {}
  }
  try {
    document.addEventListener('click', e => {
      if (e.target.closest('#sandboxClose')) { close(); return; }
      if (e.target.closest('button, input, a, select, textarea')) return;
      if (e.target.closest('#sandboxCard')) { open(); return; }
      const ov = e.target.closest('#sandboxOverlay');
      if (ov && e.target === ov) close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        try { if (!document.querySelector('#sandboxOverlay').hidden) close(); } catch {}
      }
    });
  } catch {}
  return { show, previewFile, playVideo, open, close };
})();
