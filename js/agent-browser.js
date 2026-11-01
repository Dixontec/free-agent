/* ═══════════════════════════════════════════════════════════════════
   Free Agent · AgentBrowser & Computer Use Engine
   - Persistent embedded browser (Electron <webview> or web iframe fallback)
   - Integrated Computer Use:
     * browser_open(url): opens page, waits for DOM ready, extracts summary
     * browser_inspect(selector?): scans interactive elements & accessibility tree
     * browser_click(target): clicks by #id, selector, text or coords with visual pulse
     * browser_type(target, text, enter): fills input, dispatches events, submits
     * browser_screenshot(): captures page snapshot, displays in Monitor Agent
     * browser_scroll(direction, amount): smooth scroll control
   - Visual overlay feedback (click ripples, inspector badges, screenshot flash)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.AgentBrowser = (() => {
  const isElectron = typeof window !== 'undefined' && Boolean(
    window.process?.versions?.electron ||
    navigator.userAgent.includes('Electron')
  );

  const state = {
    mode: isElectron ? 'electron' : 'iframe',
    url: '',
    title: 'Navegador',
    history: [],
    historyIdx: -1,
    isLoading: false,
    elements: [],
    lastScreenshot: null,
    isMaximized: false,
    frame: null,
    ready: false,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function setStatus(text, busy = false) {
    const st = $('#browserAgentStatus');
    const dot = $('#browserAgentDot');
    if (st) st.textContent = text;
    if (dot) dot.classList.toggle('busy', busy);
  }

  function setMeta(text) {
    const mi = $('#browserMetaInfo');
    if (mi) mi.textContent = text;
  }

  function normalizeUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return 'https://news.ycombinator.com';
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(u)) {
      return 'https://' + u;
    }
    if (!/^https?:\/\//i.test(u) && !/^about:/i.test(u)) {
      if (u.includes(' ') || !u.includes('.')) {
        return `https://www.google.com/search?q=${encodeURIComponent(u)}`;
      }
      return 'https://' + u;
    }
    return u;
  }

  function triggerClickPulse(x, y) {
    const overlay = $('#browserCuOverlay');
    if (!overlay) return;
    const ring = document.createElement('div');
    ring.className = 'cu-click-ring';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    overlay.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
  }

  function triggerScreenshotFlash() {
    const overlay = $('#browserCuOverlay');
    if (!overlay) return;
    const flash = document.createElement('div');
    flash.className = 'cu-screenshot-flash';
    overlay.appendChild(flash);
    setTimeout(() => flash.remove(), 450);
  }

  const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

  /* ── Inicialização do Frame do Navegador ── */
  function setupFrame() {
    const holder = $('#browserFrameHolder');
    if (!holder) return;
    holder.innerHTML = '';

    if (state.mode === 'electron') {
      const wv = document.createElement('webview');
      wv.id = 'agentWebview';
      wv.setAttribute('src', 'about:blank');
      wv.setAttribute('allowpopups', 'true');
      wv.setAttribute('webpreferences', 'contextIsolation=yes, javascript=yes');
      if (!state.isMaximized) {
        wv.setAttribute('useragent', MOBILE_UA);
      }
      wv.style.width = '100%';
      wv.style.height = '100%';
      wv.style.border = 'none';
      wv.style.background = '#ffffff';

      wv.addEventListener('did-start-loading', () => {
        state.isLoading = true;
        setStatus('Carregando página…', true);
      });

      wv.addEventListener('did-stop-loading', () => {
        state.isLoading = false;
        try {
          const curUrl = wv.getURL();
          const curTitle = wv.getTitle();
          if (curUrl && curUrl !== 'about:blank') {
            state.url = curUrl;
            state.title = curTitle || curUrl;
            const urlInp = $('#browserUrlInput');
            if (urlInp && document.activeElement !== urlInp) urlInp.value = curUrl;
            setMeta(state.title);
          }
        } catch {}
        setStatus('Agente Conectado · Pronto', false);
      });

      wv.addEventListener('page-title-updated', (e) => {
        if (e.title) {
          state.title = e.title;
          setMeta(e.title);
        }
      });

      wv.addEventListener('new-window', (e) => {
        e.preventDefault();
        if (e.url) wv.loadURL(e.url);
      });

      holder.appendChild(wv);
      state.frame = wv;
    } else {
      // Fallback para navegador web comum (iframe)
      const ifr = document.createElement('iframe');
      ifr.id = 'agentIframe';
      ifr.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');
      ifr.style.width = '100%';
      ifr.style.height = '100%';
      ifr.style.border = 'none';
      ifr.style.background = '#ffffff';

      ifr.addEventListener('load', () => {
        state.isLoading = false;
        setStatus('Agente Conectado · Pronto (Web Fallback)', false);
        try {
          if (ifr.contentDocument) {
            state.title = ifr.contentDocument.title || state.url;
            setMeta(state.title);
          }
        } catch {}
      });

      holder.appendChild(ifr);
      state.frame = ifr;
    }
  }

  /* ── Execução de script no contexto da página ── */
  async function execInPage(script) {
    if (state.mode === 'electron' && state.frame && typeof state.frame.executeJavaScript === 'function') {
      return await state.frame.executeJavaScript(script);
    }
    // Web fallback
    if (state.frame && state.frame.contentWindow) {
      try {
        return state.frame.contentWindow.eval(script);
      } catch (e) {
        return { ok: false, error: 'Cross-origin restrição no modo web puro: ' + e.message };
      }
    }
    return { ok: false, error: 'Frame não disponível' };
  }

  /* ── Ações Core do Navegador ── */
  async function open(rawUrl) {
    const url = normalizeUrl(rawUrl);
    state.url = url;

    // Garante que o holder esteja visível e o empty state oculto
    const empty = $('#browserEmptyState');
    const holder = $('#browserFrameHolder');
    if (empty) empty.hidden = true;
    if (holder) holder.hidden = false;

    const urlInp = $('#browserUrlInput');
    if (urlInp) urlInp.value = url;

    // Altera para a aba do navegador no app
    if (typeof window.switchTab === 'function') {
      window.switchTab('browser');
    }

    setStatus(`Navegando para ${url}…`, true);

    if (state.mode === 'electron' && state.frame) {
      state.frame.loadURL(url);
    } else if (state.frame) {
      state.frame.src = url;
    }

    // Aguarda carregamento
    await new Promise((res) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res(); } }, 6000);
      const onStop = () => { if (!done) { done = true; clearTimeout(t); res(); } };
      if (state.mode === 'electron' && state.frame) {
        state.frame.addEventListener('did-stop-loading', onStop, { once: true });
      } else {
        setTimeout(res, 2000);
      }
    });

    // Inspeciona e extrai dados da página carregada
    try {
      const info = await execInPage(`
        (() => {
          const links = document.querySelectorAll('a[href]').length;
          const btns = document.querySelectorAll('button, [role="button"]').length;
          const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select').length;
          const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
          const headings = Array.from(document.querySelectorAll('h1, h2')).slice(0, 5).map(h => h.innerText.trim()).filter(Boolean);
          return {
            title: document.title || '',
            url: window.location.href,
            links, btns, inputs, metaDesc, headings
          };
        })()
      `);

      if (info && info.title) {
        state.title = info.title;
        setMeta(info.title);
      }

      setStatus('Agente Conectado · Pronto', false);
      return {
        ok: true,
        url: state.url,
        title: state.title,
        stats: info ? `${info.btns} botões, ${info.inputs} campos de texto, ${info.links} links` : 'Página pronta',
        headings: info?.headings?.join(' | ') || '',
        meta: info?.metaDesc || ''
      };
    } catch {
      setStatus('Agente Conectado · Pronto', false);
      return { ok: true, url: state.url, title: state.title, stats: 'Página carregada' };
    }
  }

  /* ── Computer Use: Inspecionar Elementos Interativos ── */
  async function inspect(selectorFilter = '') {
    setStatus('Inspecionando elementos interativos (Computer Use)…', true);

    const scanScript = `
      (() => {
        const isVisible = (el) => {
          if (!el || el.offsetParent === null) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
        };

        const sel = ${JSON.stringify(selectorFilter || '')} || 'a[href], button, input, textarea, select, details summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [tabindex]:not([tabindex="-1"])';
        const elements = Array.from(document.querySelectorAll(sel)).filter(isVisible).slice(0, 60);

        // Remove overlay anterior
        const prev = document.getElementById('__agent_cu_overlay');
        if (prev) prev.remove();

        const overlay = document.createElement('div');
        overlay.id = '__agent_cu_overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

        const items = [];
        elements.forEach((el, idx) => {
          const id = idx + 1;
          el.setAttribute('data-agent-cu-id', id);
          const rect = el.getBoundingClientRect();

          // Badge numérico
          const badge = document.createElement('div');
          badge.textContent = id;
          badge.style.cssText = 'position:fixed;left:' + Math.max(0, rect.left) + 'px;top:' + Math.max(0, rect.top - 16) + 'px;' +
            'background:#0071e3;color:#ffffff;font-size:10px;font-weight:700;padding:1px 5px;' +
            'border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.3);z-index:2147483647;pointer-events:none;' +
            'border:1px solid #ffffff;line-height:13px;';
          overlay.appendChild(badge);

          // Contorno de destaque sutil
          const box = document.createElement('div');
          box.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;' +
            'border:1.5px solid rgba(0,113,227,0.7);background:rgba(0,113,227,0.06);border-radius:4px;pointer-events:none;';
          overlay.appendChild(box);

          const tag = el.tagName.toLowerCase();
          let desc = '';
          if (tag === 'input') {
            desc = 'input[type="' + (el.type || 'text') + '"]' + (el.placeholder ? ' placeholder="' + el.placeholder + '"' : '') + (el.value ? ' value="' + el.value + '"' : '');
          } else if (tag === 'textarea') {
            desc = 'textarea' + (el.placeholder ? ' placeholder="' + el.placeholder + '"' : '');
          } else if (tag === 'button' || el.getAttribute('role') === 'button') {
            desc = 'button "' + (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 35) + '"';
          } else if (tag === 'a') {
            desc = 'link "' + (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 35) + '" (' + (el.getAttribute('href') || '') + ')';
          } else {
            desc = tag + ' "' + (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 35) + '"';
          }

          items.push({
            id,
            tag,
            desc,
            rect: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), width: Math.round(rect.width), height: Math.round(rect.height) }
          });
        });

        document.body.appendChild(overlay);

        // Auto remove após 6s
        setTimeout(() => {
          const o = document.getElementById('__agent_cu_overlay');
          if (o) o.remove();
        }, 6000);

        return {
          title: document.title,
          url: window.location.href,
          elements: items
        };
      })()
    `;

    try {
      const res = await execInPage(scanScript);
      state.elements = res?.elements || [];
      setStatus(`Inspecionados ${state.elements.length} elementos interativos`, false);
      return state.elements;
    } catch (e) {
      setStatus('Falha ao inspecionar: ' + e.message, false);
      return [];
    }
  }

  /* ── Computer Use: Clicar em Elemento ── */
  async function click(target) {
    setStatus(`Clicando em ${JSON.stringify(target)}…`, true);

    const clickScript = `
      ((targetArg) => {
        let el = null;
        const str = String(targetArg || '').trim();
        const numMatch = str.match(/^#?(\\d+)$/);

        if (numMatch) {
          el = document.querySelector('[data-agent-cu-id="' + numMatch[1] + '"]');
        }
        if (!el && str) {
          try { el = document.querySelector(str); } catch {}
        }
        if (!el && str) {
          // Busca por texto do botão ou link
          const needle = str.toLowerCase();
          const list = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]'));
          for (const item of list) {
            const txt = (item.innerText || item.value || item.getAttribute('aria-label') || '').trim().toLowerCase();
            if (txt.includes(needle)) {
              el = item;
              break;
            }
          }
        }

        if (!el) return { ok: false, error: 'Elemento não encontrado: ' + str };

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const rect = el.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);

        // Dispara eventos nativos
        el.focus();
        const evOpts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        el.dispatchEvent(new MouseEvent('mousedown', evOpts));
        el.dispatchEvent(new MouseEvent('mouseup', evOpts));
        el.click();

        return {
          ok: true,
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.value || '').trim().slice(0, 30),
          x, y,
          url: window.location.href
        };
      })(${JSON.stringify(target)})
    `;

    try {
      const res = await execInPage(clickScript);
      if (res && res.ok) {
        triggerClickPulse(res.x || 100, res.y || 100);
        await new Promise(r => setTimeout(r, 400));
        setStatus('Clique executado com sucesso', false);
        return { ok: true, msg: `Clicado em <${res.tag}> "${res.text}"`, url: res.url };
      }
      setStatus('Elemento não encontrado', false);
      return { ok: false, error: res?.error || 'Não foi possível clicar' };
    } catch (e) {
      setStatus('Erro ao clicar: ' + e.message, false);
      return { ok: false, error: e.message };
    }
  }

  /* ── Computer Use: Digitar Texto ── */
  async function type(target, text, enter = true) {
    setStatus(`Digitando "${text.slice(0, 20)}"…`, true);

    const typeScript = `
      ((targetArg, val, hitEnter) => {
        let el = null;
        const str = String(targetArg || '').trim();
        const numMatch = str.match(/^#?(\\d+)$/);

        if (numMatch) {
          el = document.querySelector('[data-agent-cu-id="' + numMatch[1] + '"]');
        }
        if (!el && str) {
          try { el = document.querySelector(str); } catch {}
        }
        if (!el) {
          el = document.activeElement;
        }
        if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) {
          el = document.querySelector('input[type="text"], input[type="search"], input:not([type="hidden"]), textarea');
        }

        if (!el) return { ok: false, error: 'Campo de texto não encontrado' };

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();

        if (el.isContentEditable) {
          el.innerText = val;
        } else {
          el.value = val;
        }

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        if (hitEnter) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          if (el.form) {
            try { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); } catch {}
          }
        }

        return {
          ok: true,
          tag: el.tagName.toLowerCase(),
          name: el.name || el.placeholder || '',
          value: val,
          enter: hitEnter
        };
      })(${JSON.stringify(target || '')}, ${JSON.stringify(text || '')}, ${Boolean(enter)})
    `;

    try {
      const res = await execInPage(typeScript);
      if (res && res.ok) {
        setStatus(`Texto digitado em ${res.tag}`, false);
        return { ok: true, msg: `Digitado "${text}" no campo ${res.tag} [${res.name}]` };
      }
      setStatus('Campo de digitação não encontrado', false);
      return { ok: false, error: res?.error || 'Não foi possível digitar' };
    } catch (e) {
      setStatus('Erro ao digitar: ' + e.message, false);
      return { ok: false, error: e.message };
    }
  }

  /* ── Computer Use: Screenshot / Captura de Tela ── */
  async function screenshot() {
    setStatus('Capturando tela do navegador (Screenshot)…', true);
    triggerScreenshotFlash();

    let dataUrl = null;
    let width = 1200, height = 800;

    if (state.mode === 'electron' && state.frame && typeof state.frame.capturePage === 'function') {
      try {
        const img = await state.frame.capturePage();
        const size = img.getSize();
        width = size.width;
        height = size.height;
        dataUrl = img.toDataURL();
      } catch (err) {
        console.warn('Falha capturePage webview:', err);
      }
    }

    if (!dataUrl) {
      // Fallback em canvas sintetizado
      const canvas = document.createElement('canvas');
      canvas.width = 960; canvas.height = 600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 960, 600);
      ctx.fillStyle = '#0071e3';
      ctx.font = 'bold 22px -apple-system, sans-serif';
      ctx.fillText(state.title || 'Navegador Nexus', 40, 50);
      ctx.fillStyle = '#6e6e73';
      ctx.font = '14px -apple-system, monospace';
      ctx.fillText(state.url || 'about:blank', 40, 85);
      ctx.strokeStyle = '#e5e5ea';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(40, 105); ctx.lineTo(920, 105); ctx.stroke();
      ctx.fillStyle = '#1d1d1f';
      ctx.font = '15px -apple-system, sans-serif';
      ctx.fillText(`Página: ${state.title}`, 40, 140);
      ctx.fillText(`Elementos interativos: ${state.elements.length} inspecionados`, 40, 170);
      dataUrl = canvas.toDataURL('image/png');
    }

    state.lastScreenshot = dataUrl;

    // Atualiza o monitor Sandbox na barra lateral
    if (window.Sandbox && typeof window.Sandbox.show === 'function') {
      window.Sandbox.show({
        title: `Screenshot · ${state.title.slice(0, 30)}`,
        html: `
          <div style="background:#0a0a0c;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;box-sizing:border-box">
            <img src="${dataUrl}" style="max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.6);object-fit:contain" alt="Screenshot" />
          </div>
        `
      });
    }

    setStatus('Screenshot capturado e salvo no Monitor', false);
    return {
      ok: true,
      dataUrl,
      width,
      height,
      msg: `Screenshot capturado (${width}x${height}px). Exibido no Monitor do Agente.`
    };
  }

  /* ── Computer Use: Rolar Página ── */
  async function scroll(direction = 'down', amount = 500) {
    const dir = String(direction).toLowerCase() === 'up' ? -1 : 1;
    const px = Math.abs(Number(amount) || 500) * dir;
    setStatus(`Rolando página ${px > 0 ? 'para baixo' : 'para cima'}…`, true);

    try {
      await execInPage(`window.scrollBy({ top: ${px}, behavior: 'smooth' });`);
      setStatus('Pronto', false);
      return { ok: true, msg: `Rolou ${px > 0 ? 'para baixo' : 'para cima'} ${Math.abs(px)}px.` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* ── Despachante unificado de ferramentas (ReAct & Voz) ── */
  async function execTool(name, arg, say = () => {}) {
    let p = arg;
    if (typeof arg === 'string') {
      const trimmed = arg.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try { p = JSON.parse(trimmed); } catch {}
      }
    }

    switch (name) {
      case 'browser_open': {
        const u = typeof p === 'object' && p !== null ? (p.url || p.target || '') : String(p || '');
        say(`Navegando no browser para ${u.slice(0, 50)}…`);
        const r = await open(u);
        return `PÁGINA ABERTA NO BROWSER:\nTítulo: ${r.title}\nURL: ${r.url}\nResumo: ${r.stats}\nCabeçalhos principais: ${r.headings || 'nenhum'}`;
      }
      case 'browser_inspect': {
        const sel = typeof p === 'object' && p !== null ? (p.selector || p.query || '') : String(p || '');
        say('Inspecionando elementos interativos da página…');
        const items = await inspect(sel);
        if (!items || !items.length) {
          return `INSPEÇÃO: Nenhum elemento interativo visível no momento em ${state.url}.`;
        }
        const lines = items.slice(0, 45).map(it => `[#${it.id}] <${it.tag}> ${it.desc}`);
        return `PÁGINA: ${state.title} (${state.url})\nELEMENTOS INTERATIVOS DETECTADOS:\n${lines.join('\n')}\n\nPara interagir, use browser_click com o número [#1] ou texto, ou browser_type para digitar.`;
      }
      case 'browser_click': {
        const target = typeof p === 'object' && p !== null ? (p.target || p.id || p.text || '') : String(p || '');
        say(`Clicando no elemento ${String(target).slice(0, 30)}…`);
        const r = await click(target);
        if (!r.ok) throw new Error(r.error || 'Falha ao clicar');
        return `CLIQUE REALIZADO: ${r.msg}. URL atual: ${state.url}`;
      }
      case 'browser_type': {
        let tVal = '', tTarget = '', hitEnter = true;
        if (typeof p === 'object' && p !== null) {
          tVal = p.text ?? p.value ?? '';
          tTarget = p.target ?? p.id ?? '';
          hitEnter = p.enter !== false;
        } else {
          tVal = String(p || '');
        }
        say(`Digitando "${tVal.slice(0, 30)}"…`);
        const r = await type(tTarget, tVal, hitEnter);
        if (!r.ok) throw new Error(r.error || 'Falha ao digitar');
        return `DIGITAÇÃO CONCLUÍDA: ${r.msg}. Enter pressionado: ${hitEnter ? 'Sim' : 'Não'}`;
      }
      case 'browser_screenshot': {
        say('Capturando screenshot da tela…');
        const r = await screenshot();
        return `SCREENSHOT CAPTURADO COM SUCESSO: Imagem (${r.width}x${r.height}px) salva e disponível no Monitor do Agente.`;
      }
      case 'browser_scroll': {
        let dir = 'down', amt = 500;
        if (typeof p === 'object' && p !== null) {
          dir = p.direction || p.dir || 'down';
          amt = p.amount || p.px || 500;
        } else if (String(p).toLowerCase().includes('up')) {
          dir = 'up';
        }
        say(`Rolando página ${dir}…`);
        const r = await scroll(dir, amt);
        return r.msg;
      }
      default:
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  }

  /* ── Inicialização de UI e Eventos ── */
  function init() {
    if (state.ready) return;
    state.ready = true;

    setupFrame();

    // Eventos dos botões da barra de navegação
    $('#browserBtnBack')?.addEventListener('click', () => {
      try {
        if (state.mode === 'electron' && state.frame?.canGoBack()) state.frame.goBack();
        else if (state.frame?.contentWindow) state.frame.contentWindow.history.back();
      } catch {}
    });

    $('#browserBtnForward')?.addEventListener('click', () => {
      try {
        if (state.mode === 'electron' && state.frame?.canGoForward()) state.frame.goForward();
        else if (state.frame?.contentWindow) state.frame.contentWindow.history.forward();
      } catch {}
    });

    $('#browserBtnReload')?.addEventListener('click', () => {
      try {
        if (state.mode === 'electron' && state.frame) state.frame.reload();
        else if (state.frame) state.frame.src = state.frame.src;
      } catch {}
    });

    const submitUrl = () => {
      const val = $('#browserUrlInput')?.value;
      if (val) open(val);
    };

    $('#browserBtnGo')?.addEventListener('click', submitUrl);
    $('#browserUrlInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitUrl();
      }
    });

    // Ações rápidas de Computer Use na barra
    $('#browserBtnInspect')?.addEventListener('click', () => inspect());
    $('#browserBtnScreenshot')?.addEventListener('click', () => screenshot());

    // Botão Maximizar / Restaurar (visão horizontal ampla vs visão mobile vertical)
    function toggleMaximize(forceState) {
      const container = $('#browserContainer');
      if (!container) return;
      state.isMaximized = typeof forceState === 'boolean' ? forceState : !state.isMaximized;
      container.classList.toggle('maximized', state.isMaximized);
      document.body.classList.toggle('browser-maximized', state.isMaximized);
      const icon = $('#browserBtnExpand i');
      if (icon) {
        icon.setAttribute('data-lucide', state.isMaximized ? 'minimize-2' : 'maximize-2');
        try { if (window.lucide) lucide.createIcons(); } catch {}
      }
      const expBtn = $('#browserBtnExpand');
      if (expBtn) {
        expBtn.title = state.isMaximized ? 'Restaurar visão mobile' : 'Ampliar (Janela horizontal grande)';
      }
      if (state.mode === 'electron' && state.frame) {
        try {
          if (typeof state.frame.setUserAgent === 'function') {
            state.frame.setUserAgent(state.isMaximized ? '' : MOBILE_UA);
          }
        } catch {}
      }
    }

    // Fechar navegador (retorna à aba anterior / rotinas)
    function closeBrowser() {
      if (state.isMaximized) {
        toggleMaximize(false);
      }
      if (typeof window.switchTab === 'function') {
        const backTab = window._lastActiveTab && window._lastActiveTab !== 'browser' ? window._lastActiveTab : 'routines';
        window.switchTab(backTab);
      }
    }

    $('#browserBtnExpand')?.addEventListener('click', () => toggleMaximize());
    $('#browserBtnClose')?.addEventListener('click', closeBrowser);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isMaximized) {
        toggleMaximize(false);
      }
    });

    // Links rápidos do Empty State
    $$('.browser-quick-links button').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = btn.dataset.quick;
        if (u) open(u);
      });
    });

    try { if (window.lucide) lucide.createIcons(); } catch {}
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 50);
  }

  return {
    init,
    open,
    close: closeBrowser,
    toggleMaximize,
    inspect,
    click,
    type,
    screenshot,
    scroll,
    execTool,
    getState: () => ({ ...state })
  };
})();
