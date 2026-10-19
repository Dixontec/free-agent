/* ═══════════ Free Agent · Verificação de atualizações ═══════════
   Ícone de notificação no topbar + card com o que mudou no release.
   Fonte: API pública de GitHub Releases (sem chave, sem backend):
          https://github.com/Dixontec/free-agent
   - Busca automático ao abrir (cache local de 6h) e sob demanda no card.
   - Vermelhinho no ícone só quando há versão maior publicada. */
'use strict';
(function () {
  const API = 'https://api.github.com/repos/Dixontec/free-agent/releases/latest';
  const REPO = 'https://github.com/Dixontec/free-agent/releases';
  const APP_VERSION = '1.0.0'; /* mantém em sincronia com package.json */
  const KEY = 'nexus:updchk';
  const TTL = 6 * 60 * 60 * 1000; /* 6h entre buscas automáticas */
  const COOL = 20 * 1000;         /* 20s entre verificações manuais */
  const $ = s => document.querySelector(s);

  const wrap = $('.upd-wrap'), btn = $('#btnUpdate'), card = $('#updCard');
  if (!wrap || !btn || !card) return;

  let state = null;
  try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { state = null; }
  let busy = false, lastTry = 0;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const norm = v => String(v || '').trim().replace(/^v/i, '');
  function isNewer(remote) {
    const a = norm(remote).split('.').map(n => parseInt(n, 10) || 0);
    const b = norm(APP_VERSION).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      if ((a[i] || 0) > (b[i] || 0)) return true;
      if ((a[i] || 0) < (b[i] || 0)) return false;
    }
    return false;
  }
  function icons() { try { window.lucide && lucide.createIcons(); } catch {} }
  function stale(ms) { return !state || !state.ts || (Date.now() - state.ts) > ms; }
  const needsAssets = () => !!(state && state.hasUpdate && !(state.assets && state.assets.length));

  function paintDot() {
    const d = $('#updDot');
    if (d) d.hidden = !(state && state.hasUpdate);
  }

  /* Release vem em Markdown — só alisa o básico pra ler bem no card. */
  function mdPlain(s) {
    return String(s || '')
      .replace(/```[a-z]*\n?/gi, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__([^_]+?)__/g, '$1')
      .replace(/`([^`]+?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .trim();
  }

  function acts(upd) {
    let links = '';
    if (upd) {
      const assets = state.assets || [];
      const lin = assets.find(a => /\.appimage$|linux|x86_64/i.test(a.name || '')) || null;
      const win = assets.find(a => /\.exe$|win(32|64|dows)/i.test(a.name || '')) || null;
      if (lin) links += `<a class="btn primary sm" href="${esc(lin.url)}" target="_blank" rel="noopener"><i data-lucide="download"></i>Baixar Linux</a>`;
      if (win) links += `<a class="btn ${lin ? 'ghost' : 'primary'} sm" href="${esc(win.url)}" target="_blank" rel="noopener"><i data-lucide="download"></i>Baixar Windows</a>`;
      links += `<a class="btn ${lin || win ? 'ghost' : 'primary'} sm" href="${esc(state.url || REPO)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Ver release</a>`;
    }
    return `<div class="upd-acts">${links}<button type="button" class="btn ghost sm" data-upd-recheck><i data-lucide="refresh-cw"></i>Verificar</button></div>`;
  }

  function cardHTML() {
    if (!state) return `<h4><i data-lucide="refresh-cw"></i>Atualizações</h4><div class="upd-notes">Verificando atualizações…</div>`;
    if (state.failed) return `<h4><i data-lucide="wifi-off"></i>Não foi possível verificar</h4><div class="upd-notes">Sem resposta do GitHub agora — a rede pode estar fora.</div>${acts(false)}`;
    if (state.hasUpdate) {
      const notes = mdPlain(state.notes).slice(0, 6000);
      return `<h4><i data-lucide="bell-ring"></i>Nova versão disponível <span class="upd-tag">${esc(state.tag || '')}</span></h4>
        <div class="upd-notes">${esc(notes || 'Sem descrição publicada neste release.')}</div>${acts(true)}`;
    }
    const rel = state.tag ? ` · último release <b>${esc(state.tag)}</b>` : '';
    return `<h4><i data-lucide="check-circle-2"></i>Free Agent atualizado</h4>
      <div class="upd-notes">Você já está na versão <b>v${esc(APP_VERSION)}</b>${rel}.</div>${acts(false)}`;
  }

  function render() {
    card.innerHTML = cardHTML();
    const rb = card.querySelector('[data-upd-recheck]');
    if (rb) rb.onclick = () => check(true);
    icons();
  }

  function open() {
    render();
    card.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('show')));
    if (stale(30 * 60 * 1000) || needsAssets()) check(false);
  }
  function close() {
    card.classList.remove('show');
    setTimeout(() => { if (!card.classList.contains('show')) card.hidden = true; }, 200);
  }

  async function check(force) {
    if (busy) return;
    if (force && Date.now() - lastTry < COOL) return;
    if (!force && !stale(TTL) && !needsAssets()) { paintDot(); return; }
    busy = true; lastTry = Date.now();
    try {
      const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      state = {
        tag: String(j.tag_name || ''),
        notes: String(j.body || ''),
        url: String(j.html_url || REPO),
        published: String(j.published_at || ''),
        hasUpdate: isNewer(j.tag_name),
        assets: Array.isArray(j.assets)
          ? j.assets.map(a => ({ name: String(a.name || ''), url: String(a.browser_download_url || '') }))
          : [],
        ts: Date.now(),
      };
      save();
    } catch {
      /* falha: mantém o cache; sem cache nenhum, sinaliza pra mostrar o card */
      if (!(state && state.tag)) state = { tag: '', notes: '', url: REPO, hasUpdate: false, failed: true, ts: 0 };
    } finally {
      busy = false;
      paintDot();
      if (!card.hidden) render();
    }
  }

  btn.onclick = () => { if (card.hidden) open(); else close(); };
  document.addEventListener('mousedown', e => { if (!card.hidden && !wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !card.hidden) close(); });

  paintDot();
  const boot = () => { icons(); paintDot(); setTimeout(() => check(false), 4000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
