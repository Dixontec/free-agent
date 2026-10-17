/* ═══════════ My OS · Harness engine ═══════════
   Providers: Groq · OpenAI · Gemini · Anthropic · Ollama · OpenRouter
   + Chat real, comandos /news /wiki /yt /rotina /skill,
   + Rotinas agendadas, Skills plugáveis, Tarefas, Log, Temas, Núcleo.
*/
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const store = {
  get(k, fb) { try { const v = localStorage.getItem('nexus:' + k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { localStorage.setItem('nexus:' + k, JSON.stringify(v)); }
};

/* ───────── Notificações: só pede 1x e só se ainda não decidido ───────── */
function askNotify() { try { if ('Notification' in window && Notification.permission === 'default') { const r = Notification.requestPermission(); if (r && r.catch) r.catch(() => {}); } } catch {} }
/* ───────── Ícones Lucide ─────────
   Builds novos do lucide removeram ícones de marca (youtube, github, …).
   Remapeia p/ genéricos antes de renderizar — zera os erros de console. */
const ICON_ALIAS = { youtube: 'play', github: 'code', twitter: 'at-sign', twitch: 'tv', instagram: 'camera', linkedin: 'briefcase' };
function icons() {
  try {
    if (!window.lucide) return;
    document.querySelectorAll('i[data-lucide]').forEach(el => {
      const a = ICON_ALIAS[el.getAttribute('data-lucide')];
      if (a) el.setAttribute('data-lucide', a);
    });
    lucide.createIcons();
  } catch {}
}
const ic = n => `<i data-lucide="${n}"></i>`;

/* Migração: dados antigos salvos com emojis → nomes Lucide / texto limpo */
const EMOJI_ICON = { '🔎': 'search', '📰': 'newspaper', '☀️': 'alarm-clock', '▶️': 'play', '🎧': 'music', '🚀': 'rocket', '📝': 'file-text', '🐧': 'terminal', '✨': 'sparkles' };
const cleanTxt = s => String(s || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]\s*/gu, '').trim();

/* ───────── TEMA ───────── */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set('theme', t);
  $$('#themeSwitch button').forEach(b => b.classList.toggle('active', b.dataset.setTheme === t));
}
$$('#themeSwitch button').forEach(b => b.onclick = () => setTheme(b.dataset.setTheme));
setTheme(store.get('theme', 'glass'));

/* ───────── NÚCLEO (HUD estilo JARVIS) ───────── */
let busyCount = 0, unseenWins = 0;
function coreOverlayOpen() { return !$('#coreOverlay').hidden; }
function openCore() { $('#coreOverlay').hidden = false; unseenWins = 0; updateBadge(); icons(); window.__neuralOn = true; if (window.__neuralBuild) window.__neuralBuild(); }
function closeCore() { $('#coreOverlay').hidden = true; window.__neuralOn = false; }
$('#btnCore').onclick = openCore;
$('#brandCore').onclick = openCore;
$('#coreMini').onclick = openCore;
$('#coreClose').onclick = closeCore;
$('#coreClear').onclick = () => { $('#coreWindows').innerHTML = ''; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCore(); });
function updateBadge() {
  const b = $('#coreBadge');
  b.hidden = unseenWins === 0;
  b.textContent = unseenWins > 9 ? '9+' : unseenWins;
}
/* saudação do dia (header) */
let greetLead = '', greetSub = '';
function setCoreState(label, detail) {
  $('#coreStatus').textContent = label;
  $('#coreSub').textContent = detail || greetSub || '…';
  $('#coreState').textContent = label;
  if (detail) $('#coreDetail').textContent = detail;
}
function coreBusy(label, detail) {
  busyCount++;
  setMood(/rotina|executando|reproduzindo|modelos/i.test(label || '') ? 'processing' : 'thinking');
  if (window.__neuralSet) window.__neuralSet(true);
  $('#coreMini').classList.add('busy');
  setCoreState(label, detail);
  paintConvBusy();
}
function coreIdle(detail) {
  busyCount = Math.max(0, busyCount - 1);
  if (busyCount === 0) {
    if (window.__neuralSet) window.__neuralSet(false);
    $('#coreMini').classList.remove('busy');
    setCoreState(greetLead || 'Olá', detail || greetSub || '…');
    setMood('idle');
  }
  paintConvBusy();
}
/* Abre uma "janela" de atividade ao redor do Núcleo */
function coreWindow({ icon = 'activity', title = 'Atividade', body = '', tone = '' }) {
  const box = $('#coreWindows');
  while (box.children.length >= 6) box.lastChild.remove();
  const d = document.createElement('div');
  d.className = 'cwin ' + tone;
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  d.innerHTML = `<div class="cwin-top">${ic(icon)}<span>${escapeHtml(title)}</span><time>${time}</time></div><p>${body}</p>`;
  box.prepend(d);
  icons();
  if (!coreOverlayOpen()) { unseenWins++; updateBadge(); }
  return d;
}
function coreWinDone(win, okText, tone = 'ok') {
  if (!win) return;
  win.classList.add(tone);
  const p = win.querySelector('p');
  if (p && okText) p.innerHTML += `<br><b>${escapeHtml(okText)}</b>`;
}
setInterval(() => {
  $('#coreSysTime').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('#coreSysProv').textContent = (PROVIDERS[cfg.provider]?.label || '—') + ' · ' + (cfg.model || '—');
}, 1000);

/* ───────── PROVIDERS & MODELOS ───────── */
const PROVIDERS = {
  groq:      { label: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', kind: 'openai',
               models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'] },
  openai:    { label: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', kind: 'openai',
               models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini', 'o1-mini'] },
  gemini:    { label: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent', kind: 'gemini',
               models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'] },
  anthropic: { label: 'Anthropic', url: 'https://api.anthropic.com/v1/messages', kind: 'anthropic',
               models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'] },
  ollama:    { label: 'Ollama local', url: 'http://localhost:11434/api/chat', kind: 'ollama',
               models: ['llama3.1', 'qwen2.5', 'mistral', 'gemma2', 'deepseek-r1'] },
  lmstudio:  { label: 'LM Studio local', url: 'http://localhost:1234/v1/chat/completions', kind: 'openai',
               models: ['local-model'] },
  openrouter:{ label: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', kind: 'openai',
               models: ['meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.0-flash-001', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o-mini'] }
};
const cfg = Object.assign({ provider: 'groq', model: 'llama-3.3-70b-versatile', baseUrl: '', temperature: 0.7, maxTokens: 2048 },
  store.get('cfg', {}));
const keys = Object.assign({ groq: '', openai: '', gemini: '', anthropic: '', openrouter: '', ollama: '', lmstudio: '' }, store.get('keys', {}));

/* ── SELETOR RÁPIDO DE MODELO (dropdown custom no chat) ── */
let mqList = [];
function mqRender() {
  const btn = $('#modelQuickBtn'), pop = $('#modelQuickPop');
  if (!btn || !pop) return;
  btn.textContent = cfg.model || '—';
  btn.title = cfg.model || 'Modelo em uso';
  const items = [...mqList, '__custom'];
  pop.innerHTML = items.map(m => {
    const v = m === '__custom' ? '__custom' : String(m);
    const label = m === '__custom' ? 'Personalizado…' : escapeHtml(v);
    return `<button type="button" class="mq-item${v === cfg.model ? ' sel' : ''}${m === '__custom' ? ' custom' : ''}" data-m="${escapeHtml(v)}">${label}</button>`;
  }).join('');
  $$('#modelQuickPop .mq-item').forEach(b => b.onmousedown = e => { e.preventDefault(); mqPick(b.dataset.m); });
}
function mqSetList(list) { mqList = [...new Set(list || [])]; mqRender(); }
function mqPick(v) {
  mqCloseNow();
  if (v === '__custom') {
    (async () => {
      const nv = (await uiPrompt('Modelo personalizado', cfg.model, 'ex.: llama-3.3-70b-versatile')) || cfg.model;
      const _all = store.get('customModels', {}); const _p = $('#provider').value;
      _all[_p] = [...new Set([...(_all[_p] || []), nv])]; store.set('customModels', _all);
      refreshModels();
      cfg.model = nv; store.set('cfg', cfg);
      if ([...$('#model').options].some(o => o.value === nv)) $('#model').value = nv;
      updateConn(); mqRender();
    })();
    return;
  }
  cfg.model = v; store.set('cfg', cfg);
  if ([...$('#model').options].some(o => o.value === v)) $('#model').value = v;
  updateConn(); mqRender();
}
let mqT1 = null;
function mqOpen() {
  clearTimeout(mqT1);
  const pop = $('#modelQuickPop'); if (!pop) return;
  pop.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => pop.classList.add('show')));
}
function mqCloseNow() {
  clearTimeout(mqT1);
  const pop = $('#modelQuickPop'); if (!pop) return;
  pop.classList.remove('show'); pop.hidden = true;
}
try {
  const mqWrap = $('.mq-wrap');
  if (mqWrap) {
    $('#modelQuickBtn').onclick = e => {
      e.stopPropagation();
      const pop = $('#modelQuickPop');
      if (!pop || pop.hidden) { mqRender(); mqOpen(); } else mqCloseNow();
    };
    mqWrap.addEventListener('mouseleave', () => { clearTimeout(mqT1); mqT1 = setTimeout(mqCloseNow, 220); });
    mqWrap.addEventListener('mouseenter', () => clearTimeout(mqT1));
    document.addEventListener('click', e => { if (!mqWrap.contains(e.target)) mqCloseNow(); });
    document.addEventListener('keydown', e => {
      const pop = $('#modelQuickPop'), btn = $('#modelQuickBtn');
      if (!pop || pop.hidden || !btn || document.activeElement !== btn) return;
      const items = $$('#modelQuickPop .mq-item');
      if (!items.length) return;
      let ix = items.findIndex(b => b.classList.contains('sel'));
      if (e.key === 'Escape') { e.preventDefault(); mqCloseNow(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); ix = (ix + 1) % items.length; items.forEach((b, i) => b.classList.toggle('sel', i === ix)); items[ix].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ix = (ix - 1 + items.length) % items.length; items.forEach((b, i) => b.classList.toggle('sel', i === ix)); items[ix].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); if (ix >= 0) mqPick(items[ix].dataset.m); }
    });
  }
} catch {}
function refreshModels() {
  const p = $('#provider').value;
  const custom = (store.get('customModels', {}))[p] || [];
  const list = [...new Set([...custom, ...PROVIDERS[p].models])];
  const opts = list.map(m => `<option>${m}</option>`).join('') + `<option value="__custom">Personalizado…</option>`;
  $('#model').innerHTML = opts;
  if (list.includes(cfg.model)) $('#model').value = cfg.model;
  mqSetList(list);
  $('#baseUrlWrap').hidden = !(p === 'ollama' || p === 'openrouter' || p === 'lmstudio');
  if (p === 'ollama' && !$('#baseUrl').value) $('#baseUrl').value = cfg.baseUrl || 'http://localhost:11434';
  if (p === 'lmstudio' && !$('#baseUrl').value) $('#baseUrl').value = cfg.baseUrl || 'http://localhost:1234/v1';
  if (p === 'openrouter' && !$('#baseUrl').value) $('#baseUrl').value = cfg.baseUrl || PROVIDERS.openrouter.url;
}
function refreshKeyField() {
  const p = $('#provider').value;
  $('#apiKey').value = keys[p] || '';
  $('#apiKey').placeholder = (p === 'ollama' || p === 'lmstudio') ? 'opcional local — LM Studio aceita vazio ou lm-studio' : (p === 'gemini' ? 'AIza…' : p === 'groq' ? 'gsk_…' : 'sk-…');
}
$('#provider').value = cfg.provider || 'groq';
refreshModels(); refreshKeyField();
if (cfg.model && [...$('#model').options].some(o => o.value === cfg.model)) $('#model').value = cfg.model;
$('#baseUrl').value = cfg.baseUrl || '';
$('#temperature').value = cfg.temperature; $('#tempVal').textContent = cfg.temperature;
$('#maxTokens').value = cfg.maxTokens; $('#tokVal').textContent = cfg.maxTokens;
$('#temperature').oninput = e => { $('#tempVal').textContent = e.target.value; cfg.temperature = +e.target.value; store.set('cfg', cfg); };
$('#maxTokens').oninput = e => { $('#tokVal').textContent = e.target.value; cfg.maxTokens = +e.target.value; store.set('cfg', cfg); };
$('#provider').onchange = () => { cfg.provider = $('#provider').value; cfg.model = PROVIDERS[cfg.provider].models[0]; store.set('cfg', cfg); refreshModels(); refreshKeyField(); updateConn(); };
$('#model').onchange = async () => {
  let v = $('#model').value;
  if (v === '__custom') { v = (await uiPrompt('Modelo personalizado', cfg.model, 'ex.: llama-3.3-70b-versatile')) || cfg.model;
    const _all = store.get('customModels', {}); const _p = $('#provider').value;
    _all[_p] = [...new Set([...(_all[_p] || []), v])]; store.set('customModels', _all); refreshModels(); }
  cfg.model = v; store.set('cfg', cfg); $('#model').value = v; updateConn();
};
$('#toggleKey').onclick = () => {
  const show = $('#apiKey').type === 'password';
  $('#apiKey').type = show ? 'text' : 'password';
  $('#toggleKey').innerHTML = ic(show ? 'eye-off' : 'eye');
  icons();
};
/* Segredos nunca ficam visíveis: ao abrir/fechar Configurações, remascara tudo. */
function maskKeys() {
  try {
    $('#apiKey').type = 'password';
    $('#toggleKey').innerHTML = ic('eye');
    const bt = $('#codeBridgeToken'); if (bt) bt.type = 'password';
    icons();
  } catch {}
}
function saveCfg(silent) {
  keys[$('#provider').value] = $('#apiKey').value.trim();
  cfg.baseUrl = $('#baseUrl').value.trim(); cfg.provider = $('#provider').value; cfg.model = $('#model').value;
  store.set('keys', keys); store.set('cfg', cfg);
  if (!silent) toast('save', '<b>Configuração salva</b> localmente.');
  updateConn();
}
$('#btnSaveKeys').onclick = () => { saveCfg(); fetchModels(true); };
$('#linkKeys').onclick = e => { e.preventDefault(); $('#keysModal').hidden = false; icons(); };
$('#keysClose').onclick = () => $('#keysModal').hidden = true;
$('#btnSettings').onclick = () => { maskKeys(); $('#settingsModal').hidden = false; icons(); };
$('#settingsClose').onclick = () => { maskKeys(); $('#settingsModal').hidden = true; };
$('#settingsModal').addEventListener('click', e => { if (e.target === $('#settingsModal')) { maskKeys(); $('#settingsModal').hidden = true; } });

function updateConn() {
  const p = cfg.provider, has = !!(keys[p] || p === 'ollama' || p === 'lmstudio');
  $('#connStatus').className = 'conn' + (has ? ' ok' : '');
  $('#connLabel').textContent = has ? `${PROVIDERS[p].label} · ${cfg.model}` : 'desconectado';
  const qp = $('#quickProv');
  if (qp) qp.innerHTML = `${ic('cpu')}<b>${PROVIDERS[p].label}</b>`;
  icons();
  try { paintCtx(); } catch {}
}

/* ───────── CHAMADAS ÀS APIs ───────── */
async function callLLM(messages, opts = {}) {
  const p = cfg.provider, temp = opts.temperature ?? cfg.temperature, max = opts.maxTokens ?? cfg.maxTokens;
  const key = keys[p];
  if (p === 'gemini') {
    const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }]
    }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${encodeURIComponent(key)}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: sys ? { parts: [{ text: sys }] } : undefined, contents, generationConfig: { temperature: temp, maxOutputTokens: max } }) });
    if (!r.ok) throw new Error('Gemini ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const j = await r.json();
    noteUsage(j.usageMetadata?.promptTokenCount, j.usageMetadata?.candidatesTokenCount);
    return j.candidates?.[0]?.content?.parts?.map(x => x.text).join('') || '(resposta vazia)';
  }
  if (p === 'anthropic') {
    const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const r = await fetch(PROVIDERS.anthropic.url, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: cfg.model, max_tokens: max, system: sys || undefined,
        messages: messages.filter(m => m.role !== 'system') }) });
    if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 300) + ' (pode exigir proxy CORS)');
    const j = await r.json();
    noteUsage(j.usage?.input_tokens, j.usage?.output_tokens);
    return j.content?.map(b => b.text).join('') || '(vazio)';
  }
  if (p === 'ollama') {
    const base = ($('#baseUrl').value.trim() || 'http://localhost:11434').replace(/\/$/, '');
    const r = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, stream: false, options: { temperature: temp, num_predict: max }, messages }) });
    if (!r.ok) throw new Error('Ollama: verifique `ollama serve` + modelo `ollama pull ' + cfg.model + '`');
    const _oj = await r.json();
    noteUsage(_oj.prompt_eval_count, _oj.eval_count);
    return _oj.message?.content || '(vazio)';
  }
  // OpenAI-compatível: OpenAI, Groq, OpenRouter
  // Blindagem Groq 400 tool_use_failed: declara tools nativas p/ chamada nunca falhar,
  // + gate needsTool evita puxar tool sem necessidade.
  const NEEDS_TOOL_RE = /not[ií]cia|\bnota|pesquis|busc|atual|hoje|recente|2024|2025|2026|abrir|acess|ver\s+site|youtube|v[ií]deo|tarefa|pendente|toca|toque|play|m[uú]sica|baixar|download|skill|rotina|pre[çc]o|clima|dado|fonte|link/i;
  const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const needsTool = !opts.noTools && (NEEDS_TOOL_RE.test(lastUser) || /<tool\s+name=|\[RESULTADO/i.test(messages.map(m => m.content).join('\n').slice(-2000)));
  const NATIVE_TOOLS = [
    { type: 'function', function: { name: 'web_search', description: 'Buscar fato atual/externo', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: [] } } },
    { type: 'function', function: { name: 'web_open', description: 'Ler 1 pagina https', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: [] } } },
  ];
  let url = PROVIDERS[p].url;
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = 'Bearer ' + key;
  if (p === 'openrouter') { url = $('#baseUrl').value.trim() || url; headers['HTTP-Referer'] = location.href; headers['X-Title'] = 'My OS Harness'; }
  if (p === 'lmstudio') {
    // LM Studio / qualquer OpenAI-compatível local (llama.cpp, vLLM, text-gen-webui).
    // Aceita: http://localhost:1234/v1  ·  http://localhost:1234/v1/chat/completions  ·  http://host:porta/qualquer-base
    let base = ($('#baseUrl').value.trim() || cfg.baseUrl || url || 'http://localhost:1234/v1').replace(/\/$/, '');
    if (/\/v1$/.test(base)) base += '/chat/completions';
    else if (!/\/chat\/completions$/.test(base)) base += '/chat/completions';
    url = base;
  }
  const bodyBase = { model: cfg.model, temperature: temp, max_tokens: max, messages };
  // Só anuncia tools quando há indício de necessidade — zera tool desnecessária.
  // Quando anuncia, usa tool_choice auto p/ Groq nunca dar 400 tool_choice-none.
  if (needsTool && (p === 'groq' || p === 'openai' || p === 'openrouter')) { bodyBase.tools = NATIVE_TOOLS; bodyBase.tool_choice = 'auto'; }
  const r = await fetch(url, { method: 'POST', headers,
    body: JSON.stringify(bodyBase) });
  if (!r.ok) {
    const raw = await r.text();
    // Groq 400 tool_use_failed: modelo emitiu tool nativa JSON sem `tools` no request.
    // Só aceita a tool se houve necessidade real; senão, responde direto sem quebrar.
    try {
      const ej = JSON.parse(raw);
      const fg = ej?.error?.failed_generation;
      if (fg && /"name"\s*:/.test(fg)) {
        const fo = JSON.parse(fg);
        const n = String(fo.name || '').toLowerCase();
        const a = fo.arguments || {};
        const arg = a.query ?? a.text ?? a.alvo ?? a.url ?? a.slug ?? a.texto ?? '';
        if (n && needsTool) return `<tool name="${n}">${String(arg).slice(0, 500)}</tool>`;
        // Tool sem necessidade → retry direto, sem [TOOLS], sem JSON, sem falhar o chat.
        const clean = messages.map(m => ({ role: m.role, content: String(m.content).replace(/<tool[\s\S]*?<\/tool>/gi, '').replace(/\[TOOLS\][\s\S]*?(?=\n\n|\Z)/, '').slice(0, 4000) }));
        clean.unshift({ role: 'system', content: 'Responda em pt-BR, direto, sem chamar ferramentas, sem JSON, sem <tool>. Resposta final agora.' });
        const r2 = await fetch(url, { method: 'POST', headers,
          body: JSON.stringify({ model: cfg.model, temperature: 0.3, max_tokens: max, messages: clean }) });
        if (r2.ok) { const j2 = await r2.json(); return j2.choices?.[0]?.message?.content || '(vazio)'; }
      }
    } catch {}
    // Última blindagem: erro de tool nunca vira bubble de erro — vira resposta direta.
    if (/tool/i.test(raw) && !opts._noToolFallback) {
      try {
        const clean = messages.map(m => ({ role: m.role, content: String(m.content).replace(/<tool[\s\S]*?<\/tool>/gi, '').slice(0, 4000) }));
        const r3 = await fetch(url, { method: 'POST', headers,
          body: JSON.stringify({ model: cfg.model, temperature: 0.3, max_tokens: max, messages: [...clean, { role: 'user', content: 'Responda direto em pt-BR, sem ferramentas.' }] }) });
        if (r3.ok) { const j3 = await r3.json(); const c3 = j3.choices?.[0]?.message?.content; if (c3) return c3; }
      } catch {}
    }
    throw new Error(PROVIDERS[p].label + ' ' + r.status + ': ' + raw.slice(0, 400));
  }
  const j = await r.json();
  // Groq/OpenAI podem devolver tool_calls nativo — só aceita se houve necessidade real.
  try {
    const tc = j.choices?.[0]?.message?.tool_calls?.[0];
    const content = j.choices?.[0]?.message?.content || '';
    if (tc) {
      const n = String(tc.function?.name || '').toLowerCase();
      if (!needsTool && content) return content; // ignora tool desnecessária, responde direto
      if (!needsTool && !content) return '(vazio)';
      let arg = tc.function?.arguments || '';
      try { const ao = JSON.parse(arg); arg = ao.query ?? ao.text ?? ao.alvo ?? ao.url ?? ao.slug ?? arg; } catch {}
      if (n) return `<tool name="${n}">${String(arg).slice(0, 500)}</tool>`;
    }
  } catch {}
  noteUsage(j.usage?.prompt_tokens, j.usage?.completion_tokens);
  return j.choices?.[0]?.message?.content || '(vazio)';
}
$('#btnTest').onclick = async () => {
  $('#btnSaveKeys').click();
  setConn('…', ''); toast('zap', 'Testando <b>' + escapeHtml(PROVIDERS[cfg.provider].label) + '</b>…');
  coreBusy('Testando conexão', PROVIDERS[cfg.provider].label + ' · ' + cfg.model);
  const win = coreWindow({ icon: 'zap', title: 'Teste de conexão', body: `Provedor <b>${escapeHtml(PROVIDERS[cfg.provider].label)}</b> · modelo <b>${escapeHtml(cfg.model)}</b>` });
  try { const out = await callLLM([{ role: 'user', content: 'Responda só: OK My OS online.' }], { maxTokens: 32 });
    setConn('ok', ''); toast('check', '<b>Conectado.</b> ' + escapeHtml(out).slice(0, 120)); log('Conexão OK com ' + cfg.provider + ' · ' + cfg.model, 'ok');
    coreWinDone(win, 'Conexão estabelecida.');
  } catch (e) { setConn('err', ''); toast('x', escapeHtml(e.message)); log('Falha conexão: ' + e.message, 'warn'); coreWinDone(win, 'Falha: ' + e.message.slice(0, 120), 'warn'); }
  coreIdle(); updateConn();
};
function setConn(state) { $('#connStatus').className = 'conn' + (state === 'ok' ? ' ok' : state === 'err' ? ' err' : ''); }

/* ───────── CHAT ───────── */
/* ───────── CONVERSAS & MEMÓRIA ───────── */
let history = [];
function getConvs() {
  let c = store.get('convs', null);
  if (!c) {
    const old = store.get('history', []);
    c = [{ id: 'c' + Date.now(), title: old.length ? 'Conversa inicial' : 'Nova conversa', ts: Date.now(), updated: Date.now(), messages: old }];
    store.set('convs', c);
    try { localStorage.removeItem('nexus:history'); } catch {}
  }
  return c;
}
function saveConvs(c) { store.set('convs', c); renderConvs(); }
function persist() {
  const c = getConvs();
  const ix = c.findIndex(x => x.id === store.get('activeConv', null));
  if (ix >= 0) { c[ix].messages = history; c[ix].updated = Date.now(); store.set('convs', c); }
  renderConvs();
}
function loadConv(id) {
  const c = getConvs();
  const conv = c.find(x => x.id === id) || c[0];
  store.set('activeConv', conv.id);
  history = conv.messages;
  renderHistory(); renderConvs();
}
function newConv(title) {
  const c = getConvs();
  const conv = { id: 'c' + Date.now(), title: title || 'Nova conversa', ts: Date.now(), updated: Date.now(), messages: [] };
  c.unshift(conv);
  store.set('convs', c); store.set('activeConv', conv.id);
  history = conv.messages;
  renderHistory(); renderConvs();
  return conv;
}
function maybeTitle(text) {
  const c = getConvs();
  const ix = c.findIndex(x => x.id === store.get('activeConv', null));
  if (ix >= 0 && (!c[ix].title || c[ix].title === 'Nova conversa')) {
    c[ix].title = text.slice(0, 42);
    store.set('convs', c); renderConvs();
  }
}
function renderConvs() {
  const box = $('#convList');
  if (!box) return;
  box.innerHTML = '';
  const c = getConvs(); const act = store.get('activeConv', null);
  c.forEach(cv => {
    const last = cv.messages.length ? cv.messages[cv.messages.length - 1].content.slice(0, 60) : 'Conversa vazia';
    const d = document.createElement('div');
    d.className = 'conv' + (cv.id === act ? ' on' : '');
    d.innerHTML = `<div class="conv-txt"><b>${escapeHtml(cv.title)}</b><small>${escapeHtml(last)}</small></div><button class="iconbtn" data-edit="${cv.id}" title="Renomear conversa">${ic('pencil')}</button><button class="iconbtn danger" data-del="${cv.id}" title="Excluir conversa">${ic('trash-2')}</button>`;
    d.querySelector('.conv-txt').onclick = () => loadConv(cv.id);
    box.appendChild(d);
  });
  $$('#convList [data-edit]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const arr = getConvs(); const ix = arr.findIndex(x => x.id === b.dataset.edit);
    if (ix < 0) return;
    const name = await uiPrompt('Renomear conversa', arr[ix].title, 'Nome da conversa');
    if (name && name.trim()) { arr[ix].title = name.trim().slice(0, 60); saveConvs(arr); }
  });
  $$('#convList [data-del]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (!(await uiConfirm('Excluir conversa', 'Excluir esta conversa e todo o histórico dela?', 'Excluir'))) return;
    let arr = getConvs().filter(x => x.id !== b.dataset.del);
    if (!arr.length) arr = [{ id: 'c' + Date.now(), title: 'Nova conversa', ts: Date.now(), updated: Date.now(), messages: [] }];
    const wasActive = store.get('activeConv', null) === b.dataset.del;
    saveConvs(arr);
    if (wasActive) loadConv(arr[0].id);
  });
  icons();
  paintConvBusy();
}
function findConv(query) {
  const stop = new Set(['lembra', 'lembrar', 'lembro', 'nossa', 'nossas', 'nosso', 'da', 'de', 'do', 'das', 'dos', 'que', 'sobre', 'uma', 'alguma', 'aquela', 'essa', 'foi', 'tivemos', 'falamos', 'voce', 'a', 'o', 'e', 'com', 'pra', 'para', 'me', 'na', 'no', 'em', 'se', 'conversa', 'memoria', 'aquilo', 'disso', 'isso']);
  const words = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stop.has(w));
  if (!words.length) return null;
  let best = null, bestScore = 0;
  getConvs().forEach(c => {
    if (!c.messages.length) return;
    const hay = (c.title + ' ' + c.messages.map(m => m.content).join(' ')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let s = 0;
    words.forEach(w => { if (hay.includes(w)) s += w.length > 4 ? 2 : 1; });
    if (s > bestScore) { bestScore = s; best = c; }
  });
  return bestScore > 0 ? best : null;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function mdLite(s) {
  let h = escapeHtml(s);
  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre>$2</pre>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" style="color:var(--accent)">$1</a>');
  return h.replace(/\n/g, '<br>');
}
function addMsg(role, text, extra = '') {
  const d = document.createElement('div');
  d.className = 'msg ' + (role === 'user' ? 'me' : role === 'sys' ? 'sys' : 'ai');
  d.innerHTML = (role === 'user' ? escapeHtml(text) : mdLite(text)) + extra;
  $('#messages').appendChild(d);
  $('#messages').scrollTop = 1e6;
  icons();
  return d;
}
/* HTML confiável gerado pelo próprio app (sem escape) */
function addHtml(role, html, extra = '') {
  const d = document.createElement('div');
  d.className = 'msg ' + (role === 'user' ? 'me' : role === 'sys' ? 'sys' : 'ai');
  d.innerHTML = html + extra;
  $('#messages').appendChild(d);
  $('#messages').scrollTop = 1e6;
  icons();
  return d;
}
function renderHistory() {
  $('#messages').innerHTML = '';
  history.forEach(m => addMsg(m.role === 'user' ? 'user' : 'ai', m.content));
}
loadConv(store.get('activeConv', null)); updateConn();

$('#input').addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; smpUpdate(); });
$('#input').addEventListener('keydown', e => {
  if (smp.open && smp.items.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); smp.sel = (smp.sel + 1) % smp.items.length; smpRender(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); smp.sel = (smp.sel - 1 + smp.items.length) % smp.items.length; smpRender(); return; }
    if ((e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); smpPick(smp.sel); return; }
    if (e.key === 'Escape') { e.preventDefault(); smpClose(); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#input').addEventListener('blur', () => smpClose());
$('#composer').addEventListener('submit', () => smpClose());
/* ───────── @MENTION DE SKILLS (autocomplete no chat) ───────── */
const smp = { items: [], sel: 0, open: false, atIdx: -1 };
function smpToken(value, caret) {
  const before = value.slice(0, caret);
  const m = before.match(/(^|\s)@([a-z0-9-]*)$/i);
  if (!m) return null;
  return { at: caret - m[0].length + m[1].length, q: m[2].toLowerCase() };
}
function smpFilter(q) {
  const act = getSkills().filter(s => s.active);
  if (!q) return act.slice(0, 8);
  return act.filter(s => s.slug.includes(q) || s.title.toLowerCase().includes(q)).slice(0, 8);
}
function smpRender() {
  const pop = $('#skillMentionPop');
  if (!pop) return;
  if (!smp.items.length) { smpClose(); return; }
  pop.innerHTML = smp.items.map((s, i) =>
    `<div class="smp-item${i === smp.sel ? ' sel' : ''}" data-i="${i}">
      <span class="smp-body"><div class="smp-t">${escapeHtml(s.title)}</div><div class="smp-d">${escapeHtml(s.desc || '')}</div></span>
      <span class="smp-slug">@${escapeHtml(s.slug)}</span>
    </div>`).join('');
  pop.hidden = false; smp.open = true;
  icons();
  $$('#skillMentionPop .smp-item').forEach(el => {
    el.onmouseenter = () => { smp.sel = +el.dataset.i; $$('#skillMentionPop .smp-item').forEach(x => x.classList.toggle('sel', +x.dataset.i === smp.sel)); };
    el.onmousedown = e => { e.preventDefault(); smpPick(+el.dataset.i); };
  });
  const selEl = pop.querySelector('.smp-item.sel');
  if (selEl) selEl.scrollIntoView({ block: 'nearest' });
}
function smpUpdate() {
  const inp = $('#input');
  if (!inp) return;
  const tok = smpToken(inp.value, inp.selectionStart ?? inp.value.length);
  if (!tok) { smpClose(); return; }
  smp.atIdx = tok.at;
  smp.items = smpFilter(tok.q);
  smp.sel = 0;
  smpRender();
}
function smpClose() {
  const pop = $('#skillMentionPop');
  if (!pop) return;
  pop.hidden = true; pop.innerHTML = ''; smp.open = false; smp.items = []; smp.atIdx = -1;
}
function smpPick(i) {
  const sk = smp.items[i];
  const inp = $('#input');
  if (!sk || !inp || smp.atIdx < 0) { smpClose(); return; }
  const caret = inp.selectionStart ?? inp.value.length;
  inp.value = inp.value.slice(0, smp.atIdx) + '@' + sk.slug + ' ' + inp.value.slice(caret);
  const pos = smp.atIdx + sk.slug.length + 2;
  inp.focus();
  try { inp.setSelectionRange(pos, pos); } catch {}
  smpClose();
  inp.dispatchEvent(new Event('input'));
}
$('#btnNewChat').onclick = () => { newConv(); toast('plus', 'Nova conversa iniciada.'); };
$('#btnNewConv').onclick = () => { newConv(); $('#input').focus(); };
$('#btnQuickNew').onclick = () => { newConv(); toast('plus', 'Nova conversa iniciada.'); $('#input').focus(); };
$('#quickChips')?.addEventListener('click', e => {
  if (e.target.closest('#btnAddChip')) return;
  const b = e.target.closest('button[data-prompt]');
  if (b) { $('#input').value = b.dataset.prompt; $('#composer').requestSubmit(); }
});
/* ───────── BOTÕES PERSONALIZADOS DO CHAT ───────── */
function getChips() { return store.get('chips', []); }
function renderCustomChips() {
  $$('#quickChips .custom-chip').forEach(x => x.remove());
  const add = $('#btnAddChip');
  if (!add) return;
  getChips().forEach(c => {
    const b = document.createElement('button');
    b.className = 'custom-chip';
    b.dataset.prompt = c.prompt;
    b.title = c.prompt.slice(0, 120);
    b.innerHTML = `${ic('zap')}${escapeHtml(c.label)}`;
    add.before(b);
  });
  icons();
}
function renderChipManage() {
  const box = $('#chipManage');
  if (!box) return;
  box.innerHTML = '';
  getChips().forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'mchip';
    d.innerHTML = `<span>${escapeHtml(c.label)}</span><button data-i="${i}" title="Excluir botão">${ic('x')}</button>`;
    box.appendChild(d);
  });
  $$('#chipManage button').forEach(b => b.onclick = async () => {
    if (!(await uiConfirm('Excluir botão', 'Remover este botão personalizado?', 'Excluir'))) return;
    const arr = getChips(); arr.splice(+b.dataset.i, 1);
    store.set('chips', arr); renderCustomChips(); renderChipManage();
  });
  icons();
}
if ($('#btnAddChip')) $('#btnAddChip').onclick = () => { $('#chipForm').hidden = false; renderChipManage(); $('#chipLabel').focus(); };
if ($('#chipCancel')) $('#chipCancel').onclick = () => $('#chipForm').hidden = true;
if ($('#chipSave')) $('#chipSave').onclick = () => {
  const label = $('#chipLabel').value.trim(), prompt = $('#chipPrompt').value.trim();
  if (!label || !prompt) return;
  const arr = getChips(); arr.push({ label: label.slice(0, 24), prompt });
  store.set('chips', arr);
  $('#chipLabel').value = ''; $('#chipPrompt').value = ''; $('#chipForm').hidden = true;
  renderCustomChips(); toast('plus', `Botão <b>${escapeHtml(label)}</b> criado. Um clique e a IA recebe o prompt.`);
  log('Botão personalizado: ' + label, 'ok');
};
/* ── ANEXAR (hover no clipse → pasta de contexto ou arquivo) ── */
(() => {
  const menu = $('#attachMenu'), wrap = $('.attach-wrap');
  if (!menu || !wrap) return;
  let hideT = null, hideT2 = null;
  const openNow = () => { clearTimeout(hideT); clearTimeout(hideT2); menu.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('show'))); };
  const closeNow = () => { clearTimeout(hideT); clearTimeout(hideT2); menu.classList.remove('show'); menu.hidden = true; };
  const hide = () => {
    clearTimeout(hideT); clearTimeout(hideT2);
    hideT = setTimeout(() => {
      menu.classList.remove('show');
      hideT2 = setTimeout(() => { if (!menu.classList.contains('show')) menu.hidden = true; }, 200);
    }, 150);
  };
  wrap.addEventListener('mouseenter', openNow);
  wrap.addEventListener('mouseleave', hide);
  menu.addEventListener('mouseenter', () => { clearTimeout(hideT); clearTimeout(hideT2); });
  menu.addEventListener('mouseleave', hide);
  $('#btnAttach').onclick = e => { e.stopPropagation(); openNow(); };
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) closeNow(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNow(); });

  const TEXT_EXT = /\.(txt|md|json|csv|js|ts|tsx|jsx|html|css|py|yml|yaml|xml|log|srt|vtt|rtf|ini|cfg|conf|sh|sql|rs|go|java|c|h|cpp|hpp|rb|php|swift|kt)$/i;
  function attachContext(files) {
    if (!files.length) { toast('paperclip', 'Nenhum arquivo de texto encontrado na seleção.'); return; }
    const block = files.map(f => `--- ${f.name} ---\n${String(f.content).slice(0, 20000)}`).join('\n\n').slice(0, 60000);
    $('#input').value = `Contexto anexado:\n"""\n${block}\n"""\n\nMinha pergunta: `;
    $('#input').focus(); $('#input').dispatchEvent(new Event('input'));
    toast('paperclip', `<b>${files.length}</b> arquivo(s) de contexto anexado(s).`);
    log('Contexto anexado: ' + files.map(f => f.name).slice(0, 5).join(', '), 'ok');
  }
  function dockMedia(f, kind) {
    const url = URL.createObjectURL(f);
    $('#mediaDock').hidden = false;
    $('#mediaTitle').innerHTML = `${ic(kind === 'video' ? 'play' : 'music')} ${escapeHtml(f.name)}`;
    $('#mediaBody').innerHTML = kind === 'video'
      ? `<video controls autoplay style="max-width:100%;max-height:230px;border-radius:10px" src="${url}"></video>`
      : `<audio controls autoplay src="${url}"></audio>`;
    icons(); $('#mediaDock').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('#input').value = `${kind === 'video' ? 'Vídeo' : 'Áudio'} anexado no dock: ${f.name}\n\nMinha pergunta sobre ele: `;
    $('#input').focus(); $('#input').dispatchEvent(new Event('input'));
    toast(kind === 'video' ? 'play' : 'music', `${kind === 'video' ? 'Vídeo' : 'Áudio'} no dock — pergunte sobre ele no chat.`);
  }
  menu.querySelector('[data-act="folder"]').onclick = async () => {
    closeNow();
    try {
      if (window.showDirectoryPicker) {
        const dir = await window.showDirectoryPicker({ mode: 'read' });
        const files = [];
        for await (const [name, h] of dir.entries()) {
          if (files.length >= 8) break;
          if (h.kind !== 'file' || !TEXT_EXT.test(name)) continue;
          try { const f = await h.getFile(); if (f.size <= 300000) files.push({ name, content: await f.text() }); } catch {}
        }
        attachContext(files);
      } else { $('#attachDirInput').click(); }
    } catch { /* cancelado */ }
  };
  $('#attachDirInput').onchange = async () => {
    const sel = [...$('#attachDirInput').files].filter(f => TEXT_EXT.test(f.name)).slice(0, 8);
    const files = [];
    for (const f of sel) { try { files.push({ name: f.webkitRelativePath || f.name, content: await f.text() }); } catch {} }
    $('#attachDirInput').value = '';
    attachContext(files);
  };
  menu.querySelector('[data-act="file"]').onclick = () => { closeNow(); $('#attachFileInput').click(); };
  $('#attachFileInput').onchange = async () => {
    const f = $('#attachFileInput').files[0];
    $('#attachFileInput').value = '';
    if (!f) return;
    if (f.type.startsWith('text/') || TEXT_EXT.test(f.name)) {
      let txt = ''; try { txt = await f.text(); } catch { toast('x', 'Não consegui ler o arquivo.'); return; }
      attachContext([{ name: f.name, content: txt }]);
    } else if (f.type.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|flac|aac|opus|webm)$/i.test(f.name)) dockMedia(f, 'audio');
    else if (f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(f.name)) dockMedia(f, 'video');
    else toast('x', 'Tipo não suportado — use áudio, vídeo ou texto.');
  };
})();
/* ── TOOLTIP DO MIC (hover → popup discreto no padrão do clipe) ── */
(() => {
  const wrap = $('.voice-wrap'), tip = $('#voiceTip');
  if (!wrap || !tip) return;
  let t1 = null, t2 = null;
  const show = () => {
    clearTimeout(t1); clearTimeout(t2);
    tip.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => tip.classList.add('show')));
  };
  const hide = () => {
    clearTimeout(t1); clearTimeout(t2);
    t1 = setTimeout(() => {
      tip.classList.remove('show');
      t2 = setTimeout(() => { if (!tip.classList.contains('show')) tip.hidden = true; }, 200);
    }, 120);
  };
  wrap.addEventListener('mouseenter', show);
  wrap.addEventListener('mouseleave', hide);
})();

$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#input').value.trim();
  if (!text) return;
  $('#input').value = ''; $('#input').style.height = 'auto';
  addMsg('user', text);
  history.push({ role: 'user', content: text });
  maybeTitle(text);

  if (await handleCommand(text)) { persist(); return; }
  if (await tryLocalAutomation(text)) { persist(); return; }

  const skill = detectSkill(text);
  if (skill) flashSkill(skill.slug, false);
  $('#typing').hidden = false;
  coreBusy('Consultando IA', PROVIDERS[cfg.provider].label + ' · ' + cfg.model + (skill ? ' · skill ' + skill.slug : ''));
  const win = coreWindow({ icon: 'brain', title: 'Inferência', body: `Modelo <b>${escapeHtml(cfg.model)}</b>${skill ? ' · skill <b>' + escapeHtml(skill.slug) + '</b>' : ''}<br>“${escapeHtml(text.slice(0, 90))}…”` });
  /* ── v2.1: executa → verifica conclusão → corrige pendência → entrega ── */
  if (window.__runReAct) {
    try {
      const TOOL_LABEL = { web_search: 'Buscando fontes', web_open: 'Lendo página', open_site: 'Abrindo site', run_skill: 'Executando skill', music_search: 'Buscando música livre', music_download: 'Baixando MP3', music_play: 'Tocando música', create_task: 'Criando tarefa', list_tasks: 'Lendo tarefas', complete_task: 'Concluindo tarefa', delete_task: 'Deletando tarefa', create_note: 'Criando nota', list_notes: 'Lendo notas', edit_note: 'Editando nota', delete_note: 'Deletando nota', news: 'Lendo notícias', code_read: 'Lendo arquivo', code_list: 'Listando pasta', code_glob: 'Buscando arquivos', code_grep: 'Buscando texto', code_write: 'Escrevendo arquivo', code_edit: 'Editando arquivo', code_bash: 'Executando comando', code_undo: 'Desfazendo' };
      const runAw = agentWin({ icon: 'bot', title: 'Agente · ' + text.slice(0, 60), body: `<div class="awline">${ic('circle-dot')}<span>Iniciando: <b>${escapeHtml(text.slice(0, 100))}</b></span></div>` });
      const execToolReal = async (name, arg) => {
        const label = TOOL_LABEL[name] || name;
        const aw = agentWin({ icon: name.startsWith('music') ? 'music' : 'globe', title: `${label} · ${String(arg).slice(0, 50)}`, body: `<div class="awline">${ic('circle-dot')}<span>${escapeHtml(label)}: <b>${escapeHtml(String(arg).slice(0, 100))}</b></span></div>` });
        awStep(runAw, `<div class="awline">${ic('chevron-right')}<span>${escapeHtml(label)}: <b>${escapeHtml(String(arg).slice(0, 80))}</b></span></div>`);
        try {
          let result = '', doneMsg = '';
          if (name === 'open_site') {
            const ytHit = await tryYouTubeFirst(arg);
            if (ytHit) {
              result = `O vídeo "${ytHit.title}" (${ytHit.url}) está tocando no monitor à direita. Confirme brevemente em português.`;
              doneMsg = `Tocando: ${ytHit.title}.`;
            } else {
            const target = resolveSite(arg);
            if (!target) throw new Error('não identifiquei o site — me diga nome ou link');
            openSiteFlow(target, 'harness v2');
            result = `O site "${target.name}" (${target.url}) já foi exibido no chat. Confirme brevemente em português.`;
            doneMsg = `Aberto: ${target.name}.`;
            }
          } else if (name === 'run_skill') {
            const sk = getSkills().find(x => x.slug === String(arg).toLowerCase());
            if (!sk) throw new Error('skill inexistente/inativa: ' + arg + '. Slugs válidos: ' + getSkills().filter(s => s.active).map(s => s.slug).join(', '));
            flashSkill(sk.slug);
            if (sk.action) for (const a of sk.action.split('\n').map(s => s.trim()).filter(Boolean)) await runActionLine(a, 'skill:' + sk.slug, win);
            if (sk.prompt) {
              awStep(aw, `<div class="awline">${ic('chevron-right')}<span>Aplicando prompt da skill <b>${escapeHtml(sk.title)}</b>…</span></div>`);
              try {
                result = await callLLM([
                  { role: 'system', content: sk.prompt + '\nResponda sempre em português, de forma direta e útil.' },
                  { role: 'user', content: text },
                ]);
              } catch { result = `Skill "${sk.title}" executada${sk.action ? ' (ações aplicadas)' : ''}, mas o modelo da skill não respondeu. Resuma o que foi feito.`; }
            } else {
              result = `A skill "${sk.title}" (${sk.slug}) foi executada e os resultados já apareceram no chat. Resuma em português.`;
            }
            doneMsg = `Skill ${sk.title} aplicada.`;
          } else {
            result = await execTool(name, arg, s => awStep(aw, `<div class="awline">${ic('chevron-right')}<span>${escapeHtml(s)}</span></div>`));
            doneMsg = name.startsWith('music') ? `Música pronta: ${String(arg).slice(0, 60)}.` : `Leitura pronta (${result.length} chars).`;
          }
          awDone(aw, doneMsg);
          awStep(runAw, `<div class="awline ok">${ic('check')}<span>${escapeHtml(doneMsg)}</span></div>`);
          return result;
        } catch (e) { const m = 'Não consegui: ' + String(e.message).slice(0, 120); awDone(aw, m); awStep(runAw, `<div class="awline">${ic('x')}<span>${escapeHtml(m)}</span></div>`); throw e; }
      };
      const onStatus = (st) => {
        if (st.phase === 'verifying') { awStep(runAw, `<div class="awline">${ic('scan-search')}<span>Verificando se a tarefa terminou (URLs, fontes, pedido cumprido)…</span></div>`); setCoreState('Verificando conclusão', 'checks determinísticos'); }
        if (st.phase === 'correcting') { awStep(runAw, `<div class="awline">${ic('wrench')}<span>Pendência: <b>${escapeHtml(st.pending.map(p => p.reason).join(' | ').slice(0, 140))}</b> — correção ${st.attempt}/2…</span></div>`); setCoreState('Corrigindo pendência', st.pending[0]?.reason.slice(0, 80) || ''); }
        if (st.phase === 'tool') setCoreState(TOOL_LABEL[st.tool] || st.tool, String(st.arg || '').slice(0, 80));
      };
      const wsHandle = await getWorkDir(false).catch(() => null);
      const wsName = wsHandle ? wsHandle.name : null;
      const v2 = await window.__runReAct(text, { history, cfg, callLLM, getSkills, uiConfirm, execToolReal, onStatus, workspace: wsName });
      $('#typing').hidden = true;
      // Rede de segurança final: nunca exibe <tool> crua como resposta.
      if (/<tool\s+name=/.test(v2.answer || '')) {
        v2.answer = 'Encontrei os dados, mas o modelo devolveu a chamada em vez do resumo. Toque em "Nova" e pergunte de novo — ou use /news tecnologia (funciona sem IA).';
        v2.ok = false; v2.pending = [{ reason: 'tool crua filtrada na exibição' }];
      }
      const shaped = await shapeCodeAnswer(text, v2.answer, v2.toolsUsed);
      trackLLM([{ role: 'user', content: text }], shaped.display);
      if (v2.ok) {
        awDone(runAw, v2.corrections ? `Entregue após ${v2.corrections} correção(ões). Tarefa verificada.` : 'Entregue. Tarefa verificada de ponta a ponta.');
        addMsg('ai', shaped.display, `<span class="src">via ${PROVIDERS[cfg.provider].label} · ${escapeHtml(cfg.model)} · verificado${v2.corrections ? ` (${v2.corrections} correção)` : ''}${shaped.saved.length ? ' · código no monitor' : ''}</span>`);
      } else {
        awDone(runAw, 'Entregue com pendência explícita (ver abaixo).');
        const pendTxt = (v2.pending || []).map(p => p.reason).join(' | ').slice(0, 140) || 'não verificado';
        addMsg('ai', shaped.display, `<span class="src">via ${PROVIDERS[cfg.provider].label} · ${escapeHtml(cfg.model)} · pendente: ${escapeHtml(pendTxt)}${shaped.saved.length ? ' · código no monitor' : ''}</span>`);
      }
      history.push({ role: 'assistant', content: shaped.display });
      log(`Chat v2 → ${cfg.provider}/${cfg.model} ok=${v2.ok} corr=${v2.corrections || 0} (${text.slice(0, 60)}…)`, v2.ok ? 'ok' : 'warn');
      coreWinDone(win, v2.ok ? 'Resposta verificada e entregue.' : 'Entregue com pendência explícita.');
      coreIdle(); persist();
      return;
    } catch (e) { log('Falha v2, caindo p/ legado: ' + e.message, 'warn', `provedor=${cfg.provider} modelo=${cfg.model}\n${(e && e.stack) || e}`); /* fallback abaixo */ }
  }
  try {
    const _main = getMain();
    const wsH = await getWorkDir(false).catch(() => null);
    const wsNote = wsH
      ? `\n\n[WORKSPACE ativo: ${wsH.name} — arquivos do projeto via code_read/code_list/code_glob/code_grep/code_write/code_edit/code_bash.]`
      : `\n\n[Sem workspace autorizado: se pedir criar/ler/editar código, use code_* mesmo assim (o sistema orienta a autorizar a pasta) ou explique Configurações → Coding → Autorizar pasta.]`;
    const sys = 'Você é o My OS, harness de IA premium. Responda em português, direto e útil, com formatação leve (negrito, listas, código quando preciso).' + TOOLS_SYS + wsNote
      + (_main.personality ? `\n\n[AGENTE PRINCIPAL ${_main.name}: ${_main.personality}]` : '')
      + skillsCtx()
      + (skill ? `\n\n[SKILL ATIVA: ${skill.title}] ${skill.prompt}` : '');
    const sentMsgs = [{ role: 'system', content: sys },
      ...history.slice(-10).map(m => ({ role: m.role, content: m.content }))];
    let out = await callLLM(sentMsgs);
    const tool = parseToolCall(out);
    let via = `${PROVIDERS[cfg.provider].label} · ${escapeHtml(cfg.model)}${skill ? ' · skill ' + escapeHtml(skill.title) : ''}`;
    if (tool) {
      const TOOL_PT = { web_search: 'Buscando fontes', web_open: 'Lendo página', open_site: 'Abrindo site', run_skill: 'Executando skill', music_search: 'Buscando música', music_download: 'Baixando MP3', music_play: 'Tocando música', create_task: 'Criando tarefa', list_tasks: 'Lendo tarefas', complete_task: 'Concluindo tarefa', delete_task: 'Deletando tarefa', create_note: 'Criando nota', list_notes: 'Lendo notas', edit_note: 'Editando nota', delete_note: 'Deletando nota', news: 'Lendo notícias', code_read: 'Lendo arquivo', code_list: 'Listando pasta', code_glob: 'Buscando arquivos', code_grep: 'Buscando texto', code_write: 'Escrevendo arquivo', code_edit: 'Editando arquivo', code_bash: 'Executando comando', code_undo: 'Desfazendo' };
      const tlabel = TOOL_PT[tool.name] || tool.name;
      setCoreState(tlabel, `${tool.name}: ${tool.arg.slice(0, 90)}`);
      const twin = coreWindow({ icon: 'globe', title: tlabel, body: `<b>${escapeHtml(tool.name)}</b> · ${escapeHtml(tool.arg.slice(0, 120))}` });
      let result = '';
      const aw = agentWin({ icon: 'globe', title: `${tlabel} · ${tool.arg.slice(0, 50)}`, body: `<div class="awline">${ic('circle-dot')}<span>${escapeHtml(tlabel)}: <b>${escapeHtml(tool.arg.slice(0, 100))}</b></span></div>` });
      flashSkill(tool.name === 'news' ? 'noticias-digest' : tool.name === 'web_search' ? 'pesquisa-web' : 'navegador-web');
      try {
        if (tool.name === 'open_site') {
          const ytHit = await tryYouTubeFirst(tool.arg);
          if (ytHit) {
            awStep(aw, `<div class="awline">${ic('chevron-right')}<span>Tocando <b>${escapeHtml(ytHit.title)}</b> no monitor…</span></div>`);
            coreWinDone(twin, 'Vídeo no monitor.');
            awDone(aw, `Tocando: ${ytHit.title}.`);
            result = `O vídeo "${ytHit.title}" (${ytHit.url}) está tocando no monitor à direita. Confirme brevemente em português.`;
          } else {
          const target = resolveSite(tool.arg);
          if (!target) throw new Error('não identifiquei o site — me diga nome ou link');
          awStep(aw, `<div class="awline">${ic('chevron-right')}<span>Abrindo <b>${escapeHtml(target.name)}</b> no chat…</span></div>`);
          openSiteFlow(target, 'navegador Nexus');
          coreWinDone(twin, 'Site exibido no chat.');
          awDone(aw, `Aberto: ${target.name}.`);
          result = `O site "${target.name}" (${target.url}) já foi exibido no chat para o usuário. Confirme brevemente em português e ofereça ajuda adicional.`;
          }
        } else if (tool.name === 'run_skill') {
          const sk = getSkills().find(x => x.slug === tool.arg.toLowerCase() || x.title.toLowerCase() === tool.arg.toLowerCase());
          if (!sk) throw new Error('skill inexistente/inativa: ' + tool.arg);
          flashSkill(sk.slug);
          awStep(aw, `<div class="awline">${ic('chevron-right')}<span>Aplicando skill <b>${escapeHtml(sk.title)}</b>…</span></div>`);
          if (sk.action) for (const a of sk.action.split('\n').map(s => s.trim()).filter(Boolean)) await runActionLine(a, 'skill:' + sk.slug, twin);
          if (sk.prompt) {
            awStep(aw, `<div class="awline">${ic('chevron-right')}<span>Executando prompt da skill…</span></div>`);
            try {
              result = await callLLM([
                { role: 'system', content: sk.prompt + '\nResponda sempre em português, de forma direta e útil.' },
                { role: 'user', content: text },
              ]);
            } catch { result = `Skill "${sk.title}" executada, mas o modelo da skill não respondeu.`; }
          } else if (sk.action) {
            result = `A skill "${sk.title}" (${sk.slug}) foi executada no app e os resultados já apareceram no chat. Resuma ao usuário em português o que foi feito.`;
          } else {
            awStep(aw, `<div class="awline"><span>Sem ação nem prompt configurados — respondendo no modo conversa dela.</span></div>`);
            result = `A skill "${sk.title}" foi invocada sem ação/prompt configurados. Pergunte ao usuário o que ele quer que ela faça.`;
          }
          coreWinDone(twin, 'Skill executada: ' + sk.title);
          awDone(aw, `Skill ${sk.title} aplicada.`);
        } else {
          result = await execTool(tool.name, tool.arg, s => awStep(aw, `<div class="awline">${ic('chevron-right')}<span>${escapeHtml(s)}</span></div>`));
          coreWinDone(twin, `Leitura pronta (${result.length} chars).`);
          awDone(aw, 'Leitura pronta. Verificando conclusão…');
        }
      }
      catch (e) { result = 'FALHA NA FERRAMENTA: ' + e.message; coreWinDone(twin, 'Não consegui: ' + String(e.message).slice(0, 100), 'warn'); awDone(aw, 'Não consegui: ' + String(e.message).slice(0, 100)); }
      log(`Tool ${tool.name}: ${tool.arg.slice(0, 80)}`, 'info');
      const follow = [{ role: 'system', content: sys }, ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'assistant', content: out },
        { role: 'user', content: `[RESULTADO DA FERRAMENTA "${tool.name}" — use estes dados reais para responder, citando as fontes com links. Formate com títulos e listas limpas, sem emojis.]\n${result}` }];
      out = await callLLM(follow);
      trackLLM(follow, out);
      via += ' · navegador Nexus';
    } else {
      trackLLM(sentMsgs, out);
    }
    $('#typing').hidden = true;
    const shapedLeg = await shapeCodeAnswer(text, out, tool ? [tool.name] : []);
    addMsg('ai', shapedLeg.display, `<span class="src">via ${via}${shapedLeg.saved.length ? ' · código no monitor' : ''}</span>`);
    history.push({ role: 'assistant', content: shapedLeg.display });
    log(`Chat → ${cfg.provider}/${cfg.model} (${text.slice(0, 60)}…)`, 'info');
    coreWinDone(win, 'Resposta entregue.');
  } catch (err) {
    $('#typing').hidden = true;
    addMsg('ai', `Não consegui chamar a API (${escapeHtml(err.message)}).\n\n**Para usar agora:**\n1. Selecione **Groq** (grátis) à esquerda e cole sua key de \`console.groq.com\`\n2. Ou use comandos locais: \`/news tecnologia\`, \`/wiki IA\`, \`/yt link\`\n3. Skills e rotinas funcionam mesmo sem chave.`);
    log('Erro chat: ' + err.message, 'warn', `provedor=${cfg.provider} modelo=${cfg.model}\n${(err && err.stack) || err}`);
    coreWinDone(win, 'Falha na API. Verifique a chave.', 'warn');
  }
  coreIdle();
  persist();
});

/* ───────── COMANDOS LOCAIS ───────── */
function ytId(url) {
  const m = String(url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
function ytEmbed(url) {
  const id = ytId(url);
  if (id) return { embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`, watch: `https://www.youtube.com/watch?v=${id}` };
  return { embed: url, watch: url };
}
function openVideoWindow(url) {
  try {
    const w = window.open(url, 'myos-media-' + Date.now(), 'width=960,height=600,menubar=no,toolbar=no,location=no,status=no');
    if (w) { try { w.focus(); } catch {} return true; }
  } catch {}
  return false;
}
function winBtn(url, label) {
  const safe = String(url).replace(/'/g, '%27');
  return `<div class="actions btnrow" style="margin-top:8px"><button class="iconbtn" onclick="window.open('${safe}','_blank','width=960,height=600')">${ic('external-link')} ${escapeHtml(label || 'Abrir em janela')}</button></div>`;
}
function playMedia(url, title, popup = true) {
  const { embed } = ytEmbed(url);
  const id = ytId(url);
  $('#mediaDock').hidden = false;
  $('#mediaTitle').innerHTML = `${ic('play')} ${escapeHtml(title || 'Mídia')}`;
  icons();
  $('#mediaBody').innerHTML = id
    ? `<iframe src="${embed}" allow="autoplay; encrypted-media; fullscreen"></iframe>`
    : (/\.(mp3|ogg|wav|m4a)(\?|$)/i.test(url) ? `<audio controls autoplay src="${escapeHtml(url)}"></audio>`
      : `<iframe src="${escapeHtml(url)}" style="height:200px"></iframe>`);
  $('#mediaDock').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return popup ? openVideoWindow(embed) : false;
}
$('#mediaClose').onclick = () => { $('#mediaDock').hidden = true; $('#mediaBody').innerHTML = ''; };
function videoCard(url) {
  const id = ytId(url);
  const { watch } = ytEmbed(url);
  if (!id) return `<a href="${escapeHtml(url)}" target="_blank" style="color:var(--accent)">Abrir mídia em nova aba</a>`;
  return `<div class="vcard" data-watch="${escapeHtml(watch)}" title="Abrir em outra aba"><img loading="lazy" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="Prévia do vídeo"><span class="vplay"><span class="vbtn">${ic('play')}</span></span></div>`;
}
function videoEmbed(url) {
  const id = ytId(url);
  const { embed, watch } = ytEmbed(url);
  if (!id) return null;
  return `<div class="vembed" data-watch="${escapeHtml(watch)}" data-embed="${escapeHtml(embed)}"><iframe src="${escapeHtml(embed)}" title="Vídeo" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe><div class="vbar"><button class="iconbtn" data-vact="fs">${ic('maximize')}Tela cheia</button><button class="iconbtn" data-vact="tab">${ic('external-link')}Nova aba</button><button class="iconbtn" data-vact="pop">${ic('picture-in-picture-2')}Flutuante</button></div></div>`;
}
function showVideo(url, origin, queue) {
  try {
    if (window.Sandbox && window.Sandbox.playVideo(url, origin || 'YouTube', queue || [])) {
      addHtml('ai', `<b>${escapeHtml(origin || 'Vídeo')}</b>` + videoCard(url) + `<span class="src">tocando no monitor à direita · clique no monitor p/ ampliar</span>`);
      history.push({ role: 'assistant', content: 'Vídeo no monitor: ' + url });
      persist(); icons();
      try { log('Vídeo no monitor: ' + String(url).slice(0, 80), 'ok'); } catch {}
      return true;
    }
  } catch {}
  const emb = videoEmbed(url);
  addHtml('ai', `<b>${escapeHtml(origin || 'Vídeo')}</b>` + (emb || videoCard(url)) + `<span class="src">tocando aqui no chat · expanda só se quiser</span>`);
  history.push({ role: 'assistant', content: 'Vídeo exibido: ' + url });
  persist();
  icons();
  return true;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-vact]');
  if (!b) return;
  const wrap = b.closest('.vembed');
  if (!wrap) return;
  const act = b.dataset.vact;
  if (act === 'tab') window.open(wrap.dataset.watch, '_blank');
  if (act === 'pop') openVideoWindow(wrap.dataset.embed);
  if (act === 'fs') { try { if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen(); } catch {} }
});
document.addEventListener('click', e => {
  const v = e.target.closest('.vcard');
  if (v && v.dataset.watch) window.open(v.dataset.watch, '_blank');
});
function ytHomeCard() {
  return `<a class="vcard yt-home" href="https://www.youtube.com" target="_blank"><span class="vplay"><span class="vbtn">${ic('play')}</span></span><span class="vtxt"><b>YouTube</b><small>youtube.com · abrir em nova aba</small></span></a>`;
}
const KNOWN_SITES = {
  youtube:   { name: 'YouTube',        url: 'https://www.youtube.com',      icon: 'play' },
  gmail:     { name: 'Gmail',          url: 'https://mail.google.com',      icon: 'mail' },
  drive:     { name: 'Google Drive',   url: 'https://drive.google.com',     icon: 'hard-drive' },
  github:    { name: 'GitHub',         url: 'https://github.com',            icon: 'github' },
  netflix:   { name: 'Netflix',        url: 'https://www.netflix.com',      icon: 'film' },
  spotify:   { name: 'Spotify',        url: 'https://open.spotify.com',     icon: 'music' },
  whatsapp:  { name: 'WhatsApp Web',   url: 'https://web.whatsapp.com',     icon: 'message-circle' },
  instagram: { name: 'Instagram',      url: 'https://www.instagram.com',    icon: 'instagram' },
  linkedin:  { name: 'LinkedIn',       url: 'https://www.linkedin.com',     icon: 'linkedin' },
  stackoverflow: { name: 'Stack Overflow', url: 'https://stackoverflow.com', icon: 'code' },
  twitch:    { name: 'Twitch',         url: 'https://www.twitch.tv',        icon: 'twitch' }
};
function resolveSite(arg) {
  const raw = String(arg || '').trim();
  if (!raw) return null;
  const id = ytId(raw);
  if (id) return { name: 'Vídeo do YouTube', url: `https://www.youtube.com/watch?v=${id}`, icon: 'play', key: 'youtube', video: true };
  const norm = raw.toLowerCase().replace(/[\s._-]+/g, '');
  for (const k of Object.keys(KNOWN_SITES)) {
    if (norm.includes(k.replace(/[\s._-]+/g, ''))) return { ...KNOWN_SITES[k], key: k };
  }
  if (/x\.com|twitter/i.test(raw)) return { name: 'X (Twitter)', url: 'https://x.com', icon: 'twitter', key: 'x' };
  const dm = raw.match(/([a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
  if (dm) {
    let u = dm[1];
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try {
      const host = new URL(u).hostname.replace(/^www\./, '');
      if (host.includes('.')) return { name: host, url: u, icon: 'globe', key: 'site' };
    } catch {}
  }
  return null;
}
/* ───────── BUSCA YOUTUBE (tocar no monitor sem URL) ───────── */
function youtubeQuery(t) {
  return String(t || '')
    .replace(/\b(abre|abrir|vai\s+para|acessa(?:r)?|mostra(?:r)?|toca(?:r)?|toque|coloca(?:r)?|quero\s+ouvir|ouvir|play|assistir|passa(?:r)?|p[oõ]e|bota)\b/gi, ' ')
    .replace(/\b(no|na|do|da|em|o|a|os|as|de|pra|para|por|esse|essa|aquele|aquela|um|uma|favor|porfavor)\b/gi, ' ')
    .replace(/youtub(e|i)?/gi, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 80);
}
async function searchYouTube(q) {
  const query = String(q || '').trim().slice(0, 80);
  if (query.length < 2) return null;
  const t0 = Date.now();
  const sq = shortQuery(query);
  const variants = [query];
  if (sq && sq !== query.toLowerCase()) variants.push(sq);
  let w = (variants[variants.length - 1]).split(' ');
  while (w.length > 1 && variants.length < 4) { w = w.slice(0, -1); variants.push(w.join(' ')); }
  const got = await Promise.all([...new Set(variants)].map(x => toolMWMBL(x).catch(() => '')));
  const idsAny = [], idsTrusted = [];
  for (const txt of got) {
    for (const m of txt.matchAll(/(https?:\/\/[^\s)]+)|(?:[?&]v=([A-Za-z0-9_-]{11})|youtu\.be\/([A-Za-z0-9_-]{11})|youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11}))/g)) {
      const url = m[1] || '';
      const id = m[2] || m[3] || m[4] || ((url.match(/[?&]v=([A-Za-z0-9_-]{11})/) || [])[1]);
      if (!id) continue;
      if (!idsAny.includes(id)) idsAny.push(id);
      if (/youtube\.com|youtu\.be|viewtube|piped|invidious/i.test(url) && !idsTrusted.includes(id)) idsTrusted.push(id);
    }
  }
  const id = idsTrusted[0] || idsAny[0] || null;
  const queue = [...new Set([...idsTrusted, ...idsAny])].filter(x => x !== id);
  let hit = id ? { id, queue, via: 'MWMBL' } : null;
  if (!hit) {
    // Bridge (youtubei oficial, server-side) — se o usuário configurou em Coding
    try {
      const br = store.get('code-bridge', {}) || {};
      const u = String(br.url || '').replace(/\/$/, '');
      if (u && br.token) {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 9000);
        const r = await fetch(u + '/ytsearch', { method: 'POST', signal: c.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: br.token, q: query }) });
        clearTimeout(t);
        const j = await r.json().catch(() => ({}));
        const items = Array.isArray(j.items) ? j.items.map(x => x.id).filter(x => /^[A-Za-z0-9_-]{11}$/.test(x)) : [];
        if (r.ok && items.length) hit = { id: items[0], queue: items.slice(1), via: 'Bridge' };
      }
    } catch {}
  }
  try { log(`Busca YouTube "${query}" → ${hit ? hit.id + ' via ' + hit.via : 'VAZIO'} (${Date.now() - t0}ms)`, hit ? 'ok' : 'warn'); } catch {}
  return hit;
}
async function tryYouTubeFirst(arg) {
  const t = String(arg || '');
  let target = null;
  try { target = resolveSite(t); } catch {}
  if (target && !(target.key === 'youtube' && !target.video)) return null;
  if (!target && !/youtub|v[ií]deo|m[uú]sica|toca|toque|assistir|clipe|podcast/i.test(t)) return null;
  const q = youtubeQuery(t);
  if (q.length < 2) return null;
  const hit = await searchYouTube(q);
  if (!hit) return null;
  const url = `https://www.youtube.com/watch?v=${hit.id}`;
  const title = 'YouTube · ' + q.slice(0, 60);
  try { showVideo(url, title, hit.queue || []); } catch {}
  return { id: hit.id, url, title, via: hit.via };
}
function siteCard(name, url, icon = 'globe') {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  return `<a class="vcard yt-home" href="${escapeHtml(url)}" target="_blank"><span class="vplay"><span class="vbtn">${ic(icon)}</span></span><span class="vtxt"><b>${escapeHtml(name)}</b><small>${escapeHtml(host)} · abrir em nova aba</small></span></a>`;
}
function openSiteFlow(target, via) {
  if (!target) return false;
  if (target.video || (target.key === 'youtube' && ytId(target.url))) showVideo(target.url, target.name);
  else {
    addHtml('ai', `<b>${escapeHtml(target.name)}</b> aberto aqui no chat.` + siteCard(target.name, target.url, target.icon) + `<span class="src">clique no card para abrir em nova aba${via ? ' · ' + via : ''}</span>`);
    history.push({ role: 'assistant', content: target.name + ' aberto no chat: ' + target.url });
    persist();
  }
  if (target.key === 'youtube') flashSkill('youtube-player');
  coreWindow({ icon: target.icon || 'globe', title: target.name, body: `Exibido no chat${via ? ' via <b>' + escapeHtml(via) + '</b>' : ''}.` });
  log('Site aberto: ' + target.name, 'ok');
  return true;
}

async function cmdNews(topic = 'tecnologia') {
  addMsg('sys', 'Buscando notícias sobre "' + topic + '"…');
  const naw = agentWin({ icon: 'newspaper', title: 'Notícias · ' + topic, body: '<div class="awline">Buscando fontes…</div>' });
  coreBusy('Buscando notícias', 'Tema: ' + topic);
  const win = coreWindow({ icon: 'newspaper', title: 'Notícias', body: `Tema <b>${escapeHtml(topic)}</b> · fonte HackerNews` });
  try {
    const r = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&hitsPerPage=8`);
    const j = await r.json();
    const cards = j.hits.map(h => `<div class="rsrc"><b>${escapeHtml(h.title)}</b><small>Hacker News · ${h.points || 0} pontos</small><a href="${h.url || 'https://news.ycombinator.com/item?id=' + h.objectID}" target="_blank">Ler matéria</a></div>`).join('');
    const items = j.hits.map(h => h.title);
    addHtml('ai', `<b>Notícias: ${escapeHtml(topic)}</b>` + cards, '<span class="src">fonte: HackerNews API · peça “resuma com IA” a seguir</span>');
    history.push({ role: 'assistant', content: 'Notícias sobre ' + topic + ': ' + items.join(' | ') });
    log(`News digest: ${topic} (${items.length} itens)`, 'ok');
    coreWinDone(win, items.length + ' manchetes coletadas.');
    awDone(naw, items.length + ' manchetes.');
    coreIdle();
    return true;
  } catch { addMsg('ai', 'Falha ao buscar notícias (rede?). Tente de novo.'); coreWinDone(win, 'Falha de rede.', 'warn'); awDone(naw, 'Falha de rede.'); coreIdle(); return true; }
}
async function cmdWiki(term) {
  addMsg('sys', 'Pesquisando "' + term + '"…');
  const waw = agentWin({ icon: 'search', title: 'Pesquisa · ' + term, body: '<div class="awline">Consultando Wikipedia…</div>' });
  coreBusy('Pesquisa web', term);
  const win = coreWindow({ icon: 'search', title: 'Pesquisa web', body: `Termo <b>${escapeHtml(term)}</b> · fonte Wikipedia` });
  try {
    const r = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
    if (!r.ok) throw 0;
    const j = await r.json();
    addHtml('ai', `<div class="rsrc"><b>${escapeHtml(j.title)}</b><p>${escapeHtml(j.extract || 'Sem resumo.')}</p><a href="${j.content_urls?.desktop?.page || 'https://pt.wikipedia.org'}" target="_blank">Ler na Wikipedia</a></div><span class="src">fonte: Wikipedia</span>`);
    log('Wiki: ' + term, 'ok');
    coreWinDone(win, 'Resumo obtido.');
    awDone(waw, 'Resumo obtido.');
  } catch { addMsg('ai', 'Nada na Wikipedia PT. Tente o termo em inglês ou use a IA com chave.'); coreWinDone(win, 'Sem resultados.', 'warn'); awDone(waw, 'Sem resultados.'); }
  coreIdle();
  return true;
}
async function handleCommand(text) {
  const t = text.trim();
  if (/^\/news\b/i.test(t)) { await cmdNews(t.replace(/^\/news\s*/i, '') || 'tecnologia'); return true; }
  if (/^\/wiki\b/i.test(t)) { await cmdWiki(t.replace(/^\/wiki\s*/i, '') || 'Inteligência artificial'); return true; }
  if (/^\/yt\b/i.test(t)) {
    const u = t.replace(/^\/yt\s*/i, '');
    coreBusy('Reproduzindo vídeo', u.slice(0, 80));
    coreWindow({ icon: 'play', title: 'Mídia', body: `Exibindo vídeo no chat.` });
    showVideo(u, 'YouTube');
    coreIdle(); return true;
  }
  if (/^\/rotina\b/i.test(t)) {
    const m = t.match(/(\d{1,2}:\d{2})/);
    openRoutineForm(m ? m[1] : '08:00');
    switchTab('routines');
    addHtml('ai', `Abri o criador de rotina${m ? ' para <b>' + m[1] + '</b>' : ''}. Preencha as ações e salve — ela dispara sozinha todo dia.`);
    return true;
  }
  if (/^\/(musica|music|play|tocar|baixar|download)\b/i.test(t)) {
    const q = t.replace(/^\/(musica|music|play|tocar|baixar|download)\s*/i, '').trim() || 'lofi';
    const isDl = /^\/(baixar|download)\b/i.test(t);
    if (isDl) await musicSearchDownload(q, 'comando /baixar');
    else await musicSearchPlay(q, 'comando /musica');
    return true;
  }
  if (/^\/(teste-voz|voz-teste)\b/i.test(t)) {
    try { await window.Voice.selfTest(); } catch (e) { addMsg('ai', 'Teste de voz indisponível: ' + escapeHtml(e.message)); }
    return true;
  }
  if (/^\/undo\b/i.test(t)) { await codeUndoFlow(); return true; }
  if (/^\/skill\b/i.test(t)) {
    const q = t.replace(/^\/skill\s*/i, '').toLowerCase();
    const s = getSkills().find(s => s.slug.includes(q) || s.title.toLowerCase().includes(q));
    addMsg('ai', s ? `<b>${escapeHtml(s.title)}</b><br>${escapeHtml(s.desc)}<br><br><i>Prompt:</i> ${escapeHtml(s.prompt.slice(0, 220))}…` : 'Skills: ' + getSkills().map(s => s.slug).join(' · '));
    if (s) flashSkill(s.slug);
    return true;
  }
  // linguagem natural → atalhos
  if (/^(pesquise|faça uma pesquisa|pesquisa na web)/i.test(t)) { await cmdWiki(t.replace(/^(pesquise|faça uma pesquisa|pesquisa na web)[^:]*:?\s*/i, '').slice(0, 80) || 'IA'); return false; }
  return false;
}

/* ───────── SKILLS ───────── */
function normSkill(s) {
  s.icon = EMOJI_ICON[s.icon] || (/^[a-z-]+$/.test(s.icon || '') ? s.icon : 'sparkles');
  return s;
}
function getSkills() {
  const gone = new Set(Array.isArray(store.get('deletedSkills', [])) ? store.get('deletedSkills', []) : []);
  let saved = null;
  try {
    saved = store.get('skills', null);
    if (saved && !Array.isArray(saved)) saved = null;
    if (saved) saved = saved.filter(s => s && typeof s.slug === 'string');
  } catch { saved = null; }
  if (saved) {
    const have = new Set(saved.map(s => s.slug));
    const merged = saved.map(normSkill);
    DEFAULT_SKILLS.forEach(d => { if (!have.has(d.slug) && !gone.has(d.slug)) merged.push({ ...d }); });
    if (merged.length !== saved.length) store.set('skills', merged);
    return merged;
  }
  const fresh = DEFAULT_SKILLS.filter(s => !gone.has(s.slug)).map(s => ({ ...s }));
  store.set('skills', fresh);
  return fresh;
}
function saveSkills(s) { store.set('skills', s); renderSkills(); renderSideSkills(); }
function skillsCtx() {
  try {
    const act = getSkills().filter(s => s.active);
    if (!act.length) return '';
    return '\n\n[SKILLS DISPONÍVEIS NESTE APP — você decide quando usar. Para EXECUTAR uma, responda SOMENTE `<tool name="run_skill">slug</tool>` e o sistema executa e devolve o resultado: '
      + act.map(s => `${s.slug} (${s.title}: ${s.desc})`).join(' | ') + ']';
  } catch { return ''; }
}
function detectSkill(text) {
  const skills = getSkills().filter(s => s.active);
  const t = text.toLowerCase();
  return skills.find(s => t.includes(s.slug) || t.includes(s.title.toLowerCase().split(' ')[0])) || null;
}
function findSkillByMention(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return null;
  const skills = getSkills();
  return skills.find(s => s.slug === n)
    || skills.find(s => s.slug.startsWith(n))
    || skills.find(s => s.title.toLowerCase().split(' ')[0] === n)
    || null;
}
async function runSkillMention(sk, task) {
  const t = String(task || '').trim();
  const win = coreWindow({ icon: sk.icon || 'sparkles', title: 'Skill · ' + sk.title, body: `<b>${escapeHtml(sk.title)}</b> · <code>${escapeHtml(sk.slug)}</code>${t ? '<br>"' + escapeHtml(t.slice(0, 120)) + '"' : ''}` });
  flashSkill(sk.slug, true);
  let acted = 0;
  if (sk.action) {
    for (const a of sk.action.split('\n').map(x => x.trim()).filter(Boolean)) { await runActionLine(a, 'skill:' + sk.slug, null); acted++; }
  }
  if (sk.prompt && t) {
    $('#typing').hidden = false;
    try {
      const sent = [{ role: 'system', content: sk.prompt + '\nResponda sempre em português, de forma direta e útil.' }, { role: 'user', content: t }];
      const out = await callLLM(sent);
      trackLLM(sent, out);
      $('#typing').hidden = true;
      addMsg('ai', out, `<span class="src">skill ${escapeHtml(sk.slug)} · ${PROVIDERS[cfg.provider].label} · ${escapeHtml(cfg.model)}</span>`);
      history.push({ role: 'assistant', content: out });
    } catch (err) {
      $('#typing').hidden = true;
      addHtml('ai', `Skill <b>${escapeHtml(sk.title)}</b> invocada, mas a IA não respondeu (${escapeHtml(String(err.message).slice(0, 80))}). Confira a chave em Configurações → Conexão.`);
      history.push({ role: 'assistant', content: 'Skill ' + sk.slug + ' falhou: ' + err.message });
    }
  } else if (!t && !acted) {
    addHtml('ai', `<b>${escapeHtml(sk.title)}</b> · <code>${escapeHtml(sk.slug)}</code><br>${escapeHtml(sk.desc || '')}${sk.prompt ? `<br><br><i>Prompt:</i> ${escapeHtml(sk.prompt.slice(0, 220))}…` : ''}<br><span class="src">use <code>@${escapeHtml(sk.slug)} &lt;tarefa&gt;</code> p/ executar</span>`);
    history.push({ role: 'assistant', content: 'Skill ' + sk.slug + ': ' + (sk.desc || sk.title) });
  } else {
    addHtml('ai', `Skill <b>${escapeHtml(sk.title)}</b> invocada${acted ? ` · ${acted} ação(ões) executada(s)` : ''}.`);
    history.push({ role: 'assistant', content: 'Skill ' + sk.slug + ' invocada' + (acted ? ` (${acted} ações)` : '') });
  }
  coreWinDone(win, 'Skill aplicada.');
  log('Skill @' + sk.slug + (t ? ' · ' + t.slice(0, 50) : ''), 'ok');
  return true;
}
function renderSideSkills() {
  const box = $('#sideSkills'); box.innerHTML = '';
  getSkills().forEach(s => {
    const d = document.createElement('div');
    d.className = 'miniskill' + (s.active ? '' : ' off');
    d.innerHTML = `${ic(s.icon)}<span>${escapeHtml(s.title.split(' ')[0])}</span>`;
    d.title = s.title + ' — ' + s.desc;
    d.onclick = () => { switchTab('skills'); };
    box.appendChild(d);
  });
  const _sc = $('#skillCount'); if (_sc) _sc.textContent = getSkills().filter(s => s.active).length;
  icons();
}
try {
  $('#skToggle').onclick = e => { e.stopPropagation(); const c = $('#skillsSide'); if (c) c.classList.toggle('min'); };
  $('#skillsSideHead').onclick = e => { if (e.target.closest('button')) return; const c = $('#skillsSide'); if (c) c.classList.toggle('min'); };
} catch {}
function renderSkills() {
  const box = $('#skillList'); box.innerHTML = '';
  getSkills().forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'skill' + (s.active ? '' : ' off');
    d.dataset.slug = s.slug;
    d.innerHTML = `<div class="skill-top"><span class="sic">${ic(s.icon)}</span><b>${escapeHtml(s.title)}</b>
      <button class="switch ${s.active ? 'on' : ''}" data-i="${i}" title="ativar/desativar"></button></div>
      <div class="meta"><code>${escapeHtml(s.slug)}</code> · ${escapeHtml(s.desc)}</div>
      <div class="actions btnrow" style="margin-top:8px">
        <button class="iconbtn" data-run="${i}">${ic('play')}usar</button>
        <button class="iconbtn" data-edit="${i}">${ic('pencil')}editar</button>
        <button class="iconbtn danger" data-del="${i}">${ic('trash-2')}</button>
      </div>`;
    box.appendChild(d);
  });
  $$('#skillList .switch').forEach(b => b.onclick = () => { const s = getSkills(); s[+b.dataset.i].active = !s[+b.dataset.i].active; saveSkills(s); });
  $$('#skillList [data-run]').forEach(b => b.onclick = () => {
    const s = getSkills()[+b.dataset.run];
    $('#input').value = `Usando a skill ${s.slug}: `; $('#input').focus();
    if (s.action) runActionLine(s.action.split('\n')[0], 'skill:' + s.slug);
    toast('sparkles', `Skill <b>${escapeHtml(s.title)}</b>: 1ª ação disparada, resto no chat.`);
    flashSkill(s.slug);
  });
  $$('#skillList [data-edit]').forEach(b => b.onclick = () => openSkillForm(getSkills()[+b.dataset.edit]));
  $$('#skillList [data-del]').forEach(b => b.onclick = async () => {
    try {
      const s0 = getSkills()[+b.dataset.del];
      if (!s0) { toast('x', 'Skill não encontrada — lista desatualizada, recarregue a aba.'); return; }
      if (!(await uiConfirm('Excluir skill', `Remover "${s0.title || s0.slug}" da aplicação?`, 'Excluir'))) return;
      const s = getSkills(); const [rm] = s.splice(+b.dataset.del, 1);
      if (!rm) { toast('x', 'Skill já removida.'); return; }
      if (DEFAULT_SKILLS.some(d => d.slug === rm.slug)) {
        store.set('deletedSkills', [...new Set([...(store.get('deletedSkills', []) || []), rm.slug])]);
      }
      saveSkills(s);
      toast('trash-2', `Skill <b>${escapeHtml(rm.title || rm.slug)}</b> excluída da aplicação.`);
    } catch (e) {
      log('Falha ao excluir skill: ' + (e && e.message || e), 'warn');
      toast('x', 'Não consegui excluir: ' + escapeHtml(String((e && e.message) || e).slice(0, 120)));
    }
  });
  icons();
}
let editingSkillSlug = null;
function openSkillForm(s = null) {
  $('#skillForm').hidden = false;
  $('#skillFormTitle').textContent = s ? 'Editar skill' : 'Nova skill';
  editingSkillSlug = s ? s.slug : null;
  $('#sSlug').value = s?.slug || ''; $('#sIcon').value = s?.icon || 'sparkles';
  $('#sTitle').value = s?.title || ''; $('#sDesc').value = s?.desc || '';
  $('#sPrompt').value = s?.prompt || ''; $('#sAction').value = s?.action || '';
  $('#sTitle').focus();
}
$('#btnNewSkill').onclick = () => openSkillForm(null);
$('#btnCancelSkill').onclick = () => $('#skillForm').hidden = true;
function slugifySkill(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
$('#skillForm').onsubmit = e => {
  e.preventDefault();
  const title = $('#sTitle').value.trim() || 'Nova skill';
  let slug = slugifySkill($('#sSlug').value) || slugifySkill(title) || 'nova-skill';
  const all = getSkills();
  const oldIdx = editingSkillSlug ? all.findIndex(x => x.slug === editingSkillSlug) : -1;
  const old = oldIdx >= 0 ? all[oldIdx] : null;
  if (!old || old.slug !== slug) {
    let n = 2; const base = slug;
    while (all.some(x => x.slug === slug)) { slug = `${base}-${n}`; n++; }
  }
  if (old && old.slug !== slug && DEFAULT_SKILLS.some(d => d.slug === old.slug)) {
    store.set('deletedSkills', [...new Set([...(store.get('deletedSkills', []) || []), old.slug])]);
  }
  const s = { slug, icon: $('#sIcon').value.trim().toLowerCase() || 'sparkles',
    title, desc: $('#sDesc').value.trim(),
    prompt: $('#sPrompt').value.trim() || 'Seja útil e responda em português, de forma direta.',
    action: $('#sAction').value.trim(), active: old ? old.active !== false : true };
  if (!/^[a-z-]+$/.test(s.icon)) s.icon = 'sparkles';
  if (oldIdx >= 0) all[oldIdx] = s; else all.push(s);
  store.set('deletedSkills', (store.get('deletedSkills', []) || []).filter(x => x !== s.slug));
  saveSkills(all); $('#skillForm').hidden = true; editingSkillSlug = null;
  flashSkill(s.slug, true);
  toast('sparkles', `Skill <b>${escapeHtml(s.title)}</b> salva — o agente já pode usá-la via <code>${escapeHtml(s.slug)}</code>.`);
  log('Skill salva: ' + s.slug, 'ok');
};

/* ───────── ROTINAS ───────── */
function getRoutines() {
  const saved = store.get('routines', null);
  if (saved) return saved.map(r => ({ ...r, name: cleanTxt(r.name) || 'Rotina' }));
  return [
    { id: 'r-manha', name: 'Rotina da manhã', time: '08:00', repeat: 'daily', days: [1,2,3,4,5], active: true, lastRun: '',
      actions: ['musica: https://www.youtube.com/watch?v=jfKfPfyJRdk', 'noticias: tecnologia', 'prompt: Bom dia! Resuma as notícias acima e monte minha agenda de hoje com 3 prioridades.', 'abrir: https://gmail.com'] }
  ];
}
function saveRoutines(r) { store.set('routines', r); renderRoutines(); }
function renderRoutines() {
  const box = $('#routineList'); box.innerHTML = '';
  const rs = getRoutines();
  if (!rs.length) box.innerHTML = '';
  rs.forEach((r, i) => {
    const d = document.createElement('div');
    d.className = 'routine';
    d.innerHTML = `<div class="routine-top"><span class="time-badge">${ic('alarm-clock')} ${escapeHtml(r.time)}</span><b>${escapeHtml(r.name)}</b>
      <button class="switch ${r.active ? 'on' : ''}" data-i="${i}"></button></div>
      <div class="meta">${escapeHtml({daily:'Todo dia',weekdays:'Seg–Sex',weekends:'Fim de semana',once:'Uma vez'}[r.repeat] || r.repeat)} · ${r.actions.length} ações${r.lastRun ? ' · última: ' + escapeHtml(r.lastRun) : ''}<br><code>${escapeHtml(r.actions[0] || '')}${r.actions.length > 1 ? ' …' : ''}</code></div>
      <div class="actions"><button class="iconbtn" data-run="${i}">${ic('play')}executar agora</button>
      <button class="iconbtn" data-edit="${i}">${ic('pencil')}</button><button class="iconbtn danger" data-del="${i}">${ic('trash-2')}</button></div>`;
    box.appendChild(d);
  });
  $$('#routineList .switch').forEach(b => b.onclick = () => { const r = getRoutines(); r[+b.dataset.i].active = !r[+b.dataset.i].active; saveRoutines(r); toast('alarm-clock', 'Rotina ' + (r[+b.dataset.i].active ? '<b>ativada</b>' : 'pausada')); });
  $$('#routineList [data-run]').forEach(b => b.onclick = () => runRoutine(getRoutines()[+b.dataset.run], true));
  $$('#routineList [data-edit]').forEach(b => b.onclick = () => openRoutineForm(null, getRoutines()[+b.dataset.edit]));
  $$('#routineList [data-del]').forEach(b => b.onclick = async () => { if (await uiConfirm('Excluir rotina', 'Remover esta rotina agendada?', 'Excluir')) { const r = getRoutines(); r.splice(+b.dataset.del, 1); saveRoutines(r); } });
  icons();
}
let editingRoutine = -1;
function openRoutineForm(time = '08:00', r = null) {
  $('#routineForm').hidden = false;
  $('#routineFormTitle').textContent = r ? 'Editar rotina' : 'Nova rotina';
  editingRoutine = r ? getRoutines().indexOf(r) : -1;
  $('#rName').value = r?.name || 'Rotina da manhã';
  $('#rTime').value = r?.time || time;
  $('#rRepeat').value = r?.repeat || 'daily';
  $('#rActions').value = (r?.actions || ['musica: https://www.youtube.com/watch?v=jfKfPfyJRdk', 'noticias: tecnologia', 'prompt: Resuma as notícias e monte minha agenda de hoje.']).join('\n');
}
$('#btnNewRoutine').onclick = () => openRoutineForm('08:00', null);
$('#btnCancelRoutine').onclick = () => $('#routineForm').hidden = true;
$$('#rDays button').forEach(b => b.onclick = () => b.classList.toggle('on'));
$('#routineForm').onsubmit = e => {
  e.preventDefault();
  const days = $$('#rDays button.on').map(b => +b.dataset.day);
  const r = { id: 'r' + Date.now(), name: cleanTxt($('#rName').value) || 'Rotina', time: $('#rTime').value || '08:00',
    repeat: $('#rRepeat').value, days, active: true, lastRun: '',
    actions: $('#rActions').value.split('\n').map(s => s.trim()).filter(Boolean) };
  const all = getRoutines();
  if (editingRoutine >= 0) { r.id = all[editingRoutine].id; r.lastRun = all[editingRoutine].lastRun; all[editingRoutine] = r; }
  else all.push(r);
  saveRoutines(all); $('#routineForm').hidden = true;
  toast('alarm-clock', `Rotina <b>${escapeHtml(r.name)}</b> salva para ${r.time}.`);
  log(`Rotina salva: ${r.name} @ ${r.time}`, 'ok');
  askNotify()
};
const ACTION_ICON = { musica: 'music', youtube: 'play', video: 'play', noticias: 'newspaper', news: 'newspaper', abrir: 'rocket', open: 'rocket', app: 'rocket', prompt: 'brain', ia: 'brain', perguntar: 'brain', skill: 'sparkles' };
async function runActionLine(line, origin, stepWin) {
  const [kind, ...rest] = line.split(':');
  const val = rest.join(':').trim();
  const k = kind.trim().toLowerCase();
  const done = t => { if (stepWin) stepWin.querySelector('p').innerHTML += `<br><b>${escapeHtml(t)}</b>`; };
  if (k === 'musica' || k === 'youtube' || k === 'video' || k === 'janela') {
    if (ytId(val)) { showVideo(val, origin); done('Vídeo exibido no chat.'); }
    else if (/^https?:\/\/.+\.(mp3|ogg|m4a|wav)(\?|$)/i.test(val) || /^https?:\/\//i.test(val) && /\.(mp3|ogg)/i.test(val)) {
      musicPlayUrl(val, origin); done('Música em reprodução no player.');
    } else if (/^https?:\/\//i.test(val)) {
      playMedia(val, origin, true);
      addHtml('ai', `<b>Tocando áudio</b> (${escapeHtml(origin)}) no dock.`);
      history.push({ role: 'assistant', content: 'Áudio em reprodução: ' + val });
      persist();
      done('Áudio em reprodução no dock.');
    } else {
      // texto livre → busca nos repositórios gratuitos e toca o 1º
      const found = await musicSearchPlay(val || 'lofi', origin);
      done(found ? 'Música encontrada e tocando.' : 'Nada encontrado.');
    }
  }
  else if (k === 'baixar' || k === 'download' || k === 'dl') {
    const found = await musicSearchDownload(val || 'lofi', origin);
    done(found ? 'Download iniciado.' : 'Nada para baixar.');
  }
  else if (k === 'noticias' || k === 'news') { await cmdNews(val || 'tecnologia'); done('Notícias coletadas.'); }
  else if (k === 'abrir' || k === 'open' || k === 'app') {
    window.open(val, '_blank');
    addHtml('ai', `Abrindo <b>${escapeHtml(val)}</b>.<br><span class="src">No Linux, para app nativo use: <code>xdg-open ${escapeHtml(val)}</code></span>`);
    done('Link aberto: ' + val);
  }
  else if (k === 'prompt' || k === 'ia' || k === 'perguntar') {
    $('#typing').hidden = false;
    try { const sentR = [{ role: 'system', content: 'Você executa rotinas do My OS. Responda em português.' }, { role: 'user', content: val }];
      const out = await callLLM(sentR);
      trackLLM(sentR, out);
      $('#typing').hidden = true; addMsg('ai', out, `<span class="src">rotina · ${escapeHtml(origin)} · ${PROVIDERS[cfg.provider].label}</span>`);
      done('Resposta da IA entregue.');
    } catch (err) { $('#typing').hidden = true; addMsg('ai', 'Rotina sem IA (sem chave): ' + escapeHtml(val)); done('IA indisponível (sem chave).'); }
  }
  else if (k === 'skill') {
    const s = getSkills().find(x => x.slug === val || x.title.toLowerCase().includes(val.toLowerCase()));
    if (s) flashSkill(s.slug);
    if (s && s.action) for (const a of s.action.split('\n')) await runActionLine(a, 'skill:' + s.slug, stepWin);
    else addHtml('ai', `Skill <b>${escapeHtml(val)}</b> invocada.`);
    done('Skill executada: ' + val);
  }
  else { addHtml('ai', `Ação desconhecida: <code>${escapeHtml(line)}</code>`); done('Ação ignorada.'); }
}
/* ───────── MÚSICA: tocar + baixar via repositórios gratuitos ───────── */
function __mhash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return Math.abs(h).toString(36); }
function musicTrackCard(t) {
  window.__mcards = window.__mcards || {};
  const key = 'm' + __mhash(String(t.id || t.url));
  window.__mcards[key] = t;
  return `<div class="rsrc"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.artist || '')} · ${escapeHtml(t.source || '')} · ${escapeHtml(t.license || '')}</small><br><audio controls preload="none" src="${escapeHtml(t.url)}" style="width:100%;margin-top:6px"></audio><div class="btnrow" style="margin-top:6px"><button class="iconbtn" data-mcard="${key}" title="Tocar">${ic('play')}tocar</button><a class="iconbtn" href="${escapeHtml(t.downloadUrl || t.url)}" download target="_blank" rel="noopener">${ic('download')}baixar MP3</a>${t.page ? `<a class="iconbtn" href="${escapeHtml(t.page)}" target="_blank" rel="noopener">${ic('external-link')}fonte</a>` : ''}</div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-mcard]');
  if (!b) return;
  const t = (window.__mcards || {})[b.dataset.mcard];
  if (t && window.MusicPlayer) window.MusicPlayer.playTrack(t);
});
function musicPlayUrl(url, origin) {
  const t = { id: 'url:' + url.slice(0, 60), title: url.split('/').pop().slice(0, 60) || 'Áudio', artist: origin || 'link direto', url, downloadUrl: url, license: 'ver fonte', source: 'link direto', page: url };
  try { window.MusicPlayer && MusicPlayer.playTrack(t); } catch {}
  addHtml('ai', `<b>Tocando agora</b> no player inferior.<br>${musicTrackCard(t)}<span class="src">via ${escapeHtml(origin || 'chat')}</span>`);
  history.push({ role: 'assistant', content: 'Tocando: ' + url });
  persist(); icons();
}
async function musicSearchPlay(q, origin) {
  const isLocalQ = /minha biblioteca|meu computador|upad|enviad|local/i.test(q);
  addMsg('sys', `Buscando "${q}" (sua biblioteca + repositórios gratuitos)…`);
  coreBusy('Buscando música', q);
  try {
    // 1) locais primeiro
    let list = [];
    try { list = (window.LocalMusic ? window.LocalMusic.search(q) : []).slice(0, 6); } catch {}
    let viaLocal = list.length > 0;
    if (!list.length) list = await window.MusicRepos.search(q, 'all', 6);
    if (!list.length) {
      const n = window.LocalMusic ? window.LocalMusic.count : 0;
      addMsg('ai', `Nada para "<b>${escapeHtml(q)}</b>". ${n ? 'Sua biblioteca tem ' + n + ' faixa(s) — peça <code>lista minhas músicas</code>.' : 'Adicione arquivos no player à esquerda (+ arquivos/pasta) ou tente "lofi", "jazz".'}`);
      coreIdle(); return null;
    }
    const t = list[0];
    try { window.MusicPlayer && MusicPlayer.playTrack(t); window.MusicPlayer && MusicPlayer.renderResults(viaLocal ? [] : list); } catch {}
    addHtml('ai', `<b>Tocando: ${escapeHtml(t.title)}</b><br><small>${escapeHtml(t.artist)} · ${escapeHtml(t.source)}${viaLocal ? ' · player à esquerda' : ''}</small>` + (viaLocal ? '' : list.slice(0, 4).map(musicTrackCard).join('')) + `<span class="src">${viaLocal ? 'minha biblioteca · player à esquerda com play/pause' : 'Internet Archive + Wikimedia · peça "baixa ' + escapeHtml(q) + '" p/ download'}</span>`);
    history.push({ role: 'assistant', content: `Tocando ${t.title} (${t.source}): ${t.url}` });
    log(`Música tocando: ${t.title} [${q}]${viaLocal ? ' (local)' : ''}`, 'ok');
    coreIdle(); persist(); icons(); return t;
  } catch (e) { addMsg('ai', 'Falha na busca de música: ' + escapeHtml(e.message)); coreIdle(); return null; }
}
function musicControl(cmd) {
  const MP = window.MusicPlayer;
  if (!MP) return null;
  if (cmd === 'pause') { try { ensureAudioPause(); } catch {} MP.toggle && MP.now() && MP.isPlaying() && MP.toggle(); }
  if (cmd === 'play') { MP.toggle(); }
  if (cmd === 'next') { MP.next(); }
  if (cmd === 'prev') { MP.prev(); }
  const t = MP.now && MP.now();
  return t;
}
function ensureAudioPause() { const a = document.querySelector('#musicAudio'); if (a && !a.paused) a.pause(); }
async function musicSearchDownload(q, origin) {
  addMsg('sys', `Baixando "${q}" (MP3 gratuito)…`);
  coreBusy('Baixando música', q);
  try {
    const list = await window.MusicRepos.search(q, 'all', 6);
    if (!list.length) { addMsg('ai', 'Nada para baixar. Tente outro termo.'); coreIdle(); return null; }
    const t = list[0];
    try { window.MusicPlayer && MusicPlayer.renderResults(list); } catch {}
    try { switchTab('music'); } catch {}
    await window.MusicRepos.download(t);
    addHtml('ai', `<b>Download iniciado: ${escapeHtml(t.title)}</b><br>${musicTrackCard(t)}<span class="src">se o navegador bloquear, use o botão baixar MP3</span>`);
    history.push({ role: 'assistant', content: `Download: ${t.title} ${t.downloadUrl}` });
    log(`Música baixada: ${t.title}`, 'ok');
    coreIdle(); persist(); icons(); return t;
  } catch (e) { addMsg('ai', 'Falha no download: ' + escapeHtml(e.message)); coreIdle(); return null; }
}
async function runRoutine(r, manual = false) {
  toast('alarm-clock', `Rotina <b>${escapeHtml(r.name)}</b> em execução (${r.actions.length} ações)…`);
  addMsg('sys', `Rotina "${r.name}" ${manual ? 'manual' : 'agendada ' + r.time} — ${r.actions.length} ações`);
  log(`Rotina disparada: ${r.name} (${r.actions.length} ações)`, 'ok');
  coreBusy('Executando rotina', r.name + ' · ' + r.actions.length + ' ações');
  const win = coreWindow({ icon: 'alarm-clock', title: r.name, body: `Disparo <b>${manual ? 'manual' : 'agendado ' + escapeHtml(r.time)}</b> · ${r.actions.length} ações:` });
  const aw = agentWin({ icon: 'alarm-clock', title: `${r.name} · ${r.actions.length} ações`, body: `<div class="awline">${ic('circle-dot')}<span>Início <b>${manual ? 'manual' : 'agendado ' + escapeHtml(r.time)}</b> · ${r.actions.length} ações</span></div>` });
  let i = 0;
  const results = [];
  for (const a of r.actions) {
    i++;
    const [kind] = a.split(':');
    win.querySelector('p').innerHTML += `<br>${i}. ${escapeHtml(a.slice(0, 80))}`;
    awStep(aw, `<div class="awline">${ic('chevron-right')}<span>Ação <b>${i}/${r.actions.length}</b> (${escapeHtml(kind.trim())}): ${escapeHtml(a.slice(0, 60))}…</span></div>`);
    setCoreState(`${r.name} · ${i}/${r.actions.length}`, kind.trim() + ': ' + a.slice(0, 60));
    try { await runActionLine(a, r.name, win); results.push({ line: a, ok: true }); }
    catch (e) { results.push({ line: a, ok: false, detail: e.message }); awStep(aw, `<div class="awline">${ic('x')}<span>Ação ${i} não conseguiu: ${escapeHtml(e.message.slice(0, 80))}</span></div>`); }
  }
  const bad = results.filter(x => !x.ok);
  coreWinDone(win, bad.length ? `${bad.length}/${results.length} ações não conseguiram.` : 'Todas as ações aplicadas.');
  awDone(aw, bad.length ? `Entregue com pendência: ${bad.length} ação(ões).` : `Entregue: ${results.length}/${results.length} ações aplicadas.`);
  coreIdle(bad.length ? r.name + ' com pendência.' : r.name + ' aplicada.');
  const all = getRoutines(); const ix = all.findIndex(x => x.id === r.id);
  if (ix >= 0) { all[ix].lastRun = new Date().toLocaleString('pt-BR'); saveRoutines(all); }
  try { new Notification('My OS · ' + r.name, { body: r.actions.length + ' ações executadas.' }); } catch {}
}
/* scheduler: checa a cada 20s */
setInterval(() => {
  const now = new Date();
  const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const wd = now.getDay();
  getRoutines().filter(r => r.active && r.time === hm).forEach(r => {
    const today = now.toDateString();
    if (r.lastRun?.includes(today) && r.repeat !== 'once') {
      const k = 'nexus:fired:' + r.id + ':' + today + ':' + hm;
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, '1');
    }
    if (r.repeat === 'weekdays' && (wd === 0 || wd === 6)) return;
    if (r.repeat === 'weekends' && !(wd === 0 || wd === 6)) return;
    if (r.repeat === 'daily' || r.repeat === 'once' || (r.days || []).includes(wd)) runRoutine(r);
    if (r.repeat === 'once') { const all = getRoutines(); all.find(x => x.id === r.id).active = false; saveRoutines(all); }
  });
}, 20000);

/* ───────── TAREFAS ───────── */
function getTasks() {
  const saved = store.get('tasks', null);
  if (saved) return saved.map(t => ({ ...t, text: cleanTxt(t.text) || t.text }));
  return [{ text: 'Testar a Rotina da manhã 08:00 (executar agora)', done: false, ts: Date.now() }];
}
function renderTasks() {
  const box = $('#taskList'); box.innerHTML = '';
  getTasks().forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'task' + (t.done ? ' done' : '');
    d.innerHTML = `<div class="task-top"><input type="checkbox" ${t.done ? 'checked' : ''} data-c="${i}"><b style="font-size:13px">${escapeHtml(t.text)}</b></div>
      <div class="actions btnrow" style="margin-top:7px"><button class="iconbtn" data-ai="${i}">${ic('sparkles')}executar com IA</button><button class="iconbtn ghost" data-edit="${i}" title="Editar tarefa">${ic('pencil')}</button><button class="iconbtn danger" data-del="${i}">${ic('trash-2')}</button></div>`;
    box.appendChild(d);
  });
  $$('#taskList [data-c]').forEach(c => c.onchange = () => { const t = getTasks(); t[+c.dataset.c].done = c.checked; store.set('tasks', t); renderTasks(); });
  $$('#taskList [data-del]').forEach(b => b.onclick = () => { const t = getTasks(); t.splice(+b.dataset.del, 1); store.set('tasks', t); renderTasks(); });
  $$('#taskList [data-ai]').forEach(b => b.onclick = () => {
    const t = getTasks()[+b.dataset.ai];
    $('#input').value = 'Execute esta tarefa passo a passo: ' + t.text; $('#composer').requestSubmit();
  });
  $$('#taskList [data-edit]').forEach(b => b.onclick = () => {
    const i = +b.dataset.edit;
    const card = b.closest('.task');
    const label = card && card.querySelector('b');
    if (!label || card.querySelector('.task-edit')) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'task-edit'; inp.value = getTasks()[i].text;
    label.replaceWith(inp);
    inp.focus(); inp.select();
    let closed = false;
    const save = () => {
      if (closed) return; closed = true;
      const v = inp.value.trim();
      const t = getTasks();
      if (v && t[i] && v !== t[i].text) { t[i].text = v.slice(0, 200); store.set('tasks', t); log('Tarefa editada: ' + v.slice(0, 80), 'info'); }
      renderTasks();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { closed = true; renderTasks(); } };
    inp.onblur = save;
  });
  icons();
}
$('#taskForm').onsubmit = e => {
  e.preventDefault();
  const v = $('#tText').value.trim(); if (!v) return;
  createTask(v);
  $('#tText').value = '';
};
function createTask(text) {
  const v = String(text || '').trim().slice(0, 200);
  if (!v) return null;
  const t = getTasks(); t.unshift({ text: v, done: false, ts: Date.now() });
  store.set('tasks', t); renderTasks();
  try { switchTab('tasks'); } catch {}
  try { toast('list-checks', `Tarefa criada: <b>${escapeHtml(v.slice(0, 60))}</b>`); } catch {}
  log('Tarefa criada: ' + v.slice(0, 80), 'ok');
  return t[0];
}
$('#btnNewTask').onclick = () => $('#tText').focus();

/* ───────── NOTAS ───────── */
function getNotes() {
  const saved = store.get('notes', null);
  if (saved && Array.isArray(saved)) return saved.filter(n => n && typeof n.text === 'string');
  return [];
}
function saveNotes(n) { store.set('notes', n); renderNotes(); }
function createNote(title, text, src) {
  const t = String(title || '').trim().slice(0, 120);
  const v = String(text || '').trim().slice(0, 8000);
  if (!t && !v) return null;
  const n = { id: 'n' + Date.now(), title: t || v.slice(0, 40), text: v, ts: Date.now(), src: src === 'manual' ? 'manual' : src ? 'agent' : '' };
  const all = getNotes(); all.unshift(n); saveNotes(all);
  try { toast('sticky-note', `Nota criada: <b>${escapeHtml(n.title.slice(0, 50))}</b>`); } catch {}
  log('Nota criada: ' + n.title.slice(0, 80), 'ok');
  return n;
}
function renderNotes() {
  const box = $('#noteList'); if (!box) return;
  box.innerHTML = '';
  const all = getNotes();
  if (!all.length) { box.innerHTML = '<p class="hint">Nenhuma nota ainda. Crie uma manualmente ou peça no chat: "crie uma nota sobre…".</p>'; return; }
  all.forEach((n, i) => {
    const d = document.createElement('div');
    d.className = 'task';
    d.innerHTML = `<div class="task-top"><b style="font-size:13px">${escapeHtml(n.title)}</b><span class="src" style="margin-left:auto;flex-shrink:0">${new Date(n.ts).toLocaleDateString('pt-BR')}</span></div>
      <div style="font-size:12px;color:var(--muted);margin-top:5px;white-space:pre-wrap;word-break:break-word">${escapeHtml((n.text || '').slice(0, 260))}${n.text && n.text.length > 260 ? '…' : ''}</div>
      <div class="actions btnrow" style="margin-top:8px"><button class="iconbtn" data-nedit="${i}">${ic('pencil')}editar</button><button class="iconbtn danger" data-ndel="${i}">${ic('trash-2')}</button></div>`;
    box.appendChild(d);
    d.onclick = e => {
      if (e.target.closest('button')) return;
      openNoteModal(getNotes().find(x => x.id === n.id));
    };
  });
  $$('#noteList [data-nedit]').forEach(b => b.onclick = e => { e.stopPropagation(); noteFormOpen(getNotes()[+b.dataset.nedit]); });
  $$('#noteList [data-ndel]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const all = getNotes(); const n = all[+b.dataset.ndel];
    if (!n) return;
    if (!(await uiConfirm('Excluir nota', `Remover "${n.title}"?`, 'Excluir'))) return;
    all.splice(+b.dataset.ndel, 1); saveNotes(all);
    toast('trash-2', 'Nota excluída.'); log('Nota excluída: ' + n.title.slice(0, 80), 'info');
  });
  icons();
}
let editingNoteId = null;
function openNoteModal(n) {
  if (!n) return;
  $('#noteModalTitle').textContent = n.title || 'Nota';
  $('#noteModalBody').textContent = n.text || '';
  const d = new Date(n.ts || Date.now());
  const quando = `Criada em ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const origem = n.src === 'manual' ? 'Manual' : n.src === 'agent' ? 'Agente' : '—';
  $('#noteModalMeta').textContent = `${quando} · ${origem}`;
  $('#noteModal').hidden = false;
  icons();
}
$('#noteModalClose').onclick = () => { $('#noteModal').hidden = true; };
$('#noteModal').addEventListener('click', e => { if (e.target === e.currentTarget) $('#noteModal').hidden = true; });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const m = $('#noteModal'); if (m && !m.hidden) m.hidden = true; }
});
function noteFormOpen(n = null) {
  $('#noteForm').hidden = false;
  $('#noteFormTitle').textContent = n ? 'Editar nota' : 'Nova nota';
  editingNoteId = n ? n.id : null;
  $('#nTitle').value = n?.title || ''; $('#nText').value = n?.text || '';
  $('#nTitle').focus();
  try { switchTab('notes'); } catch {}
}
$('#btnNewNote').onclick = () => noteFormOpen(null);
$('#btnCancelNote').onclick = () => { $('#noteForm').hidden = true; editingNoteId = null; };
$('#noteForm').onsubmit = e => {
  e.preventDefault();
  const title = $('#nTitle').value.trim(), text = $('#nText').value.trim();
  if (!title && !text) return;
  const all = getNotes();
  if (editingNoteId) {
    const n = all.find(x => x.id === editingNoteId);
    if (n) { n.title = title || text.slice(0, 40); n.text = text.slice(0, 8000); }
    log('Nota editada: ' + (title || text.slice(0, 40)), 'ok');
  } else {
    all.unshift({ id: 'n' + Date.now(), title: title || text.slice(0, 40), text: text.slice(0, 8000), ts: Date.now(), src: 'manual' });
    log('Nota criada: ' + (title || text.slice(0, 40)), 'ok');
  }
  saveNotes(all);
  $('#noteForm').hidden = true; editingNoteId = null;
  $('#nTitle').value = ''; $('#nText').value = '';
  toast('sticky-note', 'Nota salva.');
};

/* ───────── MODELOS DA API (via chave) ───────── */
async function listModels(p, key) {
  if (p === 'groq' || p === 'openai') {
    const r = await fetch(PROVIDERS[p].url.replace('/chat/completions', '/models'), { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — confira a chave');
    return ((await r.json()).data || []).map(m => m.id).filter(Boolean).sort();
  }
  if (p === 'openrouter') {
    const r = await fetch('https://openrouter.ai/api/v1/models');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return ((await r.json()).data || []).map(m => m.id).filter(Boolean).sort();
  }
  if (p === 'gemini') {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key));
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — confira a chave');
    return (((await r.json()).models) || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, '')).sort();
  }
  if (p === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — confira a chave');
    return ((await r.json()).data || []).map(m => m.id).filter(Boolean).sort();
  }
  if (p === 'ollama') {
    const base = ($('#baseUrl').value.trim() || 'http://localhost:11434').replace(/\/$/, '');
    const r = await fetch(base + '/api/tags');
    if (!r.ok) throw new Error('Ollama fora do ar — rode `ollama serve`');
    return (((await r.json()).models) || []).map(m => m.name).filter(Boolean).sort();
  }
  if (p === 'lmstudio') {
    // OpenAI-compatível local: GET {base}/models → { data: [{id}] }
    let base = ((typeof document !== 'undefined' && $('#baseUrl')?.value?.trim()) || 'http://localhost:1234/v1').replace(/\/$/, '');
    base = base.replace(/\/chat\/completions$/, '');
    const r = await fetch(base + '/models');
    if (!r.ok) throw new Error('LM Studio fora do ar — ative o servidor local em http://localhost:1234 (Server tab → Start Server)');
    return (((await r.json()).data) || []).map(m => m.id).filter(Boolean).sort();
  }
  return [];
}
async function fetchModels(auto = false) {
  const p = $('#provider').value || cfg.provider;
  const key = ($('#apiKey').value.trim() || keys[p] || '');
  if (p !== 'ollama' && p !== 'lmstudio' && !key) { if (!auto) toast('key-round', 'Informe a API key antes de buscar modelos.'); return; }
  coreBusy('Buscando modelos', PROVIDERS[p].label);
  const win = coreWindow({ icon: 'refresh-cw', title: 'Modelos disponíveis', body: `Consultando <b>${escapeHtml(PROVIDERS[p].label)}</b> com sua chave…` });
  try {
    const models = await listModels(p, key);
    if (!models.length) throw new Error('nenhum modelo retornado');
    const saved = store.get('customModels', {}); saved[p] = models; store.set('customModels', saved);
    if (!models.includes(cfg.model)) { cfg.model = models[0]; store.set('cfg', cfg); }
    refreshModels(); updateConn();
    coreWinDone(win, models.length + ' modelos encontrados — selecione no campo Modelo ou junto ao chat.');
    toast('check', `<b>${models.length}</b> modelos carregados. Escolha o seu.`);
    log(`Modelos ${p}: ${models.length} (${models.slice(0, 3).join(', ')}…)`, 'ok');
  } catch (e) {
    coreWinDone(win, 'Falha: ' + String(e.message || e).slice(0, 140), 'warn');
    if (!auto) toast('x', 'Falha ao listar modelos: ' + escapeHtml(e.message));
    log('Falha listar modelos: ' + e.message, 'warn');
  }
  coreIdle();
}
$('#btnModels').onclick = () => { saveCfg(true); fetchModels(false); };
$('#btnModelsQuick').onclick = () => { saveCfg(true); fetchModels(false); };

/* ───────── PLANO DE FUNDO (seleção + desfoque) ───────── */
function getBg() { return Object.assign({ mode: 'combo', blur: 6, custom: '', preset: '' }, store.get('bg', {})); }
function applyBackground() {
  const bg = getBg();
  const show3d = bg.mode === 'combo' || bg.mode === '3d';
  const showAur = bg.mode === 'combo' || bg.mode === 'aurora';
  const showCus = (bg.mode === 'custom' && !!bg.custom) || bg.mode === 'preset';
  const showVid = bg.mode === 'video' && !!bg.preset;
  const cv = $('#bg3d'), au = $('#aurora'), cu = $('#bgCustom');
  if (cv) cv.style.display = show3d ? 'block' : 'none';
  window.__bg3dEnabled = show3d;
  if (au) au.style.display = showAur ? 'block' : 'none';
  if (cu) { cu.style.display = showCus ? 'block' : 'none'; if (showCus) cu.style.backgroundImage = `url("${bg.mode === 'preset' ? bg.preset : bg.custom}")`; }
  const vv = $('#bgVideo');
  if (vv) {
    vv.style.display = showVid ? 'block' : 'none';
    if (showVid) { if (vv.dataset.src !== bg.preset) { vv.dataset.src = bg.preset; vv.src = bg.preset; } vv.play().catch(() => {}); }
    else { try { vv.pause(); } catch {} }
  }
  [cv, au, cu, vv].forEach(el => {
    if (!el) return;
    el.style.filter = bg.blur > 0 ? `blur(${bg.blur}px) saturate(1.15)` : '';
    el.style.transform = bg.blur > 0 ? 'scale(1.06)' : '';
  });
  const bv = $('#bgBlurVal'); if (bv) bv.textContent = (bg.blur || 0) + 'px';
  const sel = $('#bgSelect'); if (sel && sel.value !== bg.mode) sel.value = bg.mode;
  const bb = $('#bgBlur'); if (bb && +bb.value !== bg.blur) bb.value = bg.blur;
  if ($('#bgUploadWrap')) $('#bgUploadWrap').hidden = bg.mode !== 'custom';
}
$('#bgSelect').onchange = () => { const bg = getBg(); bg.mode = $('#bgSelect').value; store.set('bg', bg); applyBackground(); };
$('#bgBlur').oninput = () => { const bg = getBg(); bg.blur = +$('#bgBlur').value; store.set('bg', bg); applyBackground(); };
$('#bgUpload').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const sc = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    try {
      const bg = getBg(); bg.custom = c.toDataURL('image/jpeg', 0.82); bg.mode = 'custom';
      store.set('bg', bg); applyBackground(); toast('image', 'Plano de fundo atualizado.');
    } catch { toast('x', 'Imagem grande demais para salvar localmente.'); }
  };
  img.src = URL.createObjectURL(f);
};
$('#fxIntensity').addEventListener('input', e => { const v = $('#fxVal'); if (v) v.textContent = e.target.value + '%'; });
(function initBg() {
  const bg = getBg();
  if ($('#bgSelect')) $('#bgSelect').value = bg.mode;
  if ($('#bgBlur')) $('#bgBlur').value = bg.blur;
  applyBackground();
})();

/* ───────── PRESENÇA DO NÚCLEO (ocioso · pensando · processando · dormindo) ───────── */
let mood = 'idle';
let lastActivity = Date.now();
addEventListener('pointerdown', () => { lastActivity = Date.now(); if (mood === 'sleeping') setMood('idle'); }, { passive: true });
addEventListener('keydown', () => { lastActivity = Date.now(); if (mood === 'sleeping') setMood('idle'); });
const MOOD_LABEL = { idle: 'ocioso', thinking: 'pensando', processing: 'processando', sleeping: 'dormindo' };
function setMood(m) {
  if (mood === m) return;
  mood = m;
  const el = $('#moodLabel');
  if (el) el.textContent = MOOD_LABEL[m] || m;
  const dot = $('#cmDot');
  if (dot) dot.dataset.mood = m;
}
setInterval(() => {
  if (busyCount > 0) return;
  if ((document.hidden || Date.now() - lastActivity > 90000) && mood !== 'sleeping') setMood('sleeping');
  else if (mood === 'sleeping' && !document.hidden && Date.now() - lastActivity < 90000) setMood('idle');
}, 5000);

/* ───────── PRESETS DE FUNDO ───────── */
const BG_PRESETS = [
  { id: 'p1', kind: 'image', label: 'Neblina', src: 'https://picsum.photos/seed/myos-fog/1920/1080', thumb: 'https://picsum.photos/seed/myos-fog/320/200' },
  { id: 'p2', kind: 'image', label: 'Montanhas', src: 'https://picsum.photos/seed/myos-peak/1920/1080', thumb: 'https://picsum.photos/seed/myos-peak/320/200' },
  { id: 'p3', kind: 'image', label: 'Oceano', src: 'https://picsum.photos/seed/myos-sea/1920/1080', thumb: 'https://picsum.photos/seed/myos-sea/320/200' },
  { id: 'p4', kind: 'image', label: 'Cidade', src: 'https://picsum.photos/seed/myos-city/1920/1080', thumb: 'https://picsum.photos/seed/myos-city/320/200' },
  { id: 'v1', kind: 'video', label: 'Vídeo 1', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4' },
  { id: 'v2', kind: 'video', label: 'Vídeo 2', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' }
];
function renderPresets() {
  const box = $('#bgPresets');
  if (!box) return;
  const bg = getBg();
  box.innerHTML = '';
  BG_PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset' + (((bg.mode === 'preset' || bg.mode === 'video') && bg.preset === p.src) ? ' on' : '');
    b.title = p.label + (p.kind === 'video' ? ' (vídeo)' : '');
    b.innerHTML = (p.kind === 'image' ? `<img loading="lazy" src="${p.thumb}" alt="${escapeHtml(p.label)}">` : ic('film')) + `<span>${escapeHtml(p.label)}</span>`;
    b.onclick = () => {
      const g = getBg();
      g.mode = p.kind === 'video' ? 'video' : 'preset';
      g.preset = p.src;
      store.set('bg', g); applyBackground(); renderPresets();
      toast('image', `Fundo <b>${escapeHtml(p.label)}</b> aplicado.`);
    };
    box.appendChild(b);
  });
  icons();
}

/* ───────── VOZ ───────── */
function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR'; u.rate = 1.02;
    const vs = speechSynthesis.getVoices();
    const v = vs.find(v => /pt[-_]BR/i.test(v.lang)) || vs.find(v => /^pt/i.test(v.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch {}
}

/* ───────── LEMBRETES ───────── */
function getReminders() { return store.get('reminders', []); }
function saveReminders(r) { store.set('reminders', r); renderReminders(); }
function addReminder(text, time, repeat = 'once') {
  const all = getReminders();
  const r = { id: 'm' + Date.now(), text: cleanTxt(text) || text, time, repeat, done: false, firedDay: '' };
  all.push(r); saveReminders(all);
  askNotify()
  return r;
}
function renderReminders() {
  const box = $('#reminderList');
  if (!box) return;
  box.innerHTML = '';
  const rs = getReminders();
  if (!rs.length) box.innerHTML = '<p class="hint">Nenhum lembrete. Crie pelo botão acima ou peça no chat.</p>';
  [...rs].reverse().forEach(r => {
    const d = document.createElement('div');
    d.className = 'routine' + (r.done && r.repeat === 'once' ? ' done' : '');
    d.innerHTML = `<div class="routine-top"><span class="time-badge">${ic('bell')} ${escapeHtml(r.time)}</span><b>${escapeHtml(r.text)}</b></div>
      <div class="meta">${r.repeat === 'daily' ? 'Todo dia' : 'Uma vez'}</div>
      <div class="actions"><button class="iconbtn danger" data-del="${r.id}">${ic('trash-2')}</button></div>`;
    box.appendChild(d);
  });
  $$('#reminderList [data-del]').forEach(b => b.onclick = async () => { if (await uiConfirm('Excluir lembrete', 'Remover este lembrete?', 'Excluir')) saveReminders(getReminders().filter(x => x.id !== b.dataset.del)); });
  icons();
}
function fireReminder(r) {
  addHtml('ai', `<b>Lembrete</b> · ${escapeHtml(r.time)}<br>${escapeHtml(r.text)}`);
  history.push({ role: 'assistant', content: 'Lembrete: ' + r.text });
  persist();
  toast('bell', `<b>Lembrete</b> · ${escapeHtml(r.text)}`);
  log('Lembrete disparado: ' + r.text, 'ok');
  coreWindow({ icon: 'bell', title: 'Lembrete', body: `<b>${escapeHtml(r.text)}</b> · ${escapeHtml(r.time)}` });
  try { new Notification('My OS · Lembrete', { body: r.text }); } catch {}
  speak(r.text);
  const all = getReminders(); const ix = all.findIndex(x => x.id === r.id);
  if (ix >= 0) {
    all[ix].firedDay = new Date().toDateString();
    if (all[ix].repeat === 'once') all[ix].done = true;
    saveReminders(all);
  }
}
setInterval(() => {
  const ro = $('#restOverlay');
  if (ro && !ro.hidden) return;
  const now = new Date();
  const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const today = now.toDateString();
  getReminders().forEach(r => {
    if (r.time !== hm || r.firedDay === today) return;
    if (r.repeat === 'once' && r.done) return;
    fireReminder(r);
  });
}, 15000);
$('#btnNewReminder').onclick = () => { $('#reminderForm').hidden = false; };
$('#btnCancelReminder').onclick = () => $('#reminderForm').hidden = true;
$('#reminderForm').onsubmit = e => {
  e.preventDefault();
  const t = $('#rmTime').value, txt = $('#rmText').value.trim();
  if (!t || !txt) return;
  addReminder(txt, t, $('#rmRepeat').value);
  $('#rmText').value = ''; $('#reminderForm').hidden = true;
  toast('bell', `Lembrete para <b>${t}</b> criado.`);
  log('Lembrete criado: ' + txt + ' @ ' + t, 'ok');
};

/* ───────── AUTOMAÇÃO LOCAL (funciona com qualquer LLM) ───────── */
function guessIcon(text) {
  const t = text.toLowerCase();
  if (/not[ií]cia|news|manchete/.test(t)) return 'newspaper';
  if (/rotina|acordar|manh[aã]|alarme/.test(t)) return 'alarm-clock';
  if (/v[ií]deo|youtube|assistir/.test(t)) return 'play';
  if (/m[uú]sica|som|playlist|tocar/.test(t)) return 'music';
  if (/abr(?:ir|a)|site|app|programa/.test(t)) return 'rocket';
  if (/resum/.test(t)) return 'file-text';
  if (/linux|terminal|script|backup/.test(t)) return 'terminal';
  if (/pesquis|buscar|web/.test(t)) return 'search';
  return 'sparkles';
}
function buildActionFromText(text) {
  const acts = [];
  const urlM = text.match(/https?:\/\/[^\s)]+/);
  const ytM = /youtube|youtu\.be|v[ií]deo|assistir/i.test(text);
  const musM = /m[uú]sica|playlist|tocar|lo-?fi/i.test(text);
  const newsM = text.match(/not[ií]cias?(?: de| sobre)? ([^.?!;]+)/i);
  const openM = text.match(/abr(?:ir|a)\s+(?:o\s+|a\s+)?([a-z0-9.-]+\.[a-z]{2,}[^\s]*)/i);
  if (urlM && ytM) acts.push('youtube: ' + urlM[0]);
  else if (urlM && musM) acts.push('musica: ' + urlM[0]);
  else if (urlM) acts.push('abrir: ' + urlM[0]);
  if (newsM) acts.push('noticias: ' + newsM[1].trim().slice(0, 60));
  else if (/not[ií]cias/.test(text)) acts.push('noticias: tecnologia');
  if (openM && !urlM) acts.push('abrir: https://' + openM[1]);
  if (!acts.length) acts.push('prompt: ' + text.slice(0, 300));
  return acts;
}
function slugify(s) {
  return cleanTxt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'skill-nova';
}
async function tryLocalAutomation(text) {
  const t = text.trim();
  // 0b) AGENTES + SKILLS — "@Nome tarefa" · "@equipe t1; t2" · "@slug-da-skill tarefa"
  const mag = t.match(/^@([\w-]+)(?:\s+([\s\S]+))?/);
  if (mag) {
    const mention = mag[1], rest = (mag[2] || '').trim();
    if (/^(equipe|time)$/i.test(mention) && rest) return await teamFlow(rest);
    const ag = agentByName(mention);
    if (ag) { await runAgent(ag, rest || ''); return true; }
    const sk = findSkillByMention(mention);
    if (sk) { await runSkillMention(sk, rest); return true; }
    const names = getAgents().map(a => '@' + a.name).join(' · ');
    const skNames = getSkills().filter(s => s.active).map(s => '@' + s.slug).slice(0, 10).join(' · ');
    addHtml('ai', `Não achei <b>@${escapeHtml(mention)}</b>.<br>Agentes: ${names || 'nenhum'}<br>Skills: ${skNames || 'nenhuma'}<br><span class="src">ou use <b>@equipe</b> para acionar o time</span>`);
    return true;
  }
  // 0a) ABRIR SITES/VÍDEOS — resposta garantida com card, nunca abre aba sozinho
  if (/(?:abre|abrir|vai\s+para|acessa(?:r)?|mostra)\b/i.test(t)) {
    const ytHit = await tryYouTubeFirst(t);
    if (ytHit) { persist(); return true; }
    const target = resolveSite(t);
    if (target) {
      try {
        coreBusy('Abrindo ' + target.name, target.url.slice(0, 80));
        openSiteFlow(target, target.key === 'youtube' ? 'skill youtube-player' : 'execução local');
        coreIdle();
      } catch (e) { try { coreIdle(); } catch {} }
      return true;
    }
  }
  // 0a2) MÚSICA local + streaming + controles (pausa/play/próxima/anterior)
  let mm = t.match(/^(pausa(?:r)?|pause|para\s+a\s+m[uú]sica|para\s+de\s+tocar)\s*[.!]*$/i);
  if (mm) {
    const now = window.MusicPlayer && MusicPlayer.now && MusicPlayer.now();
    try { document.querySelector('#musicAudio')?.pause(); } catch {}
    addHtml('ai', now ? `<b>Pausado:</b> ${escapeHtml(now.title)}<br><span class="src">player à esquerda · diga "continua" p/ retomar</span>` : 'Nada tocando agora.');
    history.push({ role: 'assistant', content: 'Música pausada' }); persist(); return true;
  }
  mm = t.match(/^(continua(?:r)?|retoma(?:r)?|resume|play)\s*[.!]*$/i);
  if (mm && /^(continua|retoma|resume|play)/i.test(t) && t.trim().split(/\s+/).length <= 2) {
    const MP = window.MusicPlayer;
    if (MP && MP.now && MP.now()) { MP.toggle(); const now = MP.now(); addHtml('ai', `<b>Tocando:</b> ${escapeHtml(now.title)}<br><span class="src">player à esquerda</span>`); }
    else { const locals = window.LocalMusic ? window.LocalMusic.list() : []; if (locals[0]) MP.playTrack(locals[0]); addHtml('ai', locals[0] ? `<b>Tocando:</b> ${escapeHtml(locals[0].title)}` : 'Fila vazia. Adicione arquivos à esquerda ou peça <code>toca lofi</code>.'); }
    history.push({ role: 'assistant', content: 'Música retomada' }); persist(); return true;
  }
  mm = t.match(/^(pr[oó]xima|next|pula(?:r)?)(?:\s+m[uú]sica)?\s*[.!]*$/i);
  if (mm) { const MP = window.MusicPlayer; MP && MP.next(); const now = MP && MP.now && MP.now(); addHtml('ai', now ? `<b>Próxima:</b> ${escapeHtml(now.title)}` : 'Fila vazia.'); history.push({ role: 'assistant', content: 'Próxima música' }); persist(); return true; }
  mm = t.match(/^(anterior|volta(?:r)?|prev)(?:\s+m[uú]sica)?\s*[.!]*$/i);
  if (mm) { const MP = window.MusicPlayer; MP && MP.prev(); const now = MP && MP.now && MP.now(); addHtml('ai', now ? `<b>Anterior:</b> ${escapeHtml(now.title)}` : 'Fila vazia.'); history.push({ role: 'assistant', content: 'Música anterior' }); persist(); return true; }
  mm = t.match(/(?:que|qual)(?:\s+m[uú]sica)?\s+(?:est[aá]|t[aá])\s+tocando|o\s+que\s+(?:est[aá]|t[aá])\s+tocando/i);
  if (mm) {
    const now = window.MusicPlayer && MusicPlayer.now && MusicPlayer.now();
    const playing = window.MusicPlayer && MusicPlayer.isPlaying && MusicPlayer.isPlaying();
    addHtml('ai', now ? `<b>${playing ? 'Tocando agora' : 'Pausado em'}:</b> ${escapeHtml(now.title)}<br><small>${escapeHtml(now.artist || '')} · ${escapeHtml(now.source || '')}</small><span class="src">player à esquerda</span>` : 'Nada tocando. Adicione arquivos à esquerda ou peça <code>toca lofi</code>.');
    persist(); return true;
  }
  mm = t.match(/(?:lista(?:r|e)?|mostra(?:r)?|ver)\s+(?:minhas?\s+)?m[uú]sicas|(?:minha\s+)?biblioteca(?:\s+de\s+m[uú]sicas?)?/i);
  if (mm && /music|biblioteca|lista/i.test(t) && t.length < 80) {
    const locals = window.LocalMusic ? window.LocalMusic.list() : [];
    addHtml('ai', locals.length ? `<b>Sua biblioteca (${locals.length}):</b><br>` + locals.slice(0, 10).map((x, i) => `${i + 1}. <b>${escapeHtml(x.title)}</b>`).join('<br>') + `<br><span class="src">peça "toca &lt;nome&gt;" · player à esquerda</span>` : 'Biblioteca vazia. Use <b>+ arquivos</b> ou <b>pasta</b> no player à esquerda.');
    persist(); return true;
  }
  mm = t.match(/(?:baix(?:a|e|ar)|download|faz(?:er)?\s+download(?: de)?)\s+(?:de\s+|da\s+)?(?:m[uú]sica\s+)?([^.?!\n]{2,60})/i);
  if (mm && /baix|download/i.test(t) && /m[uú]sic|som|mp3|lofi|jazz|samba|rock|piano/i.test(t)) {
    await musicSearchDownload(mm[1].trim(), 'chat');
    persist(); return true;
  }
  mm = t.match(/(?:toca(?:r)?|toque|coloca(?:r)?|quero\s+ouvir|ouvir|play)\s+(?:essa\s+|esta\s+|a\s+|uma\s+)?(?:m[uú]sica\s+)?([^.?!\n]{2,60})/i);
  if (mm && /toca|toque|coloca|ouvir|play|m[uú]sica/i.test(t) && !/youtube|v[ií]deo/i.test(t)) {
    const q = (mm[1] || '').replace(/\s*(pra|para)\s*mim\s*$/i, '').trim() || 'lofi';
    if (!/^(pra|para)\s*mim\s*$/i.test(q)) { await musicSearchPlay(q, 'chat'); persist(); return true; }
  }
  // 0a2c) CONSULTA DE TAREFAS — "tenho alguma tarefa?" · "o que tá pendente?" (sem LLM)
  mm = t.match(/(tenho|tem|existe|há|lista|mostra|quais|o que).{0,40}tarefa|tarefas?\s+(pendentes?|a fazer|em aberto)|o que\s+(tá|está)\s+pendente|alguma\s+coisa\s+(pendente|pra fazer|para fazer)/i);
  if (mm && /tarefa|pendente|pra fazer|para fazer|a fazer/i.test(t) && !/cria|adiciona|nova/i.test(t)) {
    const all = getTasks();
    const pend = all.filter(x => !x.done);
    try { switchTab('tasks'); } catch {}
    if (!all.length) addHtml('ai', 'Você não tem <b>nenhuma tarefa</b> salva. Quer que eu crie uma?');
    else if (!pend.length) addHtml('ai', `Tudo em dia ✅ — <b>${all.length}</b> tarefa(s), nenhuma pendente.`);
    else addHtml('ai', `<b>Você tem ${pend.length} pendente(s):</b><br>` + pend.slice(0, 10).map((x, i) => `${i + 1}. <b>${escapeHtml(x.text)}</b>`).join('<br>') + `<br><span class="src">aba Tarefas · diga o número p/ executar ou concluir</span>`);
    history.push({ role: 'assistant', content: pend.length ? `Pendentes (${pend.length}): ${pend.map(x => x.text).join(' | ')}` : 'Nenhuma tarefa pendente' });
    log(`Consulta tarefas: ${pend.length} pendente(s)`, 'info');
    persist(); return true;
  }
  // 0a3) TAREFA — "crie uma tarefa ..." · "adiciona tarefa ..." (funciona sem LLM)
  mm = t.match(/(?:crie|cria|criar|adiciona(?:r)?|adicione|nova?)\s+(?:uma\s+)?tarefa\s*(?:de\s+|para\s+|com\s+o?\s*(?:texto|título)?\s*)?[:\-]?\s*([^.?!\n]{2,200})/i);
  if (mm && /tarefa/i.test(t)) {
    const txt = (mm[1] || '').trim();
    if (txt && !/^(pra|para)\s*mim\s*$/.test(txt)) {
      createTask(txt);
      addHtml('ai', `<b>Tarefa criada:</b> ${escapeHtml(txt)}<br><span class="src">aba Tarefas · execução local</span>`);
      history.push({ role: 'assistant', content: 'Tarefa criada: ' + txt });
      persist(); return true;
    }
  }
  // 0a3b) NOTA — "crie uma nota ..." · "anote ..." (sem LLM, só pedidos curtos)
  if (t.length < 120 && /nota/i.test(t) && !/edit|atualiz|delet|apag|remov|lista|mostra|tem\b/i.test(t)) {
    mm = t.match(/(?:crie|cria|criar|anote|anotar|salve|salvar|adiciona(?:r)?|adicione)\s+(?:uma\s+)?nota\s*(?:de\s+|com\s+|sobre\s+|que\s+|dizendo\s+|para\s+)?[:\-]?\s*([^.?!\n]{2,110})/i);
    if (mm && (mm[1] || '').trim()) {
      const n = createNote('', mm[1].trim(), 'agent');
      addHtml('ai', `<b>Nota criada:</b> ${escapeHtml(n.title)}<br><span class="src">aba Notas · execução local · peça "editar nota" p/ mudar</span>`);
      history.push({ role: 'assistant', content: 'Nota criada: ' + n.title });
      persist(); return true;
    }
  }
  // 0a3c) DELETAR NOTA — "apague a nota X" (sem LLM; se não achar, cai no agente p/ tool)
  if (t.length < 120 && /nota/i.test(t) && /(delet|apag|remov|exclu)/i.test(t) && !/cri|anote/i.test(t)) {
    mm = t.match(/(?:delet(?:e|ar)|apag(?:ue|ar)|remov(?:a|er)|exclu(?:a|ir))\s+(?:a\s+)?nota\s*(?:sobre\s+|de\s+|com\s+|chamada\s+|que\s+|minha\s+)?["“]?([^"”.\n!]{2,80})/i);
    if (mm) {
      const q = mm[1].trim().toLowerCase().replace(/["“”]+$/, '').trim();
      const all = getNotes();
      let ix = all.findIndex(x => (x.title + ' ' + x.text).toLowerCase().includes(q));
      if (ix < 0 && /^\d+$/.test(q)) ix = +q - 1;
      if (ix >= 0 && all[ix]) {
        const rm = all.splice(ix, 1)[0];
        saveNotes(all);
        try { switchTab('notes'); } catch {}
        addHtml('ai', `<b>Nota deletada:</b> ${escapeHtml(rm.title)}<br><span class="src">aba Notas · execução local (sem API)</span>`);
        history.push({ role: 'assistant', content: 'Nota deletada: ' + rm.title });
        log('Nota deletada (local): ' + rm.title.slice(0, 80), 'ok');
        persist(); return true;
      }
    }
  }
  // 0a3d) EDITAR NOTA — "edite a nota X para: novo texto" (sem LLM)
  if (t.length < 300 && /nota/i.test(t) && /(edit|atualiz|mudar|alter)/i.test(t) && !/delet|apag|remov|exclu|cri|anote/i.test(t)) {
    mm = t.match(/(?:edite|editar|atualiz(?:e|ar)|mude|altere)\s+(?:a\s+)?nota\s*(?:sobre\s+|de\s+|com\s+|chamada\s+|que\s+)?["“]?([^"”.:\n]{2,60})["”]?\s*(?:para|:|com)\s+([^.!\n]{2,400})/i);
    if (mm) {
      const q = mm[1].trim().toLowerCase(); const novo = mm[2].trim();
      const all = getNotes();
      let n = all.find(x => (x.title + ' ' + x.text).toLowerCase().includes(q));
      if (!n && /^\d+$/.test(q)) n = all[+q - 1];
      if (n && novo) {
        n.text = novo.slice(0, 8000);
        saveNotes(all);
        try { switchTab('notes'); } catch {}
        addHtml('ai', `<b>Nota editada:</b> ${escapeHtml(n.title)}<br><span class="src">aba Notas · execução local (sem API)</span>`);
        history.push({ role: 'assistant', content: 'Nota editada: ' + n.title });
        log('Nota editada (local): ' + n.title.slice(0, 80), 'ok');
        persist(); return true;
      }
    }
  }
  // 0a3e) CONSULTA DE NOTAS — "minhas notas?" · "lista notas" (sem LLM)
  if (t.length < 100 && /nota/i.test(t) && /(minhas?|tem|alguma|lista|mostra|quais|o que)/i.test(t) && !/cri|anote|edit|delet|apag|remov/i.test(t)) {
    const all = getNotes();
    try { switchTab('notes'); } catch {}
    if (!all.length) addHtml('ai', 'Você não tem <b>nenhuma nota</b> salva. Quer que eu crie uma?');
    else addHtml('ai', `<b>Suas notas (${all.length}):</b><br>` + all.slice(0, 10).map((x, i) => `${i + 1}. <b>${escapeHtml(x.title)}</b> — ${escapeHtml((x.text || '').slice(0, 80))}`).join('<br>') + `<br><span class="src">aba Notas · "apague a nota X" ou "edite a nota X para…"</span>`);
    history.push({ role: 'assistant', content: all.length ? `Notas (${all.length}): ${all.map(x => x.title).join(' | ')}` : 'Nenhuma nota' });
    log('Consulta notas: ' + all.length + ' salva(s)', 'info');
    persist(); return true;
  }
  // 1) LEMBRETE — "me lembre às 14:30 de X" · "lembrete 14:30 X" · "às 14:30 me avise X"
  let m = t.match(/(?:me\s+)?lembr(?:e|ar|a-me|a)[\s\wà-ú,]*?(\d{1,2}:\d{2})\s*(?:de|para|que|:)?\s*(.+)?/i)
    || t.match(/lembrete\s+(\d{1,2}:\d{2})\s+(.+)/i)
    || t.match(/(?:[àa]s?\s*)(\d{1,2}:\d{2})\s*(?:me\s+)?(?:avise|lembre)(?:[:\s]+(.+))?/i);
  if (m) {
    let hh = m[1].split(':'); const time = String(hh[0]).padStart(2, '0') + ':' + hh[1];
    const what = (m[2] || 'aviso').trim();
    addReminder(what, time, 'once');
    switchTab('reminders');
    addHtml('ai', `<b>Lembrete criado</b> para <b>${time}</b>: ${escapeHtml(what)}<br><span class="src">execução local · funciona com qualquer modelo</span>`);
    history.push({ role: 'assistant', content: `Lembrete criado: ${what} às ${time}` });
    toast('bell', `Lembrete <b>${time}</b> salvo.`);
    log('Lembrete via chat: ' + what + ' @ ' + time, 'ok');
    return true;
  }
  // 2) CRIAR SKILL — "crie uma skill que ..."
  m = t.match(/cria?(?:r|e)?\s+(?:uma\s+)?skill\s+(?:que|para|de)\s+(.+)/i);
  if (m) {
    const desc = m[1].trim();
    const slug = slugify(desc.split(/\s+/).slice(0, 5).join('-'));
    const acts = buildActionFromText(desc);
    const s = { slug, icon: guessIcon(desc), title: desc.slice(0, 48), desc,
      prompt: `Você executa a seguinte tarefa do usuário: ${desc}. Responda sempre em português, de forma direta e completa.`,
      action: acts.join('\n'), active: true };
    const all = getSkills();
    const ix = all.findIndex(x => x.slug === slug);
    if (ix >= 0) all[ix] = s; else all.push(s);
    saveSkills(all); switchTab('skills');
    addHtml('ai', `<b>Skill criada</b>: ${escapeHtml(s.title)}<br>Ações: <code>${escapeHtml(acts.join(' · '))}</code><br><span class="src">salva no app · qualquer modelo consegue executá-la</span>`);
    history.push({ role: 'assistant', content: 'Skill criada: ' + s.slug });
    coreWindow({ icon: s.icon, title: 'Nova skill', body: `<b>${escapeHtml(s.title)}</b> pronta para uso.` });
    log('Skill via chat: ' + s.slug, 'ok');
    return true;
  }
  // 3) CRIAR ROTINA — "crie uma rotina às 08:00 que ..."
  m = t.match(/cria?(?:r|e)?\s+(?:uma\s+)?rotina\s+(?:para\s+)?(?:[àa]s\s+)?(\d{1,2}:\d{2})?\s*(?:que\s+)?(.+)?/i);
  if (m && (m[1] || /rotina/i.test(t))) {
    openRoutineForm(m[1] || '08:00', null);
    if (m[2]) $('#rActions').value = buildActionFromText(m[2]).join('\n');
    if (m[2]) $('#rName').value = m[2].slice(0, 48);
    switchTab('routines');
    addHtml('ai', `Abri o criador de rotina <b>${m[1] || '08:00'}</b> com ações sugeridas. Confira e salve.`);
    return true;
  }
  // 0) MEMÓRIA — "lembra da nossa conversa sobre astronauta?"
  if (/lembra|conversa|falamos|mem[oó]ria|discutimos|retom/i.test(t) && t.length > 10 && !/lembrete|\d{1,2}:\d{2}/.test(t)) {
    const found = findConv(t);
    if (found && found.id !== store.get('activeConv', null)) {
      loadConv(found.id);
      neuralFire('memory', found.id);
      addHtml('ai', `Encontrei nossa conversa <b>${escapeHtml(found.title)}</b> e carreguei o contexto (${found.messages.length} mensagens). Pode continuar de onde paramos.`);
      history.push({ role: 'assistant', content: 'Retomei a conversa: ' + found.title });
      persist();
      return true;
    }
    if (found) {
      addHtml('ai', `Já estamos nessa conversa (<b>${escapeHtml(found.title)}</b>), com todo o contexto carregado.`);
      return true;
    }
    const all = getConvs().filter(c => c.messages.length);
    if (all.length && /conversa/i.test(t)) {
      addHtml('ai', `Não achei nada com esses termos. Conversas salvas: ${all.map(c => `<b>${escapeHtml(c.title)}</b>`).join(' · ')}. É só clicar em uma na barra lateral.`);
      return true;
    }
  }
  // 3b) ARQUIVO — "salve isso em um arquivo" · "crie um arquivo chamado X com ..."
  m = t.match(/salve\s+(?:isso|isto|esta|essa(?: mensagem)?)\s+(?:em\s+)?(?:um\s+)?arquivo(?:\s+(?:chamado|com\s+o\s+nome)\s+([a-z0-9_.-]+\.\w+))?/i);
  if (m) {
    const last = [...history].reverse().find(x => x.role === 'assistant');
    if (!last) { addMsg('ai', 'Ainda não há conteúdo para salvar. Peça algo primeiro.'); return true; }
    const name = m[1] || ('myos-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.md');
    return await saveFileFlow(name, last.content, 'Conteúdo da conversa');
  }
  m = t.match(/cria?(?:r|e)?\s+(?:um\s+)?arquivo\s+(.+)/is);
  if (m && /arquivo/i.test(t)) {
    const rest = m[1].trim();
    const fn = (rest.match(/([a-z0-9_.\-/]+\.(txt|md|json|js|html|css|csv|py|sh|yml|xml|ts|jsx|tsx))/i) || [])[1];
    const cm = rest.match(/com\s+(?:o\s+)?(?:conte[uú]do|texto)\s*[:\-]?\s*([\s\S]+)/i);
    // Código/projeto (pasta ou extensão de código) → Coding Agent (workspace + permissões + undo)
    if (fn && (/\/./.test(fn) || /\.(js|json|html|css|py|sh|yml|xml|ts|jsx|tsx)$/i.test(fn))) {
      const content = cm ? cm[1].trim() : null;
      if (!content) {
        addHtml('ai', `Entendi: <code>${escapeHtml(fn)}</code>. Me diga o <b>conteúdo</b> assim: <code>crie o arquivo ${escapeHtml(fn)} com o conteúdo: ...</code><br><span class="src">coding agent · workspace + undo</span>`);
        return true;
      }
      try {
        const root = await getWorkDir(true);
        if (!root) return await saveFileFlow(fn.replace(/\//g, '_'), content, 'Arquivo criado');
        coreBusy('Escrevendo arquivo', fn);
        const r = await CodeAgent.runTool('code_write', JSON.stringify({ path: fn, content }), { root });
        paintCodeUndo();
        coreIdle();
        if (!r.ok) { addMsg('ai', r.msg); return true; }
        try { if (window.Sandbox) window.Sandbox.previewFile(fn, content); } catch {}
        addHtml('ai', `<b>Arquivo criado no projeto:</b> <code>${escapeHtml(fn)}</code><br><span class="src">coding agent · Desfazer disponível</span>`);
        history.push({ role: 'assistant', content: 'Arquivo criado no projeto: ' + fn });
        log('Arquivo no projeto: ' + fn, 'ok');
        persist(); return true;
      } catch (e) { try { coreIdle(); } catch {} addMsg('ai', 'Não consegui criar: ' + escapeHtml(e.message)); return true; }
    }
    const name = fn || ('arquivo-' + Date.now().toString(36) + '.txt');
    let content = cm ? cm[1].trim() : null;
    if (!content) {
      const hasKey = !!(keys[cfg.provider] || cfg.provider === 'ollama' || cfg.provider === 'lmstudio');
      if (hasKey) {
        coreBusy('Gerando arquivo', name);
        try {
          const out = await callLLM([
            { role: 'system', content: 'Você gera APENAS o conteúdo bruto de um arquivo. Sem explicações, sem cercas de código, a menos que o formato peça.' },
            { role: 'user', content: rest.slice(0, 800) }
          ]);
          content = out.trim();
        } catch (e) { coreIdle(); addMsg('ai', 'Falha ao gerar conteúdo: ' + escapeHtml(e.message)); return true; }
        coreIdle();
      } else {
        addHtml('ai', `Entendi: arquivo <b>${escapeHtml(name)}</b>. Me diga o <b>conteúdo</b> assim: <code>crie um arquivo ${escapeHtml(name)} com o conteúdo: ...</code>`);
        return true;
      }
    }
    return await saveFileFlow(name, content, 'Arquivo criado');
  }
  // 4) ABRIR VÍDEO — "abre esse vídeo ..." / "toca ... no youtube"
  if (/(?:abre|abrir|toca(?:r)?|coloca(?:r)?|passa(?:r)?|mostra(?:r)?|assistir)[\s\wà-ú]*?(?:v[ií]deo|youtube|youtu|m[uú]sica)|(?:v[ií]deo|youtube)[\s\wà-ú]*?(?:abre|abrir|toca|coloca)|assistir\s+[\wà-ú][\wà-ú ]+/i.test(t)) {
    const u = (t.match(/https?:\/\/[^\s)]+/) || [])[0];
    if (u) {
      coreBusy('Reproduzindo vídeo', u.slice(0, 80));
      showVideo(u, 'Vídeo');
      coreIdle();
      return true;
    }
    const qy = t.match(/sobre\s+([^.?!\n]+)/i) || t.match(/assistir\s+([^.?!\n]+)/i) || (/v[ií]deo/i.test(t) ? t.match(/de\s+([^.?!\n]+)/i) : null);
    if (qy && (/youtube|v[ií]deo|assistir/i.test(t)) && !/youtube\s*(pra|para)?\s*(mim)?\s*[.?!\n]*$/i.test(t)) {
      const q = qy[1].trim().replace(/\s+no\s+youtube\s*$/i, '');
      const hit = await tryYouTubeFirst(q + ' youtube');
      if (hit) { persist(); return true; }
      window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), '_blank');
      addHtml('ai', `Busquei <b>${escapeHtml(q)}</b> no YouTube para você escolher o vídeo.`);
      history.push({ role: 'assistant', content: 'Busca YouTube: ' + q });
      return true;
    }
    // (abertura do site YouTube tratada no bloco dedicado no topo)
  }
  return false;
}

/* ───────── TELA DE DESCANSO ───────── */
function getRest() { return Object.assign({ minutes: 5 }, store.get('rest', {})); }
$('#restMinutes').onchange = () => { store.set('rest', { minutes: +$('#restMinutes').value }); };
(function initRest() { const s = $('#restMinutes'); if (s) s.value = String(getRest().minutes); })();
function tickRestClock() {
  const n = new Date();
  $('#restClock').textContent = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
  $('#restDate').textContent = n.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function enterRest() {
  $('#restOverlay').hidden = false;
  tickRestClock();
  setMood('sleeping');
  log('Tela de descanso ativada', 'info');
}
async function wakeRest() {
  if ($('#restOverlay').hidden) return;
  $('#restOverlay').hidden = true;
  lastActivity = Date.now();
  setMood('idle');
  const pend = getTasks().filter(t => !t.done);
  const today = new Date().getDay();
  const rots = getRoutines().filter(r => r.active && (r.repeat === 'daily' || r.repeat === 'once' || (r.days || []).includes(today)));
  const rems = getReminders().filter(r => !r.done);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const said = `${greet}! Resumo do dia: ` +
    (pend.length ? `${pend.length} tarefas pendentes: ${pend.slice(0, 3).map(t => t.text).join('; ')}. ` : 'nenhuma tarefa pendente. ') +
    (rots.length ? `${rots.length} rotinas ativas hoje. ` : '') +
    (rems.length ? `${rems.length} lembretes: ${rems.slice(0, 3).map(r => `${r.text} às ${r.time}`).join('; ')}.` : '');
  addHtml('ai', `<b>${greet}!</b> Aqui vai seu resumo:<br>• Tarefas pendentes: <b>${pend.length}</b>${pend.length ? ' — ' + escapeHtml(pend.slice(0, 3).map(t => t.text).join('; ')) : ''}<br>• Rotinas ativas hoje: <b>${rots.length}</b><br>• Lembretes: <b>${rems.length}</b>`);
  history.push({ role: 'assistant', content: said });
  persist();
  speak(said);
  log('Despertou da tela de descanso — resumo lido', 'ok');
}
document.addEventListener('keydown', e => {
  if (!$('#restOverlay').hidden && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); wakeRest(); }
});
$('#restOverlay').addEventListener('click', () => wakeRest());
setInterval(() => { if (!$('#restOverlay').hidden) tickRestClock(); }, 5000);
setInterval(() => {
  const sel = $('#restMinutes');
  const mins = sel ? +sel.value : getRest().minutes;
  if (!mins || document.hidden) return;
  if (!$('#restOverlay').hidden) return;
  if (busyCount > 0) return;
  if (Date.now() - lastActivity > mins * 60000) enterRest();
}, 10000);
renderPresets();
renderReminders();

/* ───────── MONITOR DO SISTEMA ───────── */
(function sysmon() {
  const el = id => document.getElementById(id);
  if (!el('sysmon')) return;
  let gpu = 'n/d';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || gpu;
    gpu = String(gpu).replace(/^ANGLE\s*\(?/, '').replace(/\)$/, '').split(',')[0].slice(0, 34);
  } catch {}
  el('smGpu').textContent = gpu;
  el('smCpuCores').textContent = (navigator.hardwareConcurrency || '?') + ' núcleos';
  const cpuSub = el('smCpuSub');
  try {
    if ('ComputePressureObserver' in window && cpuSub) {
      const obs = new ComputePressureObserver(up => {
        const s = (up[up.length - 1] || {}).state || '';
        cpuSub.textContent = { nominal: 'pressão do sistema: nominal', fair: 'pressão do sistema: moderada', serious: 'pressão do sistema: alta', critical: 'pressão do sistema: crítica' }[s] || 'pressão do sistema: ' + s;
      }, { cpuUtilizationThresholds: [0.25, 0.5, 0.75], cpuSpeedThresholds: [0.5] });
      obs.observe('cpu');
    } else if (cpuSub) cpuSub.textContent = 'carga da thread principal';
  } catch { if (cpuSub) cpuSub.textContent = 'carga da thread principal'; }
  let bat = null; const batHist = [];
  const paintBat = () => {
    if (!bat) { el('smBat').textContent = 'n/d'; el('smBatBar').style.width = '0%'; return; }
    const pct = Math.round(bat.level * 100);
    el('smBat').textContent = pct + '%' + (bat.charging ? ' · carregando' : '');
    el('smBatBar').style.width = pct + '%';
  };
  try {
    if (navigator.getBattery) navigator.getBattery().then(b => { bat = b; b.addEventListener('levelchange', paintBat); b.addEventListener('chargingchange', paintBat); paintBat(); }).catch(paintBat);
    else paintBat();
  } catch { paintBat(); }
  let last = performance.now(), acc = 0, n = 0;
  (function loop(t) {
    requestAnimationFrame(loop);
    const d = t - last; last = t;
    if (d < 250) { acc += Math.max(0, d - 16.7); n++; }
  })(performance.now());
  setInterval(() => {
    const load = n ? Math.min(100, Math.round(acc / (n * 16.7) * 100)) : 0;
    acc = 0; n = 0;
    el('smCpu').textContent = load + '%';
    el('smCpuBar').style.width = load + '%';
    const bsub = el('smBatSub');
    if (bsub) {
      if (bat && !bat.charging) {
        batHist.push({ t: Date.now(), l: bat.level });
        while (batHist.length && Date.now() - batHist[0].t > 10 * 60000) batHist.shift();
        if (batHist.length > 1) {
          const dL = batHist[0].l - batHist[batHist.length - 1].l;
          const dH = (batHist[batHist.length - 1].t - batHist[0].t) / 3600000;
          const rate = dH > 0 ? dL / dH * 100 : 0;
          bsub.textContent = rate > 0.05 ? 'consumo médio ≈ ' + rate.toFixed(1) + '%/h' : 'consumo estável';
        } else bsub.textContent = 'medindo consumo…';
      } else if (bat && bat.charging) bsub.textContent = 'carregando';
      else bsub.textContent = 'sem sensor de bateria';
    }
    if (performance.memory) {
      const mb = performance.memory.usedJSHeapSize / 1048576;
      const lim = performance.memory.jsHeapSizeLimit / 1048576;
      el('smRam').textContent = Math.round(mb) + ' MB';
      el('smRamBar').style.width = Math.min(100, Math.round(mb / lim * 100)) + '%';
    } else if (navigator.deviceMemory) {
      el('smRam').textContent = '≈' + navigator.deviceMemory + ' GB total';
      el('smRamBar').style.width = '8%';
    } else el('smRam').textContent = 'n/d';
  }, 2000);
  el('smToggle').onclick = () => el('sysmon').classList.toggle('min');
  icons();
})();

/* ───────── CONTEXTO REAL DO MODELO ───────── */
const MODEL_CTX = {
  'llama-3.3-70b-versatile': 128000, 'llama-3.1-8b-instant': 128000, 'mixtral-8x7b-32768': 32768, 'gemma2-9b-it': 8192,
  'gpt-4o': 128000, 'gpt-4o-mini': 128000, 'gpt-4-turbo': 128000, 'o1-mini': 128000, 'o3-mini': 200000,
  'gemini-2.0-flash': 1048576, 'gemini-2.0-flash-lite': 1048576, 'gemini-1.5-pro': 2097152, 'gemini-1.5-flash': 1048576,
  'claude-sonnet-4-20250514': 200000, 'claude-3-5-sonnet-20241022': 200000, 'claude-3-5-haiku-20241022': 200000,
  'llama3.1': 128000, 'qwen2.5': 32768, 'mistral': 32000, 'gemma2': 8192, 'deepseek-r1': 64000
};
const PROVIDER_DEFAULT_CTX = { groq: 128000, openai: 128000, gemini: 1048576, anthropic: 200000, ollama: 32768, lmstudio: 32768, openrouter: 128000 };
let ctxUsed = store.get('ctxUsed', 0);
let pendingUsage = null;
function noteUsage(inp, out) { pendingUsage = { in: +inp || 0, out: +out || 0 }; }
function ctxLimit() {
  const mdl = cfg.model || '';
  if (MODEL_CTX[mdl]) return { limit: MODEL_CTX[mdl], known: true };
  const low = mdl.toLowerCase();
  const fam = [
    [/gemini.*pro/, 2097152], [/gemini/, 1048576],
    [/claude/, 200000], [/gpt-4o|gpt-4-turbo|^o1|^o3|^o4|gpt-5/, 128000],
    [/llama|qwen3|qwen-3/, 128000], [/mixtral|mistral-large/, 32768], [/mistral/, 32000],
    [/gemma/, 8192], [/deepseek/, 64000], [/grok/, 131072]
  ];
  for (const [re, lim] of fam) if (re.test(low)) return { limit: lim, known: true };
  return { limit: PROVIDER_DEFAULT_CTX[cfg.provider] || 0, known: false };
}
function fmtK(n) {
  n = Math.round(n);
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return '' + n;
}
function paintCtx() {
  const bar = $('#ctxBar');
  if (!bar) return;
  const { limit, known } = ctxLimit();
  const pct = limit ? Math.min(100, ctxUsed / limit * 100) : 0;
  const fill = $('#ctxFill');
  fill.style.width = pct + '%';
  fill.className = pct >= 95 ? 'hot' : pct >= 80 ? 'warn' : '';
  const pctTxt = pct < 0.05 && ctxUsed > 0 ? '<0,1' : (pct < 10 ? pct.toFixed(1).replace('.', ',') : Math.round(pct)) + '%';
  $('#ctxLabel').textContent = limit ? `${fmtK(ctxUsed)} / ${known ? '' : '≈'}${fmtK(limit)} · ${pctTxt}` : `${fmtK(ctxUsed)} usados`;
}
function trackLLM(msgs, outText) {
  const chars = msgs.reduce((a, m) => a + String(m.content || '').length, 0) + String(outText || '').length;
  const est = Math.round(chars / 4);
  const real = pendingUsage && (pendingUsage.in + pendingUsage.out) > 0 ? pendingUsage.in + pendingUsage.out : 0;
  pendingUsage = null;
  ctxUsed += real || est;
  store.set('ctxUsed', ctxUsed);
  paintCtx();
}
$('#ctxBar').onclick = async () => {
  if (await uiConfirm('Zerar contexto', 'Zerar o contador de contexto?', 'Zerar')) { ctxUsed = 0; pendingUsage = null; store.set('ctxUsed', 0); paintCtx(); }
};
paintCtx();

/* ───────── ARQUIVOS NO PC (só na pasta autorizada) ───────── */
const FS_DB = 'myos-fs';
function idbOpen() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(FS_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('handles');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function idbSet(k, v) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(v, k);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(k) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles', 'readonly');
    const q = tx.objectStore('handles').get(k);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
let workDirHandle = null;
async function getWorkDir(interactive) {
  if (!window.showDirectoryPicker) return null;
  try {
    const h = workDirHandle || await idbGet('workdir').catch(() => null);
    if (!h) return null;
    workDirHandle = h;
    let q = await h.queryPermission({ mode: 'readwrite' });
    if (q !== 'granted' && interactive) q = await h.requestPermission({ mode: 'readwrite' });
    return q === 'granted' ? h : null;
  } catch { return null; }
}
async function paintWorkDir() {
  const lab = $('#workDirLabel');
  if (!lab) return;
  if (!window.showDirectoryPicker) { lab.textContent = 'Seu navegador não permite pastas (use Chrome/Edge). Arquivos cairão em Downloads.'; return; }
  try {
    const h = workDirHandle || await idbGet('workdir').catch(() => null);
    if (!h) { lab.textContent = 'Nenhuma pasta autorizada. Os arquivos cairão em Downloads.'; return; }
    workDirHandle = h;
    const q = await h.queryPermission({ mode: 'readwrite' });
    lab.innerHTML = `Pasta: <code>${escapeHtml(h.name)}</code> · ${q === 'granted' ? 'acesso liberado' : 'toque em Autorizar para liberar de novo'}`;
  } catch { lab.textContent = 'Armazenamento local indisponível.'; }
}
async function saveToWorkDir(name, content) {
  const dir = await getWorkDir(true);
  if (!dir) return { ok: false, needAuth: true };
  try {
    const safe = String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || ('arquivo-' + Date.now() + '.txt');
    const fh = await dir.getFileHandle(safe, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
    return { ok: true, name: safe };
  } catch (e) { return { ok: false, error: e.message }; }
}
function downloadBlob(name, content, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function saveFileFlow(name, content, title) {
  coreBusy('Salvando arquivo', name);
  const win = coreWindow({ icon: 'file-text', title: title || 'Arquivo', body: `Nome <b>${escapeHtml(name)}</b>` });
  const r = await saveToWorkDir(name, content);
  if (r.ok) {
    coreWinDone(win, 'Salvo na pasta autorizada.');
    addHtml('ai', `<b>Arquivo salvo</b>: <code>${escapeHtml(r.name)}</code><br><span class="src">pasta autorizada · execução local</span>`);
    history.push({ role: 'assistant', content: 'Arquivo salvo: ' + r.name });
    log('Arquivo salvo: ' + r.name, 'ok');
  } else {
    downloadBlob(name, content);
    coreWinDone(win, r.error ? 'Erro: ' + r.error : 'Sem pasta autorizada — baixado para Downloads.', 'warn');
    addHtml('ai', `<b>${escapeHtml(name)}</b> baixado para <b>Downloads</b>.<br>Para salvar direto numa pasta sua: Configurações → <b>Autorizar pasta</b>.<br><span class="src">fallback automático · nada foi perdido</span>`);
    history.push({ role: 'assistant', content: 'Arquivo baixado (fallback): ' + name });
    log('Arquivo via download (sem pasta): ' + name, 'warn');
  }
  coreIdle();
  persist();
  return true;
}
$('#btnWorkDir').onclick = async () => {
  if (!window.showDirectoryPicker) { toast('folder', 'Use Chrome ou Edge para autorizar pastas.'); return; }
  try {
    const h = await window.showDirectoryPicker({ mode: 'readwrite' });
    workDirHandle = h;
    await idbSet('workdir', h);
    paintWorkDir();
    toast('folder', `Pasta <b>${escapeHtml(h.name)}</b> autorizada.`);
    log('Pasta de trabalho: ' + h.name, 'ok');
  } catch {}
};

/* ───────── CODING AGENT (workspace, permissões, bridge, undo) ───────── */
function bindCodeAgent() {
  try {
    CodeAgent.bind({ confirm: uiConfirm, notify: toast, log, bridge: store.get('code-bridge', { url: 'http://127.0.0.1:8787', token: '' }) });
  } catch {}
}
function paintCodeUndo() {
  try { const n = $('#codeUndoCount'); if (n) n.textContent = CodeAgent.history().length; } catch {}
}
async function paintCodeWorkDir() {
  try {
    const lab = $('#codeWorkDirLabel');
    if (!lab) return;
    if (!window.showDirectoryPicker) { lab.textContent = 'Navegador sem File System Access (use Chrome/Edge).'; return; }
    const h = await getWorkDir(false).catch(() => null);
    lab.innerHTML = h ? `Workspace: <code>${escapeHtml(h.name)}</code>` : 'Nenhuma pasta autorizada ainda.';
  } catch {}
}
/* ── Materializa código despejado no chat: salva no projeto + preview ──
   Se o usuário pediu código e o modelo respondeu com bloco em vez de code_write,
   salva automaticamente (respeita permissões) e mostra no monitor. */
const CODE_WANT_RE = /(landing\s*page|\bsite\b|\bp[aá]gina\b|\bhtml\b|\bcss\b|javascript|typescript|\bc[óo]digo\b|programa|script|\bapp\b|componente|portf[oó]lio|loja virtual|\bblog\b|formul[aá]rio|crie.*(arquivo|projeto)|crie.*(p[aá]gina|site))/i;
function usedCodeTool(toolsUsed) { return (toolsUsed || []).some(t => t === 'code_write' || t === 'code_edit'); }
function extractCodeBlocks(answer) {
  const s = String(answer || '');
  const out = [];
  for (const m of s.matchAll(/```(\w*)\n([\s\S]*?)```/g)) {
    const code = m[2].trim();
    if (code.length >= 200) out.push({ lang: (m[1] || '').toLowerCase(), code, src: 'fence' });
  }
  if (!out.length) {
    const doc = s.match(/<!DOCTYPE html[\s\S]*?<\/html\s*>/i) || s.match(/<html[\s\S]*?<\/html\s*>/i);
    if (doc && doc[0].length >= 200) out.push({ lang: 'html', code: doc[0].trim(), src: 'doc' });
  }
  return out.sort((a, b) => b.code.length - a.code.length).slice(0, 3);
}
function guessCodeFile(userText, lang, used) {
  const m = String(userText || '').match(/([a-z0-9_.\-/]+\.(html?|css|js|py|json|md))/i);
  if (m && !used.has(m[1].toLowerCase())) { used.add(m[1].toLowerCase()); return m[1]; }
  const base = { html: 'index.html', htm: 'index.html', css: 'style.css', javascript: 'script.js', js: 'script.js', python: 'main.py', py: 'main.py', json: 'dados.json', md: 'README.md' }[lang] || 'index.html';
  let name = base, i = 2;
  while (used.has(name.toLowerCase())) { name = base.replace(/(\.[a-z0-9]+)$/i, '-' + (i++) + '$1'); }
  used.add(name.toLowerCase());
  return name;
}
/* Troca dump de código por cards: salva no projeto, joga no monitor e
   DEVOLVE a mensagem sem o código gigante (padrão artifacts). */
async function shapeCodeAnswer(userText, answer, toolsUsed) {
  const orig = String(answer || '');
  try {
    if (!CODE_WANT_RE.test(userText || '') || usedCodeTool(toolsUsed)) return { display: orig, saved: [] };
    const blocks = extractCodeBlocks(orig);
    if (!blocks.length) return { display: orig, saved: [] };
    const root = await getWorkDir(false).catch(() => null);
    if (!root) return { display: orig, saved: [] };
    const used = new Set(); const saved = []; const byCode = new Map();
    for (const b of blocks) {
      const path = guessCodeFile(userText, b.lang, used);
      const r = await CodeAgent.runTool('code_write', JSON.stringify({ path, content: b.code }), { root });
      if (!r.ok) { log('Artifact: ' + String(r.msg).slice(0, 100), 'warn'); continue; }
      saved.push({ path, code: b.code });
      byCode.set(b.code, path);
    }
    if (!saved.length) return { display: orig, saved: [] };
    paintCodeUndo();
    const htmlFirst = saved.find(s => /\.html?$/i.test(s.path)) || saved[0];
    try { if (window.Sandbox) window.Sandbox.previewFile(htmlFirst.path, htmlFirst.code.slice(0, 50000)); } catch {}
    const card = (p, code) => `> **${p}** — ${code.split('\n').length} linhas no monitor à direita (clique para ampliar)`;
    let display = orig.replace(/```(\w*)\n([\s\S]*?)```/g, (m0, lg, cd) => {
      const p = byCode.get(cd.trim());
      return p ? card(p, cd.trim()) : m0;
    });
    for (const s of saved) {
      if (display.includes(s.code) && s.code.length >= 200 && !display.includes(card(s.path, s.code)))
        display = display.replace(s.code, card(s.path, s.code));
    }
    display += `\n\n**Código no monitor →** ${saved.map(s => `\`${s.path}\``).join(' · ')} · Desfazer disponível.`;
    log(`Artifact: ${saved.length} arquivo(s) no monitor (${saved.map(s => s.path).join(', ')})`, 'ok');
    persist();
    return { display, saved: saved.map(s => s.path) };
  } catch (e) { log('Artifact falhou: ' + e.message, 'warn'); return { display: orig, saved: [] }; }
}
async function maybeMaterializeCode(userText, answer, toolsUsed) {
  // compat: redireciona p/ shape (não duplica — shape já verifica usedCodeTool)
  try {
    const r = await shapeCodeAnswer(userText, answer, toolsUsed);
    if (r.saved.length) {
      addHtml('ai', `<b>Código salvo no projeto (${r.saved.length} arquivo${r.saved.length > 1 ? 's' : ''})</b> — veja no <b>monitor à direita</b> (clique p/ ampliar).<br><span class="src">coding agent · Desfazer disponível</span>`);
      history.push({ role: 'assistant', content: 'Código salvo no projeto (' + r.saved.join(', ') + '), preview no monitor.' });
      persist();
    }
  } catch {}
}
async function codeUndoFlow() {
  try {
    const h = await getWorkDir(true);
    if (!h) { toast('folder', 'Autorize a pasta do projeto primeiro.'); return; }
    const r = await CodeAgent.undo(h);
    toast(r.ok ? 'undo-2' : 'x', escapeHtml(r.msg));
    log('Code undo: ' + r.msg, r.ok ? 'ok' : 'warn');
    paintCodeUndo();
  } catch (e) { toast('x', 'Falha ao desfazer: ' + escapeHtml(e.message)); }
}
function paintCodeSettings() {
  try {
    const p = CodeAgent.getPerms();
    $$('#codeModeSwitch [data-code-mode]').forEach(b => b.classList.toggle('active', b.dataset.codeMode === p.mode));
    const box = $('#codePerms');
    if (box) {
      box.innerHTML = '';
      CodeAgent.TOOLS.forEach(t => {
        const row = document.createElement('div');
        row.className = 'coderow';
        const sel = document.createElement('select');
        ['allow', 'ask', 'deny'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; if (p.tools[t] === v) o.selected = true; sel.appendChild(o); });
        sel.onchange = () => { CodeAgent.setToolPerm(t, sel.value); log(`Coding: ${t} = ${sel.value}`, 'info'); };
        const lb = document.createElement('span'); lb.textContent = CodeAgent.label(t);
        row.appendChild(lb); row.appendChild(sel); box.appendChild(row);
      });
    }
    const br = store.get('code-bridge', { url: 'http://127.0.0.1:8787', token: '' });
    if ($('#codeBridgeUrl')) $('#codeBridgeUrl').value = br.url || '';
    if ($('#codeBridgeToken')) $('#codeBridgeToken').value = br.token || '';
    try { icons(); } catch {}
    paintCodeUndo();
    paintCodeWorkDir();
  } catch (e) { log('Falha coding settings: ' + e.message, 'warn'); }
}
try {
  $$('#codeModeSwitch [data-code-mode]').forEach(b => b.onclick = () => {
    const p = CodeAgent.setMode(b.dataset.codeMode);
    paintCodeSettings();
    toast(p.mode === 'build' ? 'hammer' : 'eye', p.mode === 'build' ? 'Modo <b>Build</b>: escrita conforme permissões.' : 'Modo <b>Plan</b>: só leitura + plano.');
    log('Coding modo: ' + p.mode, 'info');
  });
  $('#btnCodeWorkDir').onclick = () => $('#btnWorkDir').click();
  const saveBridge = () => {
    store.set('code-bridge', { url: ($('#codeBridgeUrl').value || '').trim(), token: ($('#codeBridgeToken').value || '').trim() });
    bindCodeAgent();
  };
  $('#codeBridgeUrl').onchange = saveBridge;
  $('#codeBridgeToken').onchange = saveBridge;
  $('#btnCodeBridgeTest').onclick = async () => {
    toast('zap', 'Testando bridge…');
    try {
      const br = store.get('code-bridge', {});
      const u = (br.url || 'http://127.0.0.1:8787').replace(/\/$/, '');
      const r = await fetch(u + '/health');
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { toast('check', `<b>Bridge OK.</b> root: ${escapeHtml(j.root || '')}`); log('Bridge OK: ' + (j.root || ''), 'ok'); }
      else { toast('x', 'Bridge respondeu erro HTTP ' + r.status); log('Bridge HTTP ' + r.status, 'warn'); }
    } catch (e) { toast('x', 'Bridge fora do ar — rode <code>python3 bridge.py</code>.'); log('Bridge falhou: ' + e.message, 'warn'); }
  };
  $('#btnCodeUndo').onclick = codeUndoFlow;
  $('#btnSettings').addEventListener('click', () => setTimeout(paintCodeSettings, 50));
} catch {}
paintWorkDir();

/* ───────── NAVEGADOR NEXUS (ferramentas web p/ qualquer modelo) ───────── */
const TOOLS_SYS = `\n\n[FERRAMENTAS — web + música local. REGRA DE OURO: se dá p/ responder direto, RESPONDA DIRETO sem tool. Só use tool quando pedir dado externo/ação (notícia atual, abrir site, criar/ler tarefa, tocar/baixar). NUNCA use JSON {"name":...} — só o formato <tool>. Quando precisar, responda SOMENTE com 1 chamada neste formato exato:\n<tool name="web_search">sua consulta</tool>\n<tool name="web_open">https://url-completa</tool>\n<tool name="open_site">youtube | gmail | github | nome do site ou URL</tool> — use SEMPRE que pedir ABRIR/VER/ACESSAR.\n<tool name="music_search">termo</tool> — busca PRIMEIRO na biblioteca local do usuário (upada no player à esquerda), depois Archive/Wiki. Use p/ "toca X".\n<tool name="music_download">termo</tool> — baixa o MP3 do 1º resultado.\n<tool name="create_task">texto da tarefa</tool> — use SEMPRE que pedir CRIAR/ADICIONAR tarefa; o sistema salva na aba Tarefas.\n<tool name="list_tasks"></tool> — use SEMPRE que perguntar SE TEM tarefa/pendência/o que falta; o sistema devolve a lista real. Responda SÓ com os dados retornados.\n<tool name="complete_task">texto (ou parte) da tarefa</tool> — use SEMPRE que pedir CONCLUIR/MARCAR COMO FEITA/TERMINAR tarefa; o sistema marca como concluída na aba Tarefas.\n<tool name="delete_task">texto (ou parte) da tarefa</tool> — use SEMPRE que pedir DELETAR/APAGAR/REMOVER tarefa; o sistema remove da aba Tarefas.\n<tool name="create_note">{"title":"Título","text":"conteúdo"}</tool> — use SEMPRE que pedir CRIAR/ANOTAR/ANOTE nota; o sistema salva na aba Notas.\n<tool name="list_notes"></tool> — use SEMPRE que perguntar SE TEM nota/minhas notas; devolve a lista real.\n<tool name="edit_note">{"match":"trecho da nota","text":"novo conteúdo"}</tool> — use quando pedir EDITAR/ATUALIZAR/MUDAR nota.\n<tool name="delete_note">trecho da nota ou nº</tool> — use quando pedir DELETAR/APAGAR/REMOVER nota.\n<tool name="run_skill">slug-da-skill</tool>.\nMúsica: se o usuário citar nome da biblioteca local, use music_search com esse nome — o sistema já prioriza locais. Controles (pausa/próxima) são locais, apenas confirme.\nNUNCA explique passos para abrir/pesquisar/tocar: invoque a ferramenta e deixe o sistema executar.\nO sistema executa e devolve o resultado; aí responda em português citando fontes/links.]\n\n[CODING AGENT — arquivos do projeto, só quando pedir criar/editar/ler código. Workspace = pasta autorizada em Configurações → Coding.\n<tool name="code_read">{"path":"src/app.js","offset":0,"limit":120}</tool> — lê arquivo (offset/limit p/ grandes). Leia antes de editar.\n<tool name="code_list">{"path":"src"}</tool> — lista pasta ({} = raiz).\n<tool name="code_glob">{"pattern":"src/**/*.js"}</tool> — acha arquivos (*, **, ?).\n<tool name="code_grep">{"pattern":"TODO|FIXME","include":"*.js"}</tool> — busca texto (regex) no projeto.\n<tool name="code_write">{"path":"src/novo.js","content":"...código completo..."}</tool> — cria/sobrescreve o arquivo INTEIRO (cria pastas). P/ novo ou reescrita grande. Pula se idêntico.\n<tool name="code_edit">{"path":"src/app.js","old_string":"trecho exato","new_string":"novo"}</tool> — troca precisa; old_string deve existir exatamente. P/ mudança pequena. "replace_all":true p/ todas.\n<tool name="code_bash">{"cmd":"npm test","timeout_ms":60000}</tool> — shell no projeto (exige bridge.py + permissão).\nRegras: JSON válido na tag; nunca escreva o literal </tool> dentro de content; escrita pode pedir confirmação com diff (ask) ou ser negada (modo Plan/deny); Desfazer reverte a última mudança.
Ao CRIAR código (landing page, site, script), SEMPRE invoque code_write — NUNCA cole o arquivo inteiro no chat.]`;
function parseToolCall(text) {
  const s = String(text || '');
  const m = s.match(/<tool\s+name=["'](web_search|web_open|news|open_site|run_skill|music_search|music_download|music_play|create_task|list_tasks|complete_task|delete_task|create_note|list_notes|edit_note|delete_note|code_read|code_list|code_glob|code_grep|code_write|code_edit|code_bash)["']\s*>([\s\S]*?)<\/tool>/i);
  if (m) { const nm = m[1].toLowerCase(); return { name: nm, arg: m[2].trim().slice(0, nm.startsWith('code_') ? 20000 : 500) }; }
  try {
    const jm = s.match(/\{\s*"name"\s*:\s*"([\w-]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/);
    if (jm) {
      let arg = '';
      try { const ao = JSON.parse(jm[2]); arg = ao.query ?? ao.text ?? ao.alvo ?? ao.url ?? ao.slug ?? ''; } catch {}
      return { name: jm[1].toLowerCase(), arg: String(arg).slice(0, 500) };
    }
  } catch {}
  return null;
}
async function fetchTimeout(url, ms = 15000, opts = {}) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); }
  finally { clearTimeout(id); }
}
function stripTags(s) { const d = document.createElement('div'); d.innerHTML = s; return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
// Encurta consulta p/ índices pequenos (MWMBL rende mais com 2-5 palavras-chave).
function shortQuery(q) {
  return String(q || '').toLowerCase()
    .replace(/\b(de|da|do|das|dos|em|no|na|nos|nas|para|com|uma?|os?|as?|e|sobre|por|que|hoje|principais|trag[ao]|me|quais|mais)\b/g, ' ')
    .replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
}
// Limita cada fonte a no máx `ms` (news roda em paralelo — a mais lenta não trava as outras).
const timedSrc = (p, ms = 7000) => Promise.race([p, new Promise(res => setTimeout(() => res(''), ms))]);
// Proxies CORS em corrida: o primeiro que responder vence (allorigins sozinho é instável).
const CORS_PROXIES = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
];
async function fetchViaProxies(url, ms = 10000) {
  const attempts = CORS_PROXIES.map(fn => (async () => {
    const r = await fetchTimeout(fn(url), ms);
    if (!r.ok) throw new Error('proxy ' + r.status);
    const t = await r.text();
    if (!t || t.length < 200) throw new Error('proxy vazio');
    return t;
  })());
  return await Promise.any(attempts);
}
async function toolGDELT(q) {
  // GDELT DOC 2.1 artlist: grátis, sem chave, JSON direto (fail-soft se CORS/429).
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=10&format=json&sort=datedesc`;
    const r = await fetchTimeout(url, 10000);
    if (!r.ok) return '';
    const j = await r.json();
    const arts = ((j && j.articles) || []).slice(0, 8).map(a => `- ${a.title} [${a.domain || a.source || ''}] (${a.url})`);
    return arts.length ? `NOTÍCIAS MUNDO (GDELT, tempo real):\n${arts.join('\n')}` : '';
  } catch { return ''; }
}
async function toolWiki(q) {
  try {
    const r = await fetchTimeout(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=4`);
    if (!r.ok) return '';
    const j = await r.json();
    const hits = (j.query?.search || []).map(h => `- ${h.title}: ${stripTags(h.snippet || '').slice(0, 220)} (https://pt.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))})`);
    return hits.length ? `WIKIPEDIA:\n${hits.join('\n')}` : '';
  } catch { return ''; }
}
async function toolDDG(q) {
  try {
    const html = await fetchViaProxies(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = [...doc.querySelectorAll('a.result__a, a.result-link')].slice(0, 6);
    if (!links.length) return '';
    const out = links.map(a => {
      let href = a.getAttribute('href') || '';
      const m = href.match(/uddg=([^&]+)/);
      if (m) try { href = decodeURIComponent(m[1]); } catch {}
      return `- ${a.textContent.trim().slice(0, 120)} (${href})`;
    });
    return `BUSCA WEB (DuckDuckGo):\n${out.join('\n')}`;
  } catch { return ''; }
}
async function toolMWMBL(q) {
  // MWMBL (skill ultimate-web-search): índice aberto, grátis, sem chave, com CORS p/ browser.
  // GET api.mwmbl.org/api/v1/search/?s=<query> → [{url, title:[{value}], extract:[{value}], source}]
  try {
    const r = await fetchTimeout(`https://api.mwmbl.org/api/v1/search/?s=${encodeURIComponent(q)}`, 10000);
    if (!r.ok) return '';
    const arr = await r.json();
    if (!Array.isArray(arr)) return '';
    const hits = arr.slice(0, 8).map(h => {
      const t = Array.isArray(h.title) ? h.title.map(x => x.value || '').join('') : '';
      const x = Array.isArray(h.extract) ? h.extract.map(x => x.value || '').join('').slice(0, 220) : '';
      return t && h.url ? `- ${t}${x ? ': ' + x : ''} (${h.url})` : '';
    }).filter(Boolean);
    return hits.length ? `BUSCA WEB (MWMBL, links reais):\n${hits.join('\n')}` : '';
  } catch { return ''; }
}
async function toolHN(q) {
  const fetchHN = async (qq) => {
    try {
      const r = await fetchTimeout(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(qq)}&tags=story&hitsPerPage=5`);
      if (!r.ok) return '';
      const hits = ((await r.json()).hits || []).map(h => `- ${h.title} (${h.url || 'https://news.ycombinator.com/item?id=' + h.objectID})`);
      return hits.length ? `HACKER NEWS:\n${hits.join('\n')}` : '';
    } catch { return ''; }
  };
  const out = await fetchHN(q);
  if (out) return out;
  // HN é em inglês: traduz termos PT comuns + remove stopwords e tenta de novo.
  const en = String(q || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/noticias?/g, 'news').replace(/tecnologi(a|co)/g, 'technology').replace(/\b ia \b/g, ' AI ')
    .replace(/\b(de|da|do|das|dos|em|no|na|nos|nas|hoje|ultimas?|sobre|para|com|uma?|os?|as?|e|atual|atuais|recente?s?|dia|principais|quais|mais|falados?|assuntos?)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (en && en !== String(q).toLowerCase().trim() && en.length > 2) return await fetchHN(en);
  return '';
}
async function toolNewsRSS(topic) {
  try {
    const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}%20when:7d&hl=pt-BR&gl=BR&ceid=BR%3Apt-419`;
    const xml = await fetchViaProxies(rss);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const items = [...doc.querySelectorAll('item')].slice(0, 8).map(it =>
      `- ${it.querySelector('title')?.textContent || ''}${it.querySelector('source')?.textContent ? ' [' + it.querySelector('source').textContent + ']' : ''} (${it.querySelector('link')?.textContent || ''})`);
    if (!items.length) throw new Error('sem itens');
    return `NOTÍCIAS (Google News, tempo real):\n${items.join('\n')}`;
  } catch { return ''; }
}
async function toolOpen(url) {
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const r = await fetchViaProxies(u);
  const doc = new DOMParser().parseFromString(r, 'text/html');
  doc.querySelectorAll('script,style,nav,header,footer,aside,form').forEach(x => x.remove());
  const txt = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 6000);
  if (!txt) throw new Error('página sem texto legível');
  return `CONTEÚDO DE ${u}:\n${txt}`;
}
const _searchCache = { q: '', txt: '', ts: 0 };
async function execTool(name, arg, step) {
  const say = s => { try { step && step(s); } catch {} };
  if (name === 'web_search') {
    const q = String(arg || '').trim().slice(0, 200);
    const nq = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Dedup: mesma consulta <60s → cache, sem refetch
    if (nq && nq === _searchCache.q && Date.now() - _searchCache.ts < 60000) { say('Usando cache da busca.'); log(`Busca cache "${q.slice(0, 60)}" (${_searchCache.txt.length} chars)`, 'info'); return _searchCache.txt; }
    const isNews = /noticia|news|atual|hoje|recente|2024|2025|2026|ultimas/i.test(q);
    const isFactual = /^(o que e|quem e|quem foi|o que significa|definicao|significado)\b|^[a-z0-9 ]{1,40}$/i.test(q.trim());
    let txt = '';
    const t0s = Date.now();
    const stat = (label, s) => `${label}:${!s ? 'VAZIO' : s.length + 'ch'}`;
    if (isNews) {
      // Notícias: GDELT + Google News + HN + MWMBL (cheia + curta) em PARALELO, máx 7s por fonte.
      say('Lendo notícias…');
      const sq = shortQuery(q);
      const jobs = [timedSrc(toolGDELT(q)), timedSrc(toolNewsRSS(q)), timedSrc(toolHN(q)), timedSrc(toolMWMBL(q))];
      if (sq && sq !== q.toLowerCase().trim()) jobs.push(timedSrc(toolMWMBL(sq)));
      const got = await Promise.all(jobs);
      const [g, n, h, m] = got;
      const parts = got.filter(s => s && s.length > 50);
      txt = parts.join('\n\n');
      if (!txt) {
        say('Buscando na web…');
        txt = await toolDDG(q);
        log(`Busca news "${q.slice(0, 60)}" → ${stat('GDELT', g)} ${stat('GNews', n)} ${stat('HN', h)} ${stat('MWMBL', m)} ${stat('DDG', txt)} (${Date.now() - t0s}ms)`, txt ? 'info' : 'warn');
      } else {
        log(`Busca news "${q.slice(0, 60)}" → ${stat('GDELT', g)} ${stat('GNews', n)} ${stat('HN', h)} ${stat('MWMBL', m)} (${Date.now() - t0s}ms)`, 'info');
      }
    } else if (isFactual) {
      // Factual curto: Wikipedia basta. MWMBL direto antes do DDG-via-proxy.
      say('Consultando Wikipedia…');
      txt = await toolWiki(q);
      if (!txt) { say('Buscando na web…'); txt = await toolMWMBL(q); }
      if (!txt) { say('Buscando na web…'); txt = await toolDDG(q); }
      log(`Busca factual "${q.slice(0, 60)}" → ${stat('Wiki/MWMBL/DDG', txt)} (${Date.now() - t0s}ms)`, txt ? 'info' : 'warn');
    } else {
      // Geral: MWMBL direto primeiro (links reais, sem proxy). DDG depois, Wiki por último.
      say('Buscando na web…');
      txt = await toolMWMBL(q);
      if (!txt) txt = await toolDDG(q);
      if (!txt) txt = await toolWiki(q);
      log(`Busca web "${q.slice(0, 60)}" → ${stat('MWMBL/DDG/Wiki', txt)} (${Date.now() - t0s}ms)`, txt ? 'info' : 'warn');
    }
    txt = String(txt || '').slice(0, 3500) || 'Sem resultados. Tente reformular a consulta.';
    _searchCache.q = nq; _searchCache.txt = txt; _searchCache.ts = Date.now();
    return txt;
  }
  if (name === 'web_open') {
    say('Conectando na página…');
    const t0o = Date.now();
    try {
      const c = await toolOpen(arg);
      log(`Abrir página "${String(arg).slice(0, 80)}" → ${c.length} chars (${Date.now() - t0o}ms)`, 'info');
      say('Texto extraído.');
      return c.slice(0, 6500);
    } catch (e) {
      log(`Abrir página "${String(arg).slice(0, 80)}" FALHOU: ${String(e.message).slice(0, 120)} (${Date.now() - t0o}ms)`, 'warn');
      throw e;
    }
  }
  if (name === 'news') {
    say('Lendo Google News em tempo real…');
    const a = await toolNewsRSS(arg);
    say('Verificando Hacker News…');
    const b = await toolHN(arg);
    return (a + (b ? '\n\n' + b : '')).slice(0, 6500);
  }
  if (name.startsWith('code_')) {
    say(CodeAgent.label(name) + '…');
    const root = await getWorkDir(true);
    const r = await CodeAgent.runTool(name, arg, { root });
    paintCodeUndo();
    if (!r.ok) throw new Error(r.msg);
    try {
      if ((name === 'code_write' || name === 'code_edit') && window.Sandbox) {
        const ap = CodeAgent.parseArgs(arg);
        if (ap.path) {
          const cur = await CodeAgent.readWhole(root, ap.path).catch(() => null);
          if (cur && cur.text !== null) window.Sandbox.previewFile(cur.r.rel, cur.text.slice(0, 50000));
        }
      }
    } catch {}
    return String(r.msg).slice(0, 6500);
  }
  if (name === 'music_search') {
    say('Buscando em Archive.org + Wikimedia…');
    const list = await window.MusicRepos.search(arg, 'all', 6);
    if (!list.length) return 'Sem músicas gratuitas para: ' + arg;
    try { window.MusicPlayer && MusicPlayer.renderResults(list); } catch {}
    return 'MÚSICAS LIVRES (toque com music_play ou baixe):\n' + list.map((t, i) => `${i + 1}. ${t.title} — ${t.artist} [${t.source}] ${t.url} (página: ${t.page})`).join('\n');
  }
  if (name === 'music_download' || name === 'music_play') {
    say(name === 'music_download' ? 'Baixando MP3…' : 'Tocando…');
    const list = await window.MusicRepos.search(arg, 'all', 4);
    if (!list.length) throw new Error('nada encontrado para: ' + arg);
    const t = list[0];
    if (name === 'music_download') await window.MusicRepos.download(t);
    else try { window.MusicPlayer && MusicPlayer.playTrack(t); } catch {}
    try { window.MusicPlayer && MusicPlayer.renderResults(list); switchTab('music'); } catch {}
    addHtml('ai', (name === 'music_download' ? '<b>Download iniciado</b>' : '<b>Tocando agora</b>') + `: ${escapeHtml(t.title)}<br>${musicTrackCard(t)}`);
    history.push({ role: 'assistant', content: `${name}: ${t.title} ${t.url}` }); persist();
    return `${name === 'music_download' ? 'DOWNLOAD INICIADO' : 'TOCANDO'}: ${t.title} — ${t.artist} [${t.source}] ${t.downloadUrl}`;
  }
  if (name === 'create_task') {
    say('Criando tarefa…');
    const v = String(arg || '').trim().slice(0, 200);
    if (!v) throw new Error('texto da tarefa vazio');
    const created = createTask(v);
    say('Tarefa salva.');
    addHtml('ai', `<b>Tarefa criada:</b> ${escapeHtml(v)}<br><span class="src">aba Tarefas · peça "executar com IA" p/ rodar</span>`);
    history.push({ role: 'assistant', content: 'Tarefa criada: ' + v }); persist();
    return `TAREFA CRIADA: ${v}`;
  }
  if (name === 'list_tasks') {
    say('Lendo suas tarefas…');
    const all = getTasks();
    const pend = all.filter(x => !x.done);
    const done = all.filter(x => x.done);
    try { switchTab('tasks'); } catch {}
    if (!all.length) return 'TAREFAS: nenhuma tarefa salva.';
    return `TAREFAS (${pend.length} pendente(s), ${done.length} concluída(s)):\n`
      + pend.slice(0, 10).map((x, i) => `${i + 1}. [PENDENTE] ${x.text}`).join('\n')
      + (done.length ? `\nConcluídas: ${done.slice(0, 5).map(x => x.text).join(' | ')}` : '');
  }
  if (name === 'complete_task') {
    say('Concluindo tarefa…');
    const raw = String(arg || '').trim();
    const q = raw.toLowerCase();
    if (!q) throw new Error('informe o texto da tarefa a concluir');
    const all = getTasks();
    let idx = all.findIndex(x => !x.done && x.text.toLowerCase().includes(q));
    if (idx < 0 && /^\d+$/.test(q)) {
      const pend = all.filter(x => !x.done);
      const p = pend[+q - 1];
      if (p) idx = all.indexOf(p);
    }
    if (idx < 0) {
      const pend = all.filter(x => !x.done);
      return 'TAREFA NÃO ENCONTRADA: nenhuma pendente bate com "' + raw + '".'
        + (pend.length ? ' Pendentes: ' + pend.map((x, i) => `${i + 1}. ${x.text}`).join(' | ') : ' Nenhuma tarefa pendente.');
    }
    all[idx].done = true;
    store.set('tasks', all); renderTasks();
    try { switchTab('tasks'); } catch {}
    const v = all[idx].text;
    addHtml('ai', `<b>Tarefa concluída:</b> ${escapeHtml(v)}`);
    history.push({ role: 'assistant', content: 'Tarefa concluída: ' + v }); persist();
    log('Tarefa concluída: ' + v.slice(0, 80), 'ok');
    return `TAREFA CONCLUÍDA: ${v}`;
  }
  if (name === 'delete_task') {
    say('Deletando tarefa…');
    const raw = String(arg || '').trim();
    const q = raw.toLowerCase();
    if (!q) throw new Error('informe o texto da tarefa a deletar');
    const all = getTasks();
    let idx = all.findIndex(x => x.text.toLowerCase().includes(q));
    if (idx < 0 && /^\d+$/.test(q)) {
      const pend = all.filter(x => !x.done);
      const p = pend[+q - 1];
      if (p) idx = all.indexOf(p);
    }
    if (idx < 0) {
      return 'TAREFA NÃO ENCONTRADA: nenhuma bate com "' + raw + '".'
        + (all.length ? ' Salvas: ' + all.map((x, i) => `${i + 1}. ${x.text}`).join(' | ') : ' Nenhuma tarefa salva.');
    }
    const v = all[idx].text;
    all.splice(idx, 1);
    store.set('tasks', all); renderTasks();
    try { switchTab('tasks'); } catch {}
    addHtml('ai', `<b>Tarefa deletada:</b> ${escapeHtml(v)}`);
    history.push({ role: 'assistant', content: 'Tarefa deletada: ' + v }); persist();
    log('Tarefa deletada: ' + v.slice(0, 80), 'ok');
    return `TAREFA DELETADA: ${v}`;
  }
  if (name === 'create_note') {
    say('Criando nota…');
    let title = '', text = '';
    const raw = String(arg || '').trim();
    try { const j = JSON.parse(raw); title = String(j.title || ''); text = String(j.text || j.content || ''); } catch { text = raw; }
    if (!text.trim() && !title.trim()) throw new Error('conteúdo da nota vazio');
    const n = createNote(title, text, 'agent');
    say('Nota salva.');
    addHtml('ai', `<b>Nota criada:</b> ${escapeHtml(n.title)}<br><span class="src">aba Notas · peça "editar nota" p/ mudar</span>`);
    history.push({ role: 'assistant', content: 'Nota criada: ' + n.title }); persist();
    return `NOTA CRIADA: ${n.title} — ${n.text.slice(0, 300)}`;
  }
  if (name === 'list_notes') {
    say('Lendo suas notas…');
    const all = getNotes();
    try { switchTab('notes'); } catch {}
    if (!all.length) return 'NOTAS: nenhuma nota salva.';
    return `NOTAS (${all.length}):\n` + all.slice(0, 10).map((n, i) => `${i + 1}. ${n.title}: ${n.text.slice(0, 160)}`).join('\n');
  }
  if (name === 'edit_note') {
    say('Editando nota…');
    let match = '', text = '';
    const raw = String(arg || '').trim();
    try { const j = JSON.parse(raw); match = String(j.match || j.find || ''); text = String(j.text || j.content || ''); } catch { throw new Error('use edit_note {"match":"trecho da nota","text":"novo conteúdo"}'); }
    if (!match || !text) throw new Error('match e text são obrigatórios');
    const all = getNotes();
    const q = match.toLowerCase();
    let n = all.find(x => x.id === match) || all.find(x => (x.title + ' ' + x.text).toLowerCase().includes(q)) || all[+match - 1];
    if (!n) return 'NOTA NÃO ENCONTRADA: nenhuma bate com "' + match + '". Salvas: ' + (all.map((x, i) => `${i + 1}. ${x.title}`).join(' | ') || 'nenhuma');
    n.text = String(text).slice(0, 8000);
    if (!n.title) n.title = n.text.slice(0, 40);
    saveNotes(all);
    try { switchTab('notes'); } catch {}
    addHtml('ai', `<b>Nota editada:</b> ${escapeHtml(n.title)}`);
    history.push({ role: 'assistant', content: 'Nota editada: ' + n.title }); persist();
    log('Nota editada: ' + n.title.slice(0, 80), 'ok');
    return `NOTA EDITADA: ${n.title} — ${n.text.slice(0, 300)}`;
  }
  if (name === 'delete_note') {
    say('Deletando nota…');
    const raw = String(arg || '').trim();
    if (!raw) throw new Error('informe trecho da nota a deletar');
    const all = getNotes();
    const q = raw.toLowerCase();
    let ix = all.findIndex(x => x.id === raw || (x.title + ' ' + x.text).toLowerCase().includes(q));
    if (ix < 0 && /^\d+$/.test(raw)) ix = +raw - 1;
    if (ix < 0 || !all[ix]) return 'NOTA NÃO ENCONTRADA: nenhuma bate com "' + raw + '". Salvas: ' + (all.map((x, i) => `${i + 1}. ${x.title}`).join(' | ') || 'nenhuma');
    const rm = all.splice(ix, 1)[0];
    saveNotes(all);
    try { switchTab('notes'); } catch {}
    addHtml('ai', `<b>Nota deletada:</b> ${escapeHtml(rm.title)}`);
    history.push({ role: 'assistant', content: 'Nota deletada: ' + rm.title }); persist();
    log('Nota deletada: ' + rm.title.slice(0, 80), 'ok');
    return `NOTA DELETADA: ${rm.title}`;
  }
  throw new Error('ferramenta desconhecida: ' + name);
}

/* ───────── MINI-JANELAS DO AGENTE (no chat) ───────── */
function agentWin({ icon = 'activity', title = 'Agente', body = '' }) {
  const d = document.createElement('div');
  d.className = 'awin running mini';
  d.innerHTML = `<div class="awin-head"><span class="awin-ic">${ic(icon)}</span><b>${escapeHtml(title)}</b><span class="awin-spin"></span><span class="awin-actions"><button class="iconbtn" data-aw="min" title="Minimizar">${ic('minus')}</button><button class="iconbtn danger" data-aw="close" title="Fechar">${ic('x')}</button></span></div><div class="awin-body">${body}</div>`;
  $('#messages').appendChild(d);
  $('#messages').scrollTop = 1e6;
  icons();
  d.querySelector('[data-aw="min"]').onclick = () => minimizeAw(d);
  d.querySelector('[data-aw="close"]').onclick = () => closeAw(d);
  return d;
}
function awStep(win, html) {
  if (!win || !win.isConnected) return;
  const b = win.querySelector('.awin-body');
  if (b) { b.innerHTML += html; icons(); $('#messages').scrollTop = 1e6; }
}
function awDone(win, okText) {
  if (!win || !win.isConnected) return;
  win.classList.remove('running');
  win.classList.add('done');
  const s = win.querySelector('.awin-spin');
  if (s) s.outerHTML = ic('check');
  if (okText) awStep(win, `<div class="awline ok">${ic('check')}<span>${escapeHtml(okText)}</span></div>`);
  icons();
  setTimeout(() => minimizeAw(win), 2600);
}
function minimizeAw(win) { if (win && win.isConnected && !win.classList.contains('mini')) win.classList.add('mini'); }
function closeAw(win) { if (win && win.isConnected) { win.classList.add('bye'); setTimeout(() => win.remove(), 320); } }
document.addEventListener('click', e => {
  const min = e.target.closest('.awin.mini');
  if (min && min.querySelector('.awin-head').contains(e.target) && !e.target.closest('[data-aw]')) min.classList.remove('mini');
});
function paintConvBusy() {
  const on = document.querySelector('#convList .conv.on');
  if (on) on.classList.toggle('acting', busyCount > 0);
}

/* ───────── DESTAQUE DA SKILL + NEURÔNIOS ───────── */
function neuralFire(kind, id) { try { if (window.__neuralFire) window.__neuralFire(kind, id); } catch {} }
function flashSkill(slug, go = false) {
  if (!slug) return;
  neuralFire('skill', slug);
  if (!go) return;
  switchTab('skills');
  requestAnimationFrame(() => setTimeout(() => {
    let el = null;
    try { el = document.querySelector(`#skillList .skill[data-slug="${CSS.escape(slug)}"]`); } catch {}
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2600);
  }, 60));
}

/* ───────── MODAL UI (confirmações e entradas premium) ───────── */
let _uiResolve = null;
function _uiClose(val) {
  $('#uiModal').hidden = true;
  if (_uiResolve) { _uiResolve(val); _uiResolve = null; }
}
$('#uiCancel').onclick = () => _uiClose(null);
$('#uiOk').onclick = () => {
  if (!$('#uiArea').hidden) _uiClose($('#uiArea').value);
  else if (!$('#uiInput').hidden) _uiClose($('#uiInput').value);
  else _uiClose(true);
};
$('#uiModal').addEventListener('click', e => { if (e.target === $('#uiModal')) _uiClose(null); });
document.addEventListener('keydown', e => {
  if ($('#uiModal').hidden) return;
  if (e.key === 'Escape') _uiClose(null);
  if (e.key === 'Enter' && $('#uiArea').hidden && document.activeElement && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); $('#uiOk').click(); }
});
function uiDialog({ title = 'Confirmar', message = '', okText = 'Confirmar', input = null, area = null, value = '', placeholder = '' }) {
  return new Promise(resolve => {
    _uiResolve = resolve;
    $('#uiTitle').textContent = title;
    $('#uiMsg').textContent = message;
    $('#uiMsg').style.display = message ? '' : 'none';
    $('#uiOk').textContent = okText;
    const inp = $('#uiInput'), ar = $('#uiArea');
    inp.hidden = input === null; ar.hidden = area === null;
    if (input !== null) { inp.value = value; inp.placeholder = placeholder; setTimeout(() => inp.focus(), 60); }
    if (area !== null) { ar.value = value; ar.placeholder = placeholder; setTimeout(() => ar.focus(), 60); }
    $('#uiModal').hidden = false;
    icons();
  });
}
const uiConfirm = (title, message, okText = 'Confirmar') => uiDialog({ title, message, okText });
const uiPrompt = (title, value = '', placeholder = '', multiline = false) =>
  uiDialog({ title, message: '', okText: 'Salvar', ...(multiline ? { area: true, value, placeholder } : { input: true, value, placeholder }) }).then(v => (typeof v === 'string' ? v : null));
try { bindCodeAgent(); } catch {} // após uiConfirm existir (ask abre modal de verdade)

/* ───────── AGENTES ───────── */
function getAgents() {
  let a = store.get('agents', null);
  if (!a) {
    a = [
      { id: 'a-seed-1', name: 'Pesquisador', icon: 'search', personality: 'Você é um pesquisador objetivo e rigoroso. Priorize precisão, cite fontes quando houver dados e responda em português.', busy: false },
      { id: 'a-seed-2', name: 'Redator', icon: 'pen-line', personality: 'Você é um redator criativo premium. Escreva textos claros, elegantes e bem formatados em português.', busy: false }
    ];
    store.set('agents', a);
  }
  return a.map(x => ({ icon: 'bot', busy: false, ...x }));
}
function getMain() { return Object.assign({ name: 'Prime', personality: 'Você é o agente principal. Coordena a equipe com autonomia e responde em português.' }, store.get('mainAgent', {})); }
function saveAgents(a) { store.set('agents', a); renderAgents(); }
function setAgentBusy(id, val) {
  const all = getAgents();
  const ix = all.findIndex(x => x.id === id);
  if (ix >= 0) { all[ix].busy = !!val; saveAgents(all); }
}
function agentByName(name) {
  const n = String(name || '').toLowerCase().trim();
  return getAgents().find(a => a.name.toLowerCase() === n || a.name.toLowerCase().replace(/\s+/g, '-') === n);
}
function renderAgents() {
  const m = getMain();
  const mc = $('#mainAgentCard');
  if (mc) {
    mc.innerHTML = `<div class="main-agent"><span class="aic">${ic('crown')}</span><div class="agent-txt" style="flex:1;min-width:0"><b>${escapeHtml(m.name)}</b><small>${escapeHtml((m.personality || '').slice(0, 60) || 'sem personalidade definida')}</small></div><button class="iconbtn" id="btnEditMain" title="Editar principal">${ic('pencil')}</button></div>`;
    const eb = $('#btnEditMain');
    if (eb) eb.onclick = () => {
      const mm = getMain();
      $('#mainAgentForm').hidden = false;
      $('#mName').value = mm.name; $('#mPerson').value = mm.personality;
    };
  }
  const box = $('#agentList');
  if (box) {
    box.innerHTML = '';
    getAgents().forEach(a => {
      const d = document.createElement('div');
      d.className = 'agent' + (a.busy ? ' busy' : '');
      d.innerHTML = `<span class="aic">${ic(a.icon || 'bot')}</span><div class="agent-txt"><b>${escapeHtml(a.name)}</b><small>${a.busy ? 'ocupado…' : escapeHtml((a.personality || '').slice(0, 56))}</small></div><span class="adot"></span><button class="iconbtn" data-use="${a.id}" title="Usar no chat">@</button><button class="iconbtn" data-edit="${a.id}" title="Editar">${ic('pencil')}</button><button class="iconbtn danger" data-del="${a.id}" title="Excluir">${ic('trash-2')}</button>`;
      box.appendChild(d);
    });
    $$('#agentList [data-use]').forEach(b => b.onclick = () => {
      const a = getAgents().find(x => x.id === b.dataset.use);
      if (a) { $('#input').value = `@${a.name} `; $('#input').focus(); }
    });
    $$('#agentList [data-edit]').forEach(b => b.onclick = () => openAgentForm(getAgents().find(x => x.id === b.dataset.edit)));
    $$('#agentList [data-del]').forEach(b => b.onclick = async () => {
      const a = getAgents().find(x => x.id === b.dataset.del);
      if (await uiConfirm('Excluir agente', `Remover "${a ? a.name : ''}" da equipe?`, 'Excluir')) {
        saveAgents(getAgents().filter(x => x.id !== b.dataset.del));
      }
    });
  }
  icons();
}
let editingAgent = -1;
function openAgentForm(a = null) {
  $('#agentForm').hidden = false;
  editingAgent = a ? getAgents().findIndex(x => x.id === a.id) : -1;
  $('#aName').value = a?.name || ''; $('#aIcon').value = a?.icon || 'bot'; $('#aPerson').value = a?.personality || '';
}
$('#btnNewAgent').onclick = () => openAgentForm(null);
$('#btnCancelAgent').onclick = () => $('#agentForm').hidden = true;
$('#agentForm').onsubmit = e => {
  e.preventDefault();
  const icon = ($('#aIcon').value.trim().toLowerCase() || 'bot');
  const a = { id: 'a' + Date.now(), name: $('#aName').value.trim() || 'Agente', icon: /^[a-z-]+$/.test(icon) ? icon : 'bot', personality: $('#aPerson').value.trim() || 'Seja útil. Responda em português.', busy: false };
  const all = getAgents();
  if (editingAgent >= 0) { a.id = all[editingAgent].id; a.busy = !!all[editingAgent].busy; all[editingAgent] = a; }
  else all.push(a);
  saveAgents(all); $('#agentForm').hidden = true;
  toast('bot', `Agente <b>${escapeHtml(a.name)}</b> pronto. Use <b>@${escapeHtml(a.name)}</b> no chat.`);
  log('Agente salvo: ' + a.name, 'ok');
};
$('#btnSaveMain').onclick = () => {
  store.set('mainAgent', { name: $('#mName').value.trim() || 'Prime', personality: $('#mPerson').value.trim() });
  $('#mainAgentForm').hidden = true; renderAgents();
  toast('crown', 'Agente principal atualizado.');
};
$('#btnCancelMain').onclick = () => $('#mainAgentForm').hidden = true;
async function runAgent(agent, task) {
  if (agent.id) setAgentBusy(agent.id, true);
  const win = agentWin({ icon: agent.icon || 'bot', title: `${agent.name} · ${String(task).slice(0, 50)}`, body: `<div class="awline">${ic('circle-dot')}<span>Pedido: <b>${escapeHtml(String(task).slice(0, 140))}</b></span></div>` });
  coreBusy(agent.name, String(task).slice(0, 80));
  try {
    const sys = (agent.personality || 'Seja útil.') + '\nResponda em português. Antes de terminar, confira: cumpri exatamente o pedido? Se pedi tocar/baixar/abrir, confirme o que foi executado, não só intenção.';
    const sent = [{ role: 'system', content: sys }, { role: 'user', content: String(task) }];
    awStep(win, `<div class="awline">${ic('chevron-right')}<span>Consultando ${escapeHtml(cfg.model)}…</span></div>`);
    const out = await callLLM(sent);
    trackLLM(sent, out);
    awStep(win, `<div class="awline">${ic('scan-search')}<span>Verificando se terminou: pedido cumprido? links reais?</span></div>`);
    let suffix = '';
    try {
      const { verifyFinal } = await import('./verifiers.js');
      const v = verifyFinal(out, { toolOutputs: [], usedTool: false, toolsUsed: [], userText: String(task) });
      if (!v.ok) suffix = `<br><span class="src">pendente: ${escapeHtml(v.pending.map(p => p.reason).join(' | '))}</span>`;
    } catch {}
    addMsg('ai', out + suffix, `<span class="src">agente ${escapeHtml(agent.name)} · ${PROVIDERS[cfg.provider].label} · ${escapeHtml(cfg.model)}</span>`);
    history.push({ role: 'assistant', content: `[${agent.name}] ${out}` });
    persist();
    awDone(win, suffix ? 'Entregue com pendência explícita.' : `Entregue: ${out.slice(0, 80)}…`);
    log(`Agente ${agent.name}: ${String(task).slice(0, 60)}`, suffix ? 'warn' : 'ok');
    return out;
  } catch (e) {
    awDone(win, 'Não consegui: ' + String(e.message).slice(0, 100));
    addHtml('ai', `O agente <b>${escapeHtml(agent.name)}</b> não conseguiu: ${escapeHtml(e.message)}`);
    return null;
  } finally {
    if (agent.id) setAgentBusy(agent.id, false);
    coreIdle();
  }
}
async function teamFlow(task) {
  const main = getMain();
  const parts = String(task).split(/\n|;/).map(s => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(s => s.length > 1);
  const subs = (parts.length > 1 ? parts : [task]).slice(0, 6);
  const free = getAgents().filter(a => !a.busy);
  const team = free.length ? free : [{ name: main.name, icon: 'crown', personality: main.personality, id: null }];
  coreBusy('Equipe em ação', subs.length + ' frentes');
  coreWindow({ icon: 'bot', title: 'Equipe ' + main.name, body: `Dividindo em <b>${subs.length}</b> frentes entre os agentes livres.` });
  const results = [];
  for (let i = 0; i < subs.length; i++) {
    const ag = team[i % team.length];
    const out = await runAgent(ag, subs[i]);
    results.push(`[Frente ${i + 1} · ${ag.name}]: ${out || '(falhou)'}`);
  }
  let final = results.join('\n\n');
  try {
    final = await callLLM([
      { role: 'system', content: main.personality + '\nVocê coordenou a equipe. Sintetize os resultados das frentes abaixo numa resposta final única, direta e em português.' },
      { role: 'user', content: 'Tarefa original: ' + task + '\n\nResultados das frentes:\n' + results.join('\n\n') }
    ]);
    trackLLM([{ role: 'system', content: 'síntese da equipe' }, { role: 'user', content: results.join(' ').slice(0, 3000) }], final);
  } catch {}
  addMsg('ai', final, `<span class="src">equipe ${escapeHtml(main.name)} · ${subs.length} frentes sintetizadas</span>`);
  history.push({ role: 'assistant', content: final });
  persist();
  coreIdle();
  return true;
}

/* ───────── TABS / LOG / TOAST / EXPORT ───────── */
function switchTab(name) {
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  ['routines', 'music', 'skills', 'tasks', 'reminders', 'log', 'notes', 'extra1', 'extra2'].forEach(t => $('#tab-' + t).hidden = t !== name);
}
$$('.tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

function log(msg, kind = 'info', detail = '') {
  const arr = store.get('log', []);
  arr.unshift({ ts: new Date().toLocaleString('pt-BR'), iso: new Date().toISOString(), msg: String(msg || ''), kind, detail: String(detail || '').slice(0, 4000) });
  store.set('log', arr.slice(0, 300));
  renderLog();
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      return !!ok;
    } catch { return false; }
  }
}
function logFilter() { try { return ($('#logFilter') || {}).value || 'all'; } catch { return 'all'; } }
function renderLog() {
  const f = logFilter();
  const all = store.get('log', []);
  const items = all.map((l, i) => ({ ...l, i })).filter(l => f === 'all' || l.kind === f || (f === 'warn' && (l.kind === 'warn' || l.kind === 'error')));
  $('#execLog').innerHTML = items.map(l =>
    `<div class="logitem ${l.kind}"><div class="logline"><span class="logtxt">${escapeHtml(l.ts)} — ${escapeHtml(l.msg)}</span><button class="iconbtn logcopy" data-logcopy="${l.i}" title="Copiar este erro/log">${ic('copy')}copiar</button></div>${l.detail ? `<details class="logdet"><summary>detalhes</summary><pre>${escapeHtml(l.detail)}</pre></details>` : ''}</div>`).join('') || '<p class="hint">Nada aqui ainda.</p>';
  $$('#execLog [data-logcopy]').forEach(b => b.onclick = async () => {
    const e = store.get('log', [])[+b.dataset.logcopy];
    if (!e) return;
    const txt = `[${e.iso || e.ts}] [${e.kind}] ${e.msg}${e.detail ? '\n' + e.detail : ''}`;
    const okCp = await copyText(txt);
    toast(okCp ? 'check' : 'x', okCp ? '<b>Log copiado.</b>' : 'Falha ao copiar.');
  });
  renderTraces();
}
function renderTraces() {
  const box = $('#traceLog');
  if (!box) return;
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem('nexus:trace-v2') || '[]'); } catch {}
  box.innerHTML = arr.slice(0, 50).map(t =>
    `<div class="logitem ${t.ok === false ? 'warn' : 'info'}">${escapeHtml(t.at || '')} · <b>${escapeHtml(t.kind || '?')}</b>${t.tool ? ' · ' + escapeHtml(t.tool) : ''}${t.model ? ' · ' + escapeHtml(t.model) : ''}${t.ms ? ' · ' + t.ms + 'ms' : ''}${t.err ? ' · ' + escapeHtml(t.err) : ''}${t.pending ? ' · pend: ' + escapeHtml([].concat(t.pending).join(',')).slice(0, 120) : ''}</div>`).join('') || '<p class="hint">Sem traces do agente ainda.</p>';
}
try { $('#logFilter').onchange = renderLog; } catch {}
$('#btnClearLog').onclick = () => { store.set('log', []); try { localStorage.setItem('nexus:trace-v2', '[]'); } catch {} renderLog(); };
$('#btnCopyLog').onclick = async () => {
  const f = logFilter();
  const txt = store.get('log', [])
    .filter(l => f === 'all' || l.kind === f || (f === 'warn' && (l.kind === 'warn' || l.kind === 'error')))
    .map(l => `[${l.iso || l.ts}] [${l.kind}] ${l.msg}${l.detail ? '\n' + l.detail : ''}`).join('\n---\n') || '(log vazio)';
  const okCp = await copyText(txt);
  toast(okCp ? 'check' : 'x', okCp ? '<b>Log copiado.</b>' : 'Falha ao copiar.');
};
/* Captura global: qualquer erro JS ou promessa rejeitada cai no Log com stack copiável. */
window.addEventListener('error', e => {
  try { log('Erro JS: ' + (e.message || 'desconhecido'), 'warn', ((e.filename || '') + (e.lineno ? ':' + e.lineno + ':' + (e.colno || 0) : '') + '\n' + ((e.error && e.error.stack) || '')).slice(0, 4000)); } catch {}
});
window.addEventListener('unhandledrejection', e => {
  try {
    const r = e.reason;
    log('Promessa rejeitada: ' + String((r && r.message) || r).slice(0, 200), 'warn', String((r && r.stack) || r).slice(0, 4000));
  } catch {}
});
try {
  $('#btnExportLog').onclick = () => {
    const data = { exportedAt: new Date().toISOString(), log: store.get('log', []), traces: JSON.parse(localStorage.getItem('nexus:trace-v2') || '[]') };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'myos-log.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
} catch {}
function toast(icon, html) {
  const d = document.createElement('div');
  d.className = 'toast'; d.innerHTML = `${ic(icon || 'bell')}<span>${html}</span>`;
  $('#toasts').appendChild(d);
  icons();
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 400); }, 4200);
}
$('#btnExport').onclick = () => {
  const safeKeys = {}; Object.keys(keys || {}).forEach(k => safeKeys[k] = '');
  const data = { cfg: { provider: cfg.provider, model: cfg.model, temperature: cfg.temperature, maxTokens: cfg.maxTokens }, keys: safeKeys, routines: getRoutines(), skills: getSkills(), tasks: getTasks(), reminders: getReminders(), convs: getConvs(), exportedAt: new Date().toISOString(), harness: 'v2' };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'myos-backup.json'; a.click();
  toast('download', 'Backup exportado.');
};
$('#btnImport').onclick = () => $('#importFile').click();
$('#importFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try {
    const j = JSON.parse(r.result);
    if (j.routines) store.set('routines', j.routines);
    if (j.skills) store.set('skills', j.skills);
    if (j.tasks) store.set('tasks', j.tasks);
    if (j.keys) Object.assign(keys, j.keys), store.set('keys', keys);
    if (j.reminders) store.set('reminders', j.reminders);
    if (j.convs && j.convs.length) { store.set('convs', j.convs); loadConv(j.convs[0].id); }
    renderAll(); toast('upload', 'Backup importado.');
  } catch { toast('x', 'Arquivo inválido.'); } };
  r.readAsText(f);
};

/* ───────── SAUDAÇÃO DO DIA (header) ───────── */
function greetLeadLocal() {
  const h = new Date().getHours();
  return 'Olá, ' + (h < 6 ? 'boa madrugada' : h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite');
}
function greetFallback() { return 'dia tranquilo por aqui. Se precisar de algo, é só falar.'; }
function greetApply(sub) {
  greetLead = greetLeadLocal();
  greetSub = sub;
  if (busyCount === 0) setCoreState(greetLead, greetSub);
}
function greetFp(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); }
async function bootGreeting() {
  const day = new Date().toDateString();
  const cached = store.get('greet', null);
  const tasks = getTasks().filter(t => !t.done).map(t => t.text);
  const rems = getReminders().filter(r => !(r.repeat === 'once' && r.done)).map(r => `${r.time} ${r.text}${r.repeat === 'daily' ? ' (todo dia)' : ''}`);
  const notes = getNotes().slice(0, 6).map(n => n.title + ': ' + (n.text || '').slice(0, 100));
  const fp = greetFp(tasks.join('|') + '#' + rems.join('|') + '#' + notes.join('#'));
  const hit = cached && cached.day === day && cached.fp === fp && cached.sub;
  greetApply(hit ? cached.sub : greetFallback());
  if (hit) return;
  try {
    const ctx = [
      `Agora: ${new Date().toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`,
      `Tarefas pendentes (${tasks.length}): ${tasks.slice(0, 8).join(' | ') || 'nenhuma'}.`,
      `Lembretes (${rems.length}): ${rems.slice(0, 6).join(' | ') || 'nenhum'}.`,
      `Notas (${notes.length}): ${notes.join(' | ') || 'nenhuma'}.`
    ].join('\n');
    const out = await callLLM([
      { role: 'system', content: 'Você é o assistente do My OS, um orquestrador local que conhece o dia do usuário. Escreva UMA saudação inicial em pt-BR para o topo do app, no máximo 2 frases e ~220 caracteres, tom gentil, respeitoso, natural e discreto, sem emojis, sem markdown, sem aspas, sem listas, sem travessões. Regras: (1) Não comece com "Olá", a interface já mostra "Olá, bom dia/boa tarde/boa noite". (2) Se houver tarefas pendentes, resuma de forma gentil e curta quantas são e o essencial delas. (3) Inclua os lembretes do dia com horário quando forem relevantes. (4) Olhe as notas e, se alguma aponta algo que o usuário não deve esquecer hoje (um vídeo a gravar, um compromisso, um projeto), mencione isso de forma natural. (5) Nunca copie os dados crus um a um; reescreva com contexto e bom senso. (6) Se não houver nada relevante, diga exatamente: dia tranquilo por aqui. Se precisar de algo, é só falar. (7) Não confirme dados, não dê instruções, não pergunte nada.' },
      { role: 'user', content: ctx }
    ], { maxTokens: 140, temperature: 0.6, noTools: true });
    let sub = String(out || '').trim()
      .replace(/^["'\s]+|["'\s]+$/g, '')
      .replace(/\*\*/g, '')
      .replace(/\s*[—–]+\s*/g, '. ')
      .replace(/\.{2,}/g, '.')
      .split('\n')[0].trim().slice(0, 260);
    if (sub.length < 8) sub = greetFallback();
    greetApply(sub);
    store.set('greet', { day, fp, sub });
    log('Saudação do dia atualizada.', 'info');
  } catch {
    greetApply(greetFallback());
  }
}

function renderAll() { renderConvs(); renderReminders(); renderCustomChips(); renderAgents(); renderRoutines(); renderSkills(); renderSideSkills(); renderTasks(); renderNotes(); renderLog(); refreshKeyField(); updateConn(); applyBackground(); icons(); }
renderAll();
icons();
askNotify()
bootGreeting();
