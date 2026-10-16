/* My OS · Reprodutor de música (fila + barra fixa + aba Música).
   Classic script — usa window.MusicRepos. Fila persiste em localStorage.
*/
'use strict';
(function () {
  const store = {
    get(k, fb) { try { const v = localStorage.getItem('nexus:' + k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
    set(k, v) { try { localStorage.setItem('nexus:' + k, JSON.stringify(v)); } catch {} },
  };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const P = {
    queue: store.get('playlist', []),
    idx: store.get('playidx', -1),
    audio: null,
    save() { store.set('playlist', P.queue.slice(0, 100)); store.set('playidx', P.idx); },
    track() { return P.queue[P.idx] || null; },
  };

  function ensureAudio() {
    if (P.audio) return P.audio;
    P.audio = $('#musicAudio') || (() => {
      const a = document.createElement('audio');
      a.id = 'musicAudio'; a.preload = 'none';
      document.body.appendChild(a); return a;
    })();
    P.audio.addEventListener('ended', () => next(true));
    P.audio.addEventListener('timeupdate', paintProg);
    P.audio.addEventListener('play', paintPlay); P.audio.addEventListener('pause', paintPlay);
    P.audio.addEventListener('error', () => {
      const t = P.track();
      try { toast('x', `Não consegui tocar: <b>${esc((t && t.title) || 'faixa')}</b>. Arquivo indisponível.`); } catch {}
      try { window.log && log('Falha ao tocar: ' + ((t && t.title) || '?'), 'warn'); } catch {}
      paintSide();
    });
    return P.audio;
  }

  // blob: URLs morrem ao recarregar — reidrata locais pelo id, descarta mortos
  function freshLocal(t) {
    try {
      if (t && String(t.id || '').startsWith('local:') && window.LocalMusic) {
        const f = (window.LocalMusic.list() || []).find(x => x.id === t.id);
        if (f) return { ...t, url: f.url, downloadUrl: f.downloadUrl };
        return null; // local removido → morto
      }
    } catch {}
    if (t && /^blob:/.test(t.url || '')) return null; // stream blob órfão
    return t;
  }
  function sanitizeQueue() {
    const clean = [];
    for (const t of P.queue) { const f = freshLocal(t); if (f) clean.push(f); }
    if (clean.length !== P.queue.length) {
      P.queue = clean;
      if (P.idx >= clean.length) P.idx = clean.length - 1;
      P.save();
    }
    return clean;
  }

  function playTrack(t) {
    if (!t) return false;
    t = freshLocal(t) || t;
    let i = P.queue.findIndex(x => (x.id && t.id && x.id === t.id) || x.url === t.url);
    if (i < 0) { P.queue.push(t); i = P.queue.length - 1; }
    else if (P.queue[i].url !== t.url) P.queue[i] = t; // atualiza blob reidratado
    return playAt(i);
  }
  function playAt(i) {
    sanitizeQueue();
    if (!P.queue.length) { try { toast('music', 'Fila vazia.'); } catch {} return false; }
    P.idx = ((i % P.queue.length) + P.queue.length) % P.queue.length;
    let t = freshLocal(P.queue[P.idx]);
    if (!t) { // item morreu entre sanitize e play
      P.queue.splice(P.idx, 1);
      if (!P.queue.length) { P.idx = -1; P.save(); paintBar(); paintSide(); renderQueue(); return false; }
      P.idx = Math.min(P.idx, P.queue.length - 1);
      t = P.queue[P.idx];
    }
    P.queue[P.idx] = t;
    const a = ensureAudio();
    a.src = t.url; a.title = t.title;
    const pr = a.play();
    if (pr && pr.catch) pr.catch(err => {
      try { toast('x', `Não consegui tocar <b>${esc(t.title)}</b> (${esc(err.name || 'erro')}).`); } catch {}
      try { window.log && log('Play rejeitado: ' + t.title + ' — ' + (err.message || err.name), 'warn'); } catch {}
    });
    P.save(); paintBar(); paintSide(); renderQueue();
    try { window.log && log('Tocando: ' + t.title + ' (' + t.source + ')', 'ok'); } catch {}
    return true;
  }
  function toggle() {
    sanitizeQueue();
    const a = ensureAudio();
    if (!a.src && P.queue.length) return playAt(P.idx < 0 ? 0 : P.idx);
    if (!a.src) { try { toast('music', 'Nada na fila.'); } catch {} return false; }
    if (a.paused) { const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); }
    else a.pause();
    paintSide();
  }
  function next(auto) { if (!P.queue.length) return; playAt(P.idx + 1); }
  function prev() { if (!P.queue.length) return; playAt(P.idx - 1); }
  function isPlaying() { try { return !!(!ensureAudio().paused && ensureAudio().src); } catch { return false; } }
  function now() { return P.track(); }

  function paintBar() {
    const bar = $('#musicBar'); if (!bar) return;
    const t = P.track();
    bar.hidden = !t && !P.queue.length;
    if (t) {
      $('#mbTitle').textContent = t.title || '—';
      $('#mbArtist').textContent = (t.artist || '') + (t.source ? ' · ' + t.source : '');
      $('#mbDl').onclick = () => window.MusicRepos && MusicRepos.download(t);
    }
    paintPlay();
  }
  function paintPlay() {
    const b = $('#mbPlay'); if (!b || !P.audio) return;
    b.innerHTML = `<i data-lucide="${P.audio.paused ? 'play' : 'pause'}"></i>`;
    try { window.lucide && lucide.createIcons(); } catch {}
    paintSidePlay();
  }
  /* ── Player lateral esquerdo (premium minimalista) ── */
  function paintSide() {
    const card = $('#musicSide'); if (!card) return;
    const t = P.track();
    const dot = $('#sbDot');
    if (dot) { dot.dataset.state = P.audio && !P.audio.paused && t ? 'playing' : (t ? 'paused' : 'idle'); }
    if (!t) { paintSidePlay(); return; }
    if ($('#sbTitle')) $('#sbTitle').textContent = t.title || '—';
    if ($('#sbArtist')) $('#sbArtist').textContent = (t.artist || '') + (t.source ? ' · ' + t.source : '');
    paintSidePlay(); paintSideProg();
  }
  function paintSidePlay() {
    const b = $('#sbPlay'); if (!b) return;
    const playing = P.audio && !P.audio.paused && !!P.audio.src;
    b.innerHTML = `<i data-lucide="${playing ? 'pause' : 'play'}"></i>`;
    b.classList.toggle('live', !!playing);
    try { window.lucide && lucide.createIcons(); } catch {}
  }
  function paintSideProg() {
    const a = P.audio, p = $('#sbProg'), tm = $('#sbTime');
    if (!a || !p) return;
    const d = a.duration || 0, c = a.currentTime || 0;
    p.value = d ? (c / d * 100) : 0;
    if (tm) tm.textContent = d ? `${fmt(c)} / ${fmt(d)}` : (a.src ? 'carregando…' : '');
  }
  function renderLocal() {
    const box = $('#sbLocal'); if (!box) return;
    const LM = window.LocalMusic;
    const list = LM ? LM.list() : [];
    const cnt = $('#sbCount'); if (cnt) cnt.textContent = list.length ? `${list.length}` : '0';
    box.innerHTML = list.length ? list.map(t =>
      `<div class="mside-row" data-id="${esc(t.id)}"><button class="iconbtn" data-lplay="${esc(t.id)}" title="Tocar ${esc(t.title)}"><i data-lucide="play"></i></button><div class="mtxt"><b>${esc(t.title)}</b><small>meu computador</small></div><button class="iconbtn danger" data-lrm="${esc(t.id)}" title="Remover"><i data-lucide="x"></i></button></div>`
    ).join('') : '<p class="hint" style="margin:0">Nenhum arquivo ainda.<br>Toque em <b>+ arquivos</b> ou <b>pasta</b>.</p>';
    box.querySelectorAll('[data-lplay]').forEach(b => b.onclick = () => {
      const t = (window.LocalMusic.list() || []).find(x => x.id === b.dataset.lplay);
      if (t) playTrack(t);
    });
    box.querySelectorAll('[data-lrm]').forEach(b => b.onclick = async () => { await window.LocalMusic.remove(b.dataset.lrm); });
    try { window.lucide && lucide.createIcons(); } catch {}
  }
  function paintProg() {
    const a = P.audio, p = $('#mbProg'), tm = $('#mbTime');
    if (!a || !p) return;
    const d = a.duration || 0, c = a.currentTime || 0;
    p.value = d ? (c / d * 100) : 0;
    if (tm) tm.textContent = d ? `${fmt(c)} / ${fmt(d)}` : '';
    paintSideProg();
  }
  function fmt(s) { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  function trackCard(t, i) {
    return `<div class="mrow" data-i="${i}">
      <button class="iconbtn mplay" data-play="${i}" title="Tocar">${'<i data-lucide="play"></i>'}</button>
      <div class="mtxt"><b>${esc(t.title)}</b><small>${esc(t.artist || '')} · ${esc(t.source || '')} · ${esc(t.license || '')}</small></div>
      <button class="iconbtn" data-add="${i}" title="Na fila">${'<i data-lucide="list-plus"></i>'}</button>
      <a class="iconbtn" href="${esc(t.downloadUrl || t.url)}" download target="_blank" rel="noopener" title="Baixar MP3">${'<i data-lucide="download"></i>'}</a>
    </div>`;
  }

  function renderResults(list) {
    const box = $('#musicResults'); if (!box) return;
    box.innerHTML = list.length ? list.map(trackCard).join('') : '<p class="hint">Nada aqui. Tente "lofi", "jazz", "piano", "samba".</p>';
    box.querySelectorAll('[data-play]').forEach(b => b.onclick = () => playTrack(list[+b.dataset.play]));
    box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const t = list[+b.dataset.add];
      if (!P.queue.some(x => x.url === t.url)) P.queue.push(t);
      P.save(); renderQueue(); paintBar();
      try { toast('list-plus', `Na fila: <b>${esc(t.title)}</b>`); } catch {}
    });
    try { window.lucide && lucide.createIcons(); } catch {}
  }

  function renderQueue() {
    const box = $('#musicQueue'); if (!box) return;
    box.innerHTML = P.queue.length ? P.queue.map((t, i) =>
      `<div class="mrow${i === P.idx ? ' on' : ''}"><div class="mtxt"><b>${i + 1}. ${esc(t.title)}</b><small>${esc(t.artist || '')}</small></div>
      <button class="iconbtn" data-q="${i}" title="Tocar">${'<i data-lucide="play"></i>'}</button>
      <button class="iconbtn danger" data-rm="${i}" title="Remover">${'<i data-lucide="x"></i>'}</button></div>`).join('')
      : '<p class="hint">Fila vazia. Busque acima ou peça no chat: <code>toca lofi</code>.</p>';
    box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => playAt(+b.dataset.q));
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      P.queue.splice(+b.dataset.rm, 1);
      if (P.idx >= P.queue.length) P.idx = P.queue.length - 1;
      P.save(); renderQueue(); paintBar();
    });
    try { window.lucide && lucide.createIcons(); } catch {}
  }

  function renderRepos() {
    const box = $('#musicRepos'); if (!box || !window.MusicRepos) return;
    box.innerHTML = MusicRepos.REPOS.map(r =>
      `<a class="mrepo" href="${esc(r.url)}" target="_blank" rel="noopener"><b>${esc(r.name)}</b><small>${esc(r.desc)}</small><span class="pill">${esc(r.tag)}</span></a>`).join('');
  }

  async function doSearch(q) {
    const box = $('#musicResults'); if (box) box.innerHTML = '<p class="hint">Buscando em Archive.org + Wikimedia…</p>';
    try {
      const src = ($('#musicSource') || {}).value || 'all';
      const list = await MusicRepos.search(q || 'lofi', src, 8);
      renderResults(list);
      return list;
    } catch (e) {
      if (box) box.innerHTML = `<p class="hint">Falha na busca (${esc(e.message)}). Tente de novo ou use os repositórios abaixo.</p>`;
      return [];
    }
  }

  // API usada pelo chat/agente
  async function searchAndPlay(q) {
    const list = await doSearch(q);
    if (list[0]) { playTrack(list[0]); return list[0]; }
    return null;
  }
  async function searchAndDownload(q) {
    const list = await doSearch(q);
    if (list[0]) { await MusicRepos.download(list[0]); return list[0]; }
    return null;
  }

  function bind() {
    ensureAudio();
    $('#mbPlay') && ($('#mbPlay').onclick = toggle);
    $('#mbNext') && ($('#mbNext').onclick = () => next());
    $('#mbPrev') && ($('#mbPrev').onclick = prev);
    $('#mbProg') && ($('#mbProg').oninput = e => { const a = ensureAudio(); if (a.duration) a.currentTime = e.target.value / 100 * a.duration; });
    $('#mbVol') && ($('#mbVol').oninput = e => { ensureAudio().volume = e.target.value / 100; });
    // lateral
    $('#sbPlay') && ($('#sbPlay').onclick = toggle);
    $('#sbNext') && ($('#sbNext').onclick = () => next());
    $('#sbPrev') && ($('#sbPrev').onclick = prev);
    $('#sbProg') && ($('#sbProg').oninput = e => { const a = ensureAudio(); if (a.duration) a.currentTime = e.target.value / 100 * a.duration; });
    $('#sbToggle') && ($('#sbToggle').onclick = e => { e.stopPropagation(); const c = $('#musicSide'); if (c) c.classList.toggle('min'); });
    const msh = $('#musicSideHead');
    if (msh && !msh.dataset.bind) { msh.dataset.bind = '1'; msh.onclick = e => { if (e.target.closest('button')) return; const c = $('#musicSide'); if (c) c.classList.toggle('min'); }; }
    $('#sbAdd') && ($('#sbAdd').onclick = () => $('#filePick') && $('#filePick').click());
    $('#sbFolder') && ($('#sbFolder').onclick = () => $('#folderPick') && $('#folderPick').click());
    $('#filePick') && ($('#filePick').onchange = async e => {
      const n = await window.LocalMusic.addFiles(e.target.files);
      e.target.value = '';
      try { toast('music', n ? `<b>${n}</b> música(s) na biblioteca.` : 'Nenhum áudio válido.'); } catch {}
    });
    $('#folderPick') && ($('#folderPick').onchange = async e => {
      const n = await window.LocalMusic.addFiles(e.target.files);
      e.target.value = '';
      try { toast('folder', n ? `<b>${n}</b> áudio(s) da pasta.` : 'Nenhum áudio na pasta.'); } catch {}
    });
    document.addEventListener('localmusic:changed', () => { sanitizeQueue(); renderLocal(); renderQueue(); paintBar(); paintSide(); });
    $('#musicGo') && ($('#musicGo').onclick = () => doSearch($('#musicSearch').value.trim() || 'lofi'));
    $('#musicSearch') && $('#musicSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(e.target.value.trim() || 'lofi'); } });
    sanitizeQueue();
    renderRepos(); renderQueue(); renderLocal(); paintBar(); paintSide();
    if (P.queue[P.idx]) { const t = freshLocal(P.queue[P.idx]); if (t) { P.queue[P.idx] = t; P.save(); const a = ensureAudio(); if (!a.src) { a.src = t.url; paintBar(); } } }
  }

  window.MusicPlayer = { playTrack, playAt, toggle, next, prev, isPlaying, now, doSearch, searchAndPlay, searchAndDownload, renderResults, renderQueue, renderLocal, paintSide, get queue() { return P.queue; } };
  document.addEventListener('DOMContentLoaded', bind);
  if (document.readyState !== 'loading') bind(); else setTimeout(bind, 800);
})();
