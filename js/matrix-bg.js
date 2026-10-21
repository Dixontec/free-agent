/* ═══════════ Free Agent · Fundo Matrix — Chuva Digital (Canvas 2D) ═══════════
   Motor procedural, zero dependências e zero assets externos.
   Camada frontal transparente: cada frame apaga parcialmente o alpha do
   rastro com destination-out, sem pintar preto sobre a interface. A cabeça é repintada em
   verde saturado ao migrar de célula (evita fade acinzentado), e a nova cabeça
   nasce em verde-branco. Delta-time → idêntico em 60/144 Hz. Camadas de
   profundidade (velocidade + alpha) dão a distribuição orgânica.
   Movimento reduzido (prefers-reduced-motion) → quadro estático, sem rAF.
   API: window.__matrixBg = { setActive(on), setIntensity(0-100), active, running }
*/
(function () {
  'use strict';

  const CELL = 16;                     // célula lógica (px)
  const FADE_RATE = -Math.log(1 - 0.065) * 60; // mesma meia-vida em 60/144 Hz
  const FONT = '500 ' + CELL + 'px "JetBrains Mono", Consolas, "DejaVu Sans Mono", monospace';
  const KANA = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
  const ASCII = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const SYMS = '=+-*<>[]{}#/\\|:;.,?@$%&_';

  const canvas = document.getElementById('bgMatrix');
  if (!canvas) return;
  let ctx = null;
  try { ctx = canvas.getContext('2d', { alpha: true }); } catch { ctx = null; }
  if (!ctx) { canvas.style.display = 'none'; console.warn('[matrix-bg] Canvas 2D indisponível — fundo desligado'); return; }

  const i18nT = (k, fb) => (window.I18N && window.I18N.t) ? window.I18N.t(k) : fb;
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');

  let charset = null;
  let cols = [], colsN = 0, rowsN = 0, rowsPrev = 0;
  let active = false, paused = false, raf = 0, lastT = 0, resizeQueued = 0;
  let intensity = 0.7;
  let centerOnly = false;
  const pane = document.getElementById('chatPane');

  // Recorte em coordenadas de viewport: acompanha grid, zoom e scroll sem
  // criar outro renderer nem mudar a hierarquia dos painéis da interface.
  function updateClip() {
    if (!centerOnly) { canvas.style.clipPath = ''; return; }
    if (!pane) { canvas.style.clipPath = 'inset(100%)'; return; }
    const rect = pane.getBoundingClientRect();
    canvas.style.clipPath = `inset(${Math.max(0, rect.top)}px ${Math.max(0, innerWidth - rect.right)}px ${Math.max(0, innerHeight - rect.bottom)}px ${Math.max(0, rect.left)}px round 20px)`;
  }

  function setScope(center) {
    centerOnly = !!center;
    updateClip();
  }

  /* Largura não prova cobertura: fontes monoespaçadas podem dar o mesmo
     advance a ASCII e ao glifo ausente. ASCII nunca passa pelo filtro. */
  function buildCharset() {
    ctx.font = FONT;
    const tofu = ctx.measureText('\uE000').width;
    const probe = s => [...s].filter(ch => ctx.measureText(ch).width !== tofu);
    const kana = probe(KANA);
    const rest = [...ASCII, ...SYMS];
    if (!kana.length) console.info('[matrix-bg] meio-kana sem cobertura neste sistema — usando alfanumérico+símbolos');
    charset = (kana.length ? kana : []).concat(rest);
    if (!charset.length) charset = [...ASCII];
  }

  /* ── Coluna: velocidade/alpha por profundidade; cores pré-computadas
        (zero concat de string por frame) ── */
  function makeColumn(i, y0) {
    const depth = Math.random();                              // 0 = perto … 1 = longe
    const alpha = 1 - depth * 0.45;
    const lig = 36 + (1 - depth) * 18;
    return {
      x: i, y: y0, last: -1,
      speed: 5 + (1 - depth) * 17 + Math.random() * 3,        // células/s
      glyph: charset[(Math.random() * charset.length) | 0],
      head: 'hsl(120,100%,' + (88 + (1 - depth) * 6) + '%)',
      trail: 'hsla(130,85%,' + lig + '%,' + alpha + ')',
      mut: 0.15 + Math.random() * 0.25                        // chance de mutar ao migrar
    };
  }

  function rebuild() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // resize do canvas zera o estado do contexto — fonte/aligno voltam aqui
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    colsN = Math.ceil(w / CELL);
    rowsN = Math.ceil(h / CELL);
    const oldCols = cols, oldRows = rowsPrev || rowsN;
    cols = new Array(colsN);
    for (let i = 0; i < colsN; i++) {
      const prev = oldCols[i];
      const y0 = prev ? (prev.y / oldRows) * rowsN : Math.random() * rowsN;
      cols[i] = makeColumn(i, y0);
    }
    rowsPrev = rowsN;
  }

  function paint(col, cellY, color) {
    ctx.fillStyle = color;
    ctx.fillText(col.glyph, col.x * CELL + CELL / 2, cellY * CELL + CELL / 2);
  }

  /* ── Quadro estático (movimento reduzido): composição completa em 1 pass ── */
  function staticFrame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = 0; i < colsN; i++) {
      const c = cols[i];
      if (!c) continue;
      const cy = Math.floor(c.y);
      const len = 8 + ((Math.random() * 14) | 0);
      for (let k = len; k > 0; k--) {
        ctx.globalAlpha = (1 - k / len) * 0.9;
        paint(c, cy - k, c.trail);
      }
      ctx.globalAlpha = 1;
      if (cy >= 0 && cy <= rowsN) paint(c, cy, c.head);
    }
  }

  function running() {
    return active && !paused && !mqReduce.matches && !document.hidden;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!running()) { cancelAnimationFrame(raf); raf = 0; return; }
    // Continue the selected theme while browsing, at a bounded decorative rate.
    if (document.body?.classList?.contains('browser-workspace') && now-lastT < 1000/30) return;
    const dt = Math.max(0, Math.min((now - lastT) / 1000, 0.05));
    lastT = now;
    const mul = 0.4 + intensity * 1.2;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,' + (1 - Math.exp(-FADE_RATE * dt)) + ')';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < colsN; i++) {
      const c = cols[i];
      if (!c) continue;
      c.y += c.speed * mul * dt;
      const cy = Math.floor(c.y);
      if (cy > rowsN + 2) {                                   // wrap: renasce acima
        cols[i] = makeColumn(i, -Math.random() * rowsN * 0.35);
        continue;
      }
      if (cy !== c.last) {
        if (c.last >= 0) paint(c, c.last, c.trail);           // antiga cabeça → verde saturado
        if (Math.random() < c.mut) c.glyph = charset[(Math.random() * charset.length) | 0];
        c.last = cy;
      }
      if (cy >= 0) paint(c, cy, c.head);
    }
  }

  function sync() {
    const want = running();
    if (want && !raf) {
      if (!cols.length) rebuild();
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!want && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (active && !paused && !document.hidden && mqReduce.matches) staticFrame();
  }

  function setActive(on) {
    on = !!on;
    if (on && !active) {
      if (!charset) buildCharset();
      rebuild();
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
    active = on;
    if (on) updateClip();
    if (!on && resizeQueued) {
      cancelAnimationFrame(resizeQueued);
      resizeQueued = 0;
    }
    sync();
  }

  function setIntensity(v) {
    const n = +v;
    intensity = isNaN(n) ? 0.7 : Math.min(1, Math.max(0, n / 100));
  }

  /* ── Controles existentes: pausa (botão global) + intensidade (slider) ── */
  function paintPauseLabel() {
    const btn = document.getElementById('btnFxToggle');
    if (!btn) return;
    const key = paused ? 'set.resumeBg' : 'set.pauseBg';
    btn.innerHTML = '<i data-lucide="' + (paused ? 'play' : 'pause') + '"></i>' +
      '<span data-i18n="' + key + '">' + i18nT(key, paused ? 'Retomar fundo' : 'Pausar fundo') + '</span>';
    try { if (window.lucide) lucide.createIcons(); } catch {}
  }
  document.getElementById('btnFxToggle')?.addEventListener('click', () => { paused = !paused; paintPauseLabel(); sync(); });
  document.getElementById('fxIntensity')?.addEventListener('input', e => setIntensity(e.target.value));
  setIntensity(document.getElementById('fxIntensity')?.value ?? 70);

  /* ── Ciclo de vida: resize (grade recalculada, y proporcional), aba oculta,
        movimento reduzido ao vivo ── */
  addEventListener('resize', () => {
    if (!active || resizeQueued) return;
    resizeQueued = requestAnimationFrame(() => {
      resizeQueued = 0;
      if (!active) return;
      updateClip();
      rebuild();
      // Alterar width/height limpa o canvas, inclusive quando pausado.
      if (!running() && !document.hidden) staticFrame();
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lastT = performance.now();
    sync();
  });
  const onReduce = () => { sync(); };
  try { mqReduce.addEventListener('change', onReduce); } catch { try { mqReduce.addListener(onReduce); } catch {} }
  addEventListener('scroll', () => { if (active && centerOnly) updateClip(); }, { passive: true, capture: true });
  if (pane && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { if (active && centerOnly) updateClip(); }).observe(pane);
  }

  window.__matrixBg = {
    setScope,
    setActive,
    setIntensity,
    get active() { return active; },
    get running() { return running(); }
  };
})();
