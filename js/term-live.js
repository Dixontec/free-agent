/* ═══════════ Free Agent · Terminal ao vivo ═══════════
   Terminal em tempo real exibido DENTRO do monitor (card Nexus, canto superior
   direito) no lugar do "standby". Recebe as linhas do log() do app e de outros
   pontos (telegram, coding, rotinas) e redesenha o buffer com auto-scroll.
   Buffer em memória, cap (MAX) — nada persiste além disso. */
'use strict';
window.Term = (() => {
  const MAX = 500;
  const lines = [];
  let auto = true;
  let rolling = false, rollRaf = 0;

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());

  function push(msg, kind) {
    lines.push({ t: new Date(), msg: String(msg ?? ''), kind: String(kind || 'info') });
    if (lines.length > MAX) lines.splice(0, lines.length - MAX);
    render();
  }

  /* Sincroniza o botão discreto de pausa + indicador em todas as barras. */
  function syncRoll() {
    try {
      document.querySelectorAll('[data-roll]').forEach(btn => {
        btn.title = auto ? 'Pausar autorrolagem' : 'Continuar autorrolagem';
        const ic = auto ? 'pause' : 'play';
        if (btn.dataset.ic !== ic) {
          btn.dataset.ic = ic;
          btn.innerHTML = `<i data-lucide="${ic}"></i>`;
          if (window.lucide) lucide.createIcons();
        }
      });
      document.querySelectorAll('.sb-term').forEach(t => t.classList.toggle('paused', !auto));
      document.querySelectorAll('.sb-term-n').forEach(n => { const txt = auto ? '● live' : '⏸ pausado'; if (n.textContent !== txt) n.textContent = txt; });
    } catch {}
  }

  function setAuto(v) { auto = v !== false; syncRoll(); }

  function render() {
    let boxes;
    try { boxes = document.querySelectorAll('.sb-term-body'); } catch { return; }
    if (!boxes || !boxes.length) { syncRoll(); return; }
    syncRoll();
    const html = lines.map(l =>
      `<div class="tl ${esc(l.kind)}"><i class="tl-t">${fmt(l.t)}</i><s>${esc(l.msg)}</s></div>`
    ).join('');
    for (const b of boxes) {
      const keep = b.scrollTop;
      b.innerHTML = html;
      if (auto && !rolling) b.scrollTop = b.scrollHeight;
      else b.scrollTop = keep;
    }
  }

  function cancelRoll() {
    rolling = false;
    if (rollRaf) { cancelAnimationFrame(rollRaf); rollRaf = 0; }
  }

  /* Abertura do monitor: rola o terminal inteiro até o fim num corte rápido
     (450ms) e entrega ele em tempo real, no rodapé, com autorroll ativo. */
  function rollOpen(dur = 450) {
    cancelRoll();
    const boxes = Array.from(document.querySelectorAll('.sb-term-body'));
    if (!boxes.length || !auto) { render(); return; }
    const starts = boxes.map(b => b.scrollTop);
    const t0 = performance.now();
    rolling = true;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      let animating = false;
      boxes.forEach((b, i) => {
        const end = b.scrollHeight - b.clientHeight;
        const start = starts[i];
        if (end <= 0) return;
        if (end - start < 40) { b.scrollTop = end; return; }
        b.scrollTop = Math.max(0, start + (end - start) * e);
        if (k < 1) animating = true;
      });
      if (animating && rolling && auto) { rollRaf = requestAnimationFrame(step); }
      else {
        rolling = false; rollRaf = 0;
        boxes.forEach(b => { if (auto) b.scrollTop = b.scrollHeight; });
      }
    };
    rollRaf = requestAnimationFrame(step);
  }

  /* Clique no botãozinho discreto da barra: pausa/retoma o autorroll.
     Com o autorroll pausado, o usuário sobe no scroll e vê todo o histórico. */
  document.addEventListener('click', e => {
    const btn = e.target && e.target.closest && e.target.closest('[data-roll]');
    if (!btn) return;
    auto = !auto;
    cancelRoll();
    syncRoll();
    render();
  });

  /* seed: reconstrói o buffer a partir do log persistido (fonte única).
     Roda no DOMContentLoaded — como o log() grava na store ANTES de dar push,
     nada se perde mesmo com logs já emitidos durante o boot. */
  function seed() {
    try {
      const hist = store.get('log', []);
      if (!Array.isArray(hist) || !hist.length) return;
      lines.length = 0;
      hist.slice(0, MAX).reverse().forEach(e => lines.push({
        t: e.iso ? new Date(e.iso) : new Date(), msg: String(e.msg || ''), kind: String(e.kind || 'info')
      }));
      render();
    } catch {}
  }

  window.addEventListener('DOMContentLoaded', () => { seed(); render(); });
  return { push, render, seed, lines, setAuto, syncRoll, rollOpen, cancelRoll };
})();
