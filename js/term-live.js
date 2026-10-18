/* ═══════════ Free Agent · Terminal ao vivo ═══════════
   Terminal em tempo real exibido DENTRO do monitor (card Nexus, canto superior
   direito) no lugar do "standby". Recebe as linhas do log() do app e de outros
   pontos (telegram, coding, rotinas) e redesenha o buffer com auto-scroll.
   Buffer em memória, cap (MAX) — nada persiste além disso. */
'use strict';
window.Term = (() => {
  const MAX = 500;
  const lines = [];

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());

  function push(msg, kind) {
    lines.push({ t: new Date(), msg: String(msg ?? ''), kind: String(kind || 'info') });
    if (lines.length > MAX) lines.splice(0, lines.length - MAX);
    render();
  }

  function render() {
    let boxes;
    try { boxes = document.querySelectorAll('.sb-term-body'); } catch { return; }
    if (!boxes || !boxes.length) return;
    const html = lines.map(l =>
      `<div class="tl ${esc(l.kind)}"><i class="tl-t">${fmt(l.t)}</i><s>${esc(l.msg)}</s></div>`
    ).join('');
    for (const b of boxes) {
      const near = (b.scrollHeight - b.scrollTop - b.clientHeight) < 60;
      b.innerHTML = html;
      if (near || b.dataset.lock !== '1') b.scrollTop = b.scrollHeight;
    }
  }

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
  return { push, render, seed, lines };
})();
