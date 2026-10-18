/* Free Agent · Integração Telegram (aba do foguete)
   DIRETO NO NAVEGADOR — sem ponte, sem python, sem terminal.
   A API do Telegram devolve `access-control-allow-origin: *`, então o navegador
   pode fazer long-polling GET (requisição simples → sem preflight) direto contra
   api.telegram.org. O usuário só cola o token e conecta; o polling começa sozinho
   ao abrir o app quando já há um token salvo.
   Token fica só no localStorage — nunca sai da máquina nem vai pra log. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const storeKey = 'nexus:tg';
  const API = 'https://api.telegram.org/bot';
  const getTg = () => Object.assign({ token: '', chatId: '', connected: false, bot: '' }, store.get(storeKey, {}));
  const saveTg = (o) => store.set(storeKey, o);

  let pollTimer = null, busyProc = false, offset = 0, polling = false, errs = 0;

  /* ── chamada direta à API (GET simples, CORS *) ── */
  async function tgApi(method, params) {
    const t = getTg();
    if (!t.token) throw new Error('sem token');
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null || v === '') continue;
      qs.set(k, String(v));
    }
    const s = qs.toString();
    const url = API + encodeURIComponent(t.token) + '/' + method + (s ? '?' + s : '');
    const r = await fetch(url, { method: 'GET' });
    const j = await r.json().catch(() => null);
    if (!j) throw new Error('resposta inválida do Telegram (' + r.status + ')');
    if (!j.ok) throw new Error(j.description || ('erro ' + r.status));
    return j.result;
  }

  /* ── envio (fatia em ≤1500 p/ não estourar URL no GET) ── */
  async function tgSend(chatId, text) {
    const s = String(text || '').trim();
    if (!s || !chatId) return;
    const step = 1500;
    for (let i = 0; i < s.length; i += step) {
      await tgApi('sendMessage', { chat_id: chatId, text: s.slice(i, i + step) });
    }
  }

  /* ── UI ── */
  function hint(msg, kind) {
    const el = $('#tgHint'); if (!el) return;
    el.hidden = !msg; el.textContent = msg || ''; el.className = 'tg-hint' + (kind ? ' ' + kind : '');
  }
  function setStatus(state) {
    const pill = $('#tgStatus'); if (!pill) return;
    const t = getTg();
    const map = { off: 'tg.off', connecting: 'tg.connecting', on: 'tg.on', error: 'tg.errorState' };
    pill.className = 'tg-pill' + (state === 'on' ? ' on' : state === 'connecting' ? ' mid' : state === 'error' ? ' err' : ' off');
    pill.textContent = window.I18N?.t?.(map[state]) || ({ off: 'desconectado', connecting: 'conectando…', on: 'conectado', error: 'erro' }[state]);
    const btnC = $('#tgConnect'), btnD = $('#tgDisconnect');
    if (btnC) btnC.hidden = (state === 'on' || state === 'connecting');
    if (btnD) btnD.hidden = (state !== 'on');
    const inp = $('#tgToken');
    if (inp && document.activeElement !== inp) inp.value = t.token || '';
    const inpC = $('#tgChatId');
    if (inpC && document.activeElement !== inpC) inpC.value = t.chatId || '';
  }
  function tgLogLine(dir, who, text) {
    const box = $('#tgLog'); if (!box) return;
    const d = document.createElement('div');
    d.className = 'tg-msg ' + dir;
    d.innerHTML = `<i data-lucide="${dir === 'in' ? 'arrow-down-left' : 'arrow-up-right'}"></i><div class="tg-msg-txt"><b>${escapeHtml(who)}</b><span>${escapeHtml(String(text || '').slice(0, 160))}</span></div>`;
    box.prepend(d);
    while (box.children.length > 30) box.lastChild.remove();
    icons();
  }

  /* ── processa mensagem pelo harness ── */
  const stripTags = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

  async function processMessage(m) {
    const text = String(m.text || '').trim();
    const chatId = m.chatId;
    if (!text || !chatId) return;
    if (text.startsWith('/start') || text.startsWith('/ajuda')) {
      await tgSend(chatId, 'Oi! Eu sou o Free Agent. Manda qualquer coisa — pergunta, pede música, uma tarefa, uma busca — que eu respondo e executo por aqui.');
      tgLogLine('in', m.from || 'Telegram', text);
      return;
    }
    busyProc = true;
    tgLogLine('in', m.from || 'Telegram', text);
    try {
      let answer = '';
      if (window.__runReAct) {
        const execToolReal = async (name, arg) => execTool(name, arg, () => {});
        const v2 = await window.__runReAct(text, {
          history, cfg, callLLM, getSkills, uiConfirm, execToolReal,
          onStatus: () => {}, workspace: null
        });
        answer = stripTags(v2.answer);
        if (/<tool\s+name=/.test(answer)) answer = 'Recebi, mas não consegui concluir agora. Tente de novo em instantes.';
      } else {
        const _main = getMain();
        const sys = 'Você é o Free Agent, assistente no Telegram. Responda em ' + PL() + ', direto e útil, em texto simples (sem markdown pesado — o Telegram não renderiza). Máx ~2000 caracteres.' + memBlock() + (_main.personality ? '\n[AGENTE: ' + _main.personality + ']' : '');
        const out = await callLLM([{ role: 'system', content: sys }, ...history.slice(-8).map(x => ({ role: x.role, content: x.content })), { role: 'user', content: text }]);
        answer = stripTags(out);
        history.push({ role: 'user', content: text }, { role: 'assistant', content: answer });
      }
      answer = (answer || 'Recebido.').slice(0, 3900);
      await tgSend(chatId, answer);
      tgLogLine('out', 'Free Agent', answer);
      try { persist(); } catch {}
    } catch (e) {
      const msg = 'Não consegui processar: ' + String(e.message).slice(0, 140);
      tgLogLine('out', 'erro', msg);
      try { await tgSend(chatId, msg); } catch {}
    } finally { busyProc = false; }
  }

  /* ── long-polling no navegador ── */
  async function pollLoop() {
    if (!polling) return;
    const t = getTg();
    if (!t.connected || !t.token) return;
    try {
      const ups = await tgApi('getUpdates', {
        offset, timeout: 10, allowed_updates: JSON.stringify(['message'])
      });
      const recovered = errs > 0;
      errs = 0;
      if (recovered) {
        setStatus('on'); hint('');
        try { log('Telegram reconectado.', 'ok'); } catch {}
      }
      if (Array.isArray(ups)) {
        for (const u of ups) {
          if (typeof u.update_id === 'number' && u.update_id >= offset) offset = u.update_id + 1;
          const msg = u.message;
          if (!msg) continue;
          await processMessage({
            chatId: String(msg.chat.id),
            from: msg.from?.first_name || msg.from?.username || 'Telegram',
            text: msg.text || msg.caption || ''
          });
        }
      }
      pollTimer = setTimeout(pollLoop, 120);
    } catch (e) {
      errs++;
      const m = String(e.message);
      if (/401|Unauthorized|token/i.test(m)) {
        setStatus('error');
        hint(window.I18N?.t?.('tg.badToken') || 'Token inválido ou revogado — cole o token exato do @BotFather.', 'err');
        const tt = getTg(); tt.connected = false; saveTg(tt);
        stopPoll();
        return;
      }
      if (errs === 1) {
        setStatus('error');
        hint((window.I18N?.t?.('tg.fail') || 'Falha ao conectar: ') + m.slice(0, 110), 'err');
        try { log('Telegram sem conexão (tela dormindo/offline): ' + m.slice(0, 80), 'warn'); } catch {}
      }
      pollTimer = setTimeout(pollLoop, Math.min(15000, 1000 * Math.pow(2, Math.min(errs, 4))));
    }
  }
  function startPoll() { if (polling) return; polling = true; clearTimeout(pollTimer); pollTimer = setTimeout(pollLoop, 250); }
  function stopPoll() { polling = false; clearTimeout(pollTimer); pollTimer = null; }

  /* ── conectar / desconectar ── */
  async function doConnect() {
    const token = ($('#tgToken')?.value || '').trim();
    const chatId = ($('#tgChatId')?.value || '').trim();
    if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token)) { hint(window.I18N?.t?.('tg.badToken') || 'Token inválido — cole o token exato que o @BotFather deu.', 'err'); return; }
    setStatus('connecting'); hint(window.I18N?.t?.('tg.connecting') || 'Conectando…');
    const t = getTg(); t.token = token; t.chatId = chatId; saveTg(t);
    try {
      const me = await tgApi('getMe', {});
      await tgApi('deleteWebhook', {}).catch(() => {});
      offset = 0;
      const tt = getTg(); tt.connected = true; tt.bot = me.username || ''; saveTg(tt);
      errs = 0;
      setStatus('on'); hint('');
      tgLogLine('out', 'sistema', 'Bot conectado: @' + (me.username || '?') + '. Long-polling direto no navegador.');
      toast('send', 'Bot <b>@' + escapeHtml(me.username || '?') + '</b> conectado. Manda mensagem pra ele no Telegram.');
      log('Telegram conectado: @' + (me.username || '?'), 'ok');
      startPoll();
    } catch (e) {
      setStatus('error');
      hint((window.I18N?.t?.('tg.fail') || 'Falha ao conectar: ') + String(e.message).slice(0, 140), 'err');
      log('Telegram conectar falhou: ' + String(e.message).slice(0, 100), 'warn');
      const tt = getTg(); tt.connected = false; saveTg(tt);
    }
  }
  async function doDisconnect() {
    stopPoll();
    const t = getTg(); t.connected = false; saveTg(t);
    setStatus('off'); hint('');
    toast('unlink', 'Bot desconectado. Long-polling encerrado.');
  }

  /* ── restauração: conecta sozinho ao abrir o app ── */
  async function restore() {
    const t = getTg();
    if (!t.token) { setStatus('off'); return; }
    if (!t.connected) { setStatus('off'); return; }
    setStatus('connecting');
    try {
      await tgApi('getMe', {});
    } catch (e) {
      if (/401|Unauthorized/i.test(String(e.message))) {
        const tt = getTg(); tt.connected = false; saveTg(tt); setStatus('off'); return;
      }
      // erro de rede → segue mesmo assim; o long-polling retenta com backoff
    }
    errs = 0;
    setStatus('on'); hint('');
    startPoll();
  }

  /* ── bind ── */
  function bind() {
    if (!$('#tgToken')) return;
    const inp = $('#tgToken'), inpC = $('#tgChatId');
    inp.value = getTg().token || '';
    if (inpC) inpC.value = getTg().chatId || '';
    setStatus(getTg().connected ? 'on' : 'off');
    $('#tgToggleToken')?.addEventListener('click', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; });
    inp.addEventListener('change', () => { const t = getTg(); t.token = inp.value.trim(); saveTg(t); });
    inpC?.addEventListener('change', () => { const t = getTg(); t.chatId = inpC.value.trim(); saveTg(t); });
    $('#tgConnect')?.addEventListener('click', () => doConnect());
    $('#tgDisconnect')?.addEventListener('click', () => doDisconnect());
    restore();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
