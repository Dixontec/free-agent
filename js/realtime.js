/* Free Agent · Conversa em tempo real (módulo ISOLADO — voice.js continua intacto).
   Mãos livres, sem custo extra e sem API externa de voz:
     mic → VAD (detecta fim da fala) → Whisper local (transformers.js, mesmo modelo/cache do voice.js)
         → LLM do provedor ativo em STREAMING → quebra em sentenças → TTS toca a 1ª frase
           assim que ela fecha, sem esperar a resposta inteira.
   Interromper (barge-in): falar por cima da voz do agente corta o áudio e aborta o stream.
   TTS: 'browser' (speechSynthesis, zero setup) ou 'http' (servidor local OpenAI-compatível,
   ex.: Kokoro-FastAPI em http://localhost:8880/v1/audio/speech).
   Atalho: Alt+V · botão ao lado do microfone · Esc encerra.
   Depende só de globais já existentes do app.js (cfg, keys, PROVIDERS, history, addMsg…).
   Se algo faltar, o módulo desativa a si mesmo — nada do resto quebra. */
'use strict';
(function () {
  const $ = s => document.querySelector(s);
  const DEF = {
    endMs: 500,                 // silêncio que encerra a fala
    sttModel: 'Xenova/whisper-base',
    tts: 'auto',                // 'auto' (servidor local > navegador > neural local) | 'browser' | 'local' | 'http' (Kokoro)
    voiceName: '',              // voz escolhida (engine browser)
    rate: 1.05,
    ttsUrl: 'http://127.0.0.1:8880/v1/audio/speech',
    ttsModel: 'kokoro', ttsVoice: 'pf_dora',
    maxTokens: 300,
  };
  let LIB = null;               // transformers.js compartilhado (STT + TTS local)
  const lib = () => LIB || (LIB = import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm'));
  const C = Object.assign({}, DEF, (() => { try { return JSON.parse(localStorage.getItem('nexus:rt') || '{}'); } catch { return {}; } })());
  const S = { on: false, state: 'off', stream: null, ac: null, node: null, src: null, transcriber: null, loading: null,
    pre: [], utt: null, voiced: 0, quiet: 0, floor: 0.005, nf: 0, sr: 48000, uttId: 0, turn: 0, abort: null, bubble: null, tm: {} };

  const ok = () => typeof cfg !== 'undefined' && typeof keys !== 'undefined' && typeof PROVIDERS !== 'undefined' && typeof history !== 'undefined' && typeof addMsg === 'function';
  const note = (icon, html) => { try { toast(icon, html); } catch {} };
  const lg = (m, k, d) => { try { log(m, k || 'info', d || ''); } catch {} };

  /* ───────── UI (Branco premium minimalista) ───────── */
  const STATES = {
    loading: ['#ff9500', 'Carregando voz local…'],
    listening: ['#34c759', 'Ouvindo — pode falar'],
    hearing: ['#0071e3', 'Ouvindo você…'],
    transcribing: ['#7d2aff', 'Transcrevendo…'],
    thinking: ['#7d2aff', 'Pensando…'],
    speaking: ['#0071e3', 'Falando — fale p/ interromper'],
  };
  function updateLevelMeter(rms, thr) {
    const l = $('#rtLvl'); if (!l) return;
    const ratio = Math.min(1, Math.max(0, rms / (thr * 2.2)));
    const bars = l.querySelectorAll('span');
    bars.forEach((b, i) => {
      const h = Math.round(4 + ratio * (7 + i * 2));
      b.style.height = (ratio > 0.12 ? h : 4) + 'px';
      b.style.opacity = ratio > 0.12 ? String(0.35 + ratio * 0.65) : '0.2';
    });
  }
  function ui() {
    if ($('#rtPill')) return;
    const st = document.createElement('style');
    st.textContent = `#rtPill{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9998;display:inline-flex;align-items:center;gap:12px;padding:8px 16px 8px 14px;border-radius:999px;background:#ffffff;backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#1d1d1f;font:500 13px -apple-system,BlinkMacSystemFont,"SF Pro Display","Inter",sans-serif;box-shadow:0 16px 44px rgba(0,0,0,.09),0 2px 6px rgba(0,0,0,.04);letter-spacing:-0.01em;user-select:none;transition:box-shadow .2s ease}
#rtPill[hidden]{display:none!important}
#rtPill i.rtd{width:8px;height:8px;border-radius:50%;background:#34c759;flex-shrink:0;box-shadow:0 0 0 3px rgba(52,199,89,.2);transition:background .2s ease,box-shadow .2s ease;animation:rtp 1.6s ease-in-out infinite}
#rtPill #rtTxt{font-weight:500;color:#1d1d1f;white-space:nowrap}
#rtPill #rtLvl{display:inline-flex;align-items:center;gap:2.5px;height:14px;padding:0 2px}
#rtPill #rtLvl span{display:inline-block;width:2.5px;height:4px;border-radius:2px;background:#1d1d1f;opacity:.2;transition:height .08s ease,opacity .08s ease}
#rtPill button#rtStop{all:unset;cursor:pointer;font-size:11.5px;font-weight:500;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.04);color:#6e6e73;border:1px solid rgba(0,0,0,.06);transition:all .15s ease}
#rtPill button#rtStop:hover{background:rgba(0,0,0,.08);color:#1d1d1f}
@keyframes rtp{0%,100%{transform:scale(1)}50%{transform:scale(1.25);opacity:.85}}
#btnRealtime.live{color:#0071e3}
#btnVoice{display:none!important}`; // o botão de ditado antigo some; só fica o de conversa em tempo real
    document.head.appendChild(st);
    const p = document.createElement('div'); p.id = 'rtPill'; p.hidden = true;
    p.innerHTML = '<i class="rtd"></i><span id="rtTxt"></span><span id="rtLvl"><span></span><span></span><span></span><span></span></span><button type="button" id="rtStop">Encerrar · Esc</button>';
    document.body.appendChild(p);
    $('#rtStop').onclick = () => stop();
    p.addEventListener('click', e => {
      // Clique no corpo do pill durante fala encerra a fala instantaneamente (barge-in rápido manual)
      if (e.target !== $('#rtStop') && S.state === 'speaking') {
        interrupt();
      }
    });
    const wrap = $('.voice-wrap');
    if (wrap && !$('#btnRealtime')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'btnRealtime'; b.className = 'btn ghost icon-only'; b.setAttribute('aria-label', 'Conversa por voz (Alt+V)');
      const tip = $('#voiceTip'); if (tip) tip.textContent = 'Conversa por voz · Alt+V';
      b.innerHTML = '<i data-lucide="audio-lines"></i>';
      b.onclick = toggle;
      wrap.appendChild(b);
      try { window.lucide && lucide.createIcons(); } catch {}
    }
  }
  function setState(s, txt) {
    S.state = s;
    const p = $('#rtPill'); if (!p) return;
    p.hidden = s === 'off';
    const d = STATES[s];
    if (d) {
      const dot = p.querySelector('.rtd');
      if (dot) {
        dot.style.background = d[0];
        dot.style.boxShadow = `0 0 0 3px ${d[0]}28`;
      }
      $('#rtTxt').textContent = txt || d[1];
    }
    const b = $('#btnRealtime'); if (b) b.classList.toggle('live', s !== 'off');
  }

  /* ───────── STT (Whisper local, mesmo modelo/cache do voice.js) ───────── */
  async function loadSTT() {
    if (S.transcriber) return S.transcriber;
    if (S.loading) return S.loading;
    S.loading = (async () => {
      const { pipeline } = await lib();
      const seen = {};
      const prog = p => {
        if (p.status === 'progress' && p.total) {
          seen[p.file] = (p.loaded / p.total) * 100;
          const f = Object.keys(seen);
          setState('loading', `Baixando voz local ${Math.round(f.reduce((a, k) => a + seen[k], 0) / f.length)}%…`);
        }
      };
      let tr;
      try { tr = await pipeline('automatic-speech-recognition', C.sttModel, { progress_callback: prog }); }
      catch { tr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { progress_callback: prog }); }
      try { await tr(new Float32Array(16000), { language: 'portuguese', task: 'transcribe' }); } catch {} // aquece o wasm → 1º turno rápido
      S.transcriber = tr; return tr;
    })();
    try { return await S.loading; } finally { S.loading = null; }
  }
  function resample16k(f32, sr) {
    if (sr === 16000) return f32;
    const ratio = sr / 16000, n = Math.floor(f32.length / ratio), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * ratio, i0 = Math.floor(x), i1 = Math.min(i0 + 1, f32.length - 1), t = x - i0;
      out[i] = f32[i0] * (1 - t) + f32[i1] * t;
    }
    return out;
  }
  const JUNK = /^(obrigad[oa]\.?|tchau\.?|legendas?.*|\.+|…|you\.?|thanks for watching.*|\[.*\]|\(.*\))$/i; // alucinações típicas do Whisper em ruído
  async function transcribe(chunks) {
    let n = 0; chunks.forEach(c => n += c.length);
    const all = new Float32Array(n); let o = 0; chunks.forEach(c => { all.set(c, o); o += c.length; });
    const pcm = resample16k(all, S.sr);
    if (S.srv && S.srv.stt) {                               // faster-whisper local: bem mais rápido que o Whisper do navegador
      try {
        const i16 = new Int16Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) i16[i] = Math.max(-1, Math.min(1, pcm[i])) * 32767;
        const r = await fetch(srvBase() + '/stt', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: i16.buffer });
        if (!r.ok) throw new Error('STT ' + r.status);
        return String((await r.json()).text || '').trim();
      } catch (e) { lg('STT do servidor falhou, usando o do navegador: ' + ((e && e.message) || e), 'warn'); S.srv.stt = false; }
    }
    const tr = await loadSTT();
    const out = await tr(pcm, { language: 'portuguese', task: 'transcribe' });
    return String(out.text || '').trim();
  }

  /* ───────── VAD (energia adaptativa) + captura via AudioWorklet ───────── */
  const WORKLET = `class RT extends AudioWorkletProcessor{constructor(){super();this.b=[];this.n=0;this.need=Math.round(sampleRate*0.02)}
process(i){const c=i[0]&&i[0][0];if(!c)return true;this.b.push(new Float32Array(c));this.n+=c.length;
if(this.n>=this.need){const o=new Float32Array(this.n);let k=0;for(const x of this.b){o.set(x,k);k+=x.length}this.b=[];this.n=0;
let s=0;for(let j=0;j<o.length;j++)s+=o[j]*o[j];this.port.postMessage({pcm:o,rms:Math.sqrt(s/o.length)},[o.buffer])}return true}}
registerProcessor('rt-cap',RT);`;

  function onFrame(pcm, rms) {
    if (!S.on) return;
    const isSpeaking = S.state === 'speaking';
    const isThinking = S.state === 'thinking';
    const thr = Math.max(0.007, S.floor * 2.8) * (isSpeaking ? 1.4 : 1);
    if (++S.nf % 3 === 0) updateLevelMeter(rms, thr);
    const loud = rms > thr;
    if (!S.utt) {
      S.pre.push(pcm); if (S.pre.length > 15) S.pre.shift();
      if (!loud) S.floor = Math.max(0.002, S.floor * 0.95 + rms * 0.05);
      if (loud) S.voiced++; else S.voiced = Math.max(0, S.voiced - 1);
      // Se o agente estiver falando ou pensando, 4 frames (~80ms) de fala já ativam o barge-in na hora!
      if (S.voiced >= (isSpeaking ? 4 : 5)) {
        S.utt = S.pre.slice(); S.pre = []; S.quiet = 0; S.nVoiced = S.voiced; S.t0 = performance.now();
        if (isSpeaking || isThinking) {
          interrupt(); // Corta imediatamente a leitura e o som!
        }
        setState('hearing');
      }
      return;
    }
    S.utt.push(pcm);
    if (loud) { S.quiet = 0; S.nVoiced++; } else S.quiet++;
    const dur = S.utt.length * 20;
    if (S.quiet * 20 >= C.endMs || dur > 30000) {
      const chunks = S.utt, voiced = S.nVoiced * 20;
      S.utt = null; S.voiced = 0; S.pre = [];
      S.tm = { end: performance.now() - C.endMs };
      if (voiced < 220) { setState('listening'); return; }  // ignora estalo/ruído muito curto
      handleUtterance(chunks);
    }
  }

  async function handleUtterance(chunks) {
    const id = ++S.uttId;
    setState('transcribing');
    let text = '';
    try { text = await transcribe(chunks); }
    catch (e) { lg('Realtime STT falhou: ' + ((e && e.message) || e), 'warn'); if (S.on && id === S.uttId) setState('listening'); return; }
    if (!S.on || id !== S.uttId) return;                    // fala mais nova assumiu
    S.tm.stt = performance.now();
    console.info('[realtime] transcrito:', JSON.stringify(text));
    if (!text || JUNK.test(text)) { setState('listening'); return; }
    runTurn(text);
  }

  /* ───────── LLM em streaming ───────── */
  async function* lines(resp) {
    const rd = resp.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) { yield buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); }
    }
    if (buf) yield buf;
  }
  async function streamLLM(messages, signal, onDelta) {
    const p = cfg.provider, key = keys[p], kind = PROVIDERS[p].kind, temp = cfg.temperature, max = Math.min(cfg.maxTokens || 2048, C.maxTokens);
    const baseEl = $('#baseUrl'), baseVal = baseEl ? baseEl.value.trim() : '';
    const J = { 'Content-Type': 'application/json' };
    const bad = async (r, tag) => { throw new Error(tag + ' ' + r.status + ': ' + (await r.text()).slice(0, 200)); };
    if (kind === 'gemini') {
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
      const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
        { method: 'POST', headers: J, signal, body: JSON.stringify({ system_instruction: sys ? { parts: [{ text: sys }] } : undefined, contents, generationConfig: { temperature: temp, maxOutputTokens: max } }) });
      if (!r.ok) await bad(r, 'Gemini');
      for await (const l of lines(r)) {
        if (!l.startsWith('data:')) continue;
        try { const t = (JSON.parse(l.slice(5)).candidates?.[0]?.content?.parts || []).map(x => x.text || '').join(''); if (t) onDelta(t); } catch {}
      }
    } else if (kind === 'anthropic') {
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
      const r = await fetch(PROVIDERS.anthropic.url, { method: 'POST', signal,
        headers: { ...J, 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: cfg.model, max_tokens: max, stream: true, system: sys || undefined, messages: messages.filter(m => m.role !== 'system') }) });
      if (!r.ok) await bad(r, 'Anthropic');
      for await (const l of lines(r)) {
        if (!l.startsWith('data:')) continue;
        try { const j = JSON.parse(l.slice(5)); if (j.type === 'content_block_delta' && j.delta?.text) onDelta(j.delta.text); } catch {}
      }
    } else if (kind === 'ollama') {
      const base = (baseVal || 'http://localhost:11434').replace(/\/$/, '');
      const r = await fetch(base + '/api/chat', { method: 'POST', headers: J, signal,
        body: JSON.stringify({ model: cfg.model, stream: true, options: { temperature: temp, num_predict: max }, messages }) });
      if (!r.ok) await bad(r, 'Ollama');
      for await (const l of lines(r)) { if (!l.trim()) continue; try { const t = JSON.parse(l).message?.content; if (t) onDelta(t); } catch {} }
    } else { // OpenAI-compatível: OpenAI, Groq, OpenRouter, LM Studio
      let url = PROVIDERS[p].url; const h = { ...J };
      if (key) h.Authorization = 'Bearer ' + key;
      if (p === 'openrouter') { url = baseVal || url; h['HTTP-Referer'] = location.href; h['X-Title'] = 'Free Agent Harness'; }
      if (p === 'lmstudio') {
        let b = (baseVal || cfg.baseUrl || url || 'http://localhost:1234/v1').replace(/\/$/, '');
        url = /\/chat\/completions$/.test(b) ? b : b + '/chat/completions';
      }
      const r = await fetch(url, { method: 'POST', headers: h, signal, body: JSON.stringify({ model: cfg.model, temperature: temp, max_tokens: max, messages, stream: true }) });
      if (!r.ok) await bad(r, PROVIDERS[p].label);
      for await (const l of lines(r)) {
        if (!l.startsWith('data:')) continue;
        const d = l.slice(5).trim(); if (d === '[DONE]') break;
        try { const t = JSON.parse(d).choices?.[0]?.delta?.content; if (t) onDelta(t); } catch {}
      }
    }
  }

  /* ───────── texto → sentenças falaveis ───────── */
  class Chunker {
    constructor() { this.buf = ''; this.first = true; this.think = false; this.fence = false; }
    clean(t) { // tira markdown/emoji/URL; ignora <think> e blocos de código
      return t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, 'link').replace(/[*_#>`~|]+/g, '')
        .replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ');
    }
    push(raw) {
      let t = raw;
      if (this.think) { const e = t.indexOf('</think>'); if (e < 0) return []; this.think = false; t = t.slice(e + 8); }
      const s = t.indexOf('<think>'); if (s >= 0) { const e = t.indexOf('</think>', s); if (e < 0) { this.think = true; t = t.slice(0, s); } else t = t.slice(0, s) + t.slice(e + 8); }
      if (t.includes('```')) { const parts = t.split('```'); t = parts.map((x, i) => ((i % 2 === 0) !== this.fence ? x : '')).join(' '); this.fence = this.fence !== (parts.length % 2 === 0); }
      else if (this.fence) return [];
      this.buf += t; return this.drain(false);
    }
    drain(final) {
      const out = [];
      for (;;) {
        const re = this.first ? /([.!?…]+["')\]]?|\n+|[,;:—–]) /g : /([.!?…]+["')\]]?|\n+)(\s|$)/g;
        const minLen = this.first ? 14 : 45; let m, cut = -1;
        re.lastIndex = 0;
        while ((m = re.exec(this.buf))) {
          const end = m.index + m[1].length;
          if (this.buf.slice(0, end).trim().length >= minLen || (!this.first && /[.!?…]/.test(m[1]) && this.buf.slice(0, end).trim().length >= 24)) { cut = end; break; }
        }
        if (cut < 0) break;
        const s = this.clean(this.buf.slice(0, cut)).trim(); this.buf = this.buf.slice(cut);
        if (s) { out.push(s); this.first = false; }
      }
      if (final) { const s = this.clean(this.buf).trim(); this.buf = ''; if (s) out.push(s); }
      return out;
    }
    flush() { return this.drain(true); }
  }

  /* ───────── TTS em fila: 'browser' (vozes do sistema) · 'local' (neural pt no navegador, sem instalar) · 'http' (Kokoro etc.) ───────── */
  const bVoices = () => { try { return speechSynthesis.getVoices() || []; } catch { return []; } };
  const engine = () => C.tts === 'auto' ? (S.srv && S.srv.tts ? 'http' : bVoices().length ? 'browser' : 'local') : C.tts;
  /* servidor de voz local (voice-server/voice_server.py): Kokoro TTS + faster-whisper STT */
  const srvBase = () => String(C.ttsUrl || '').replace(/\/v1\/audio\/speech.*$/, '').replace(/\/$/, '');
  async function probe() {
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 900);
      const r = await fetch(srvBase() + '/health', { signal: ac.signal }); clearTimeout(t);
      const j = await r.json(); S.srv = j && j.ok ? j : null;
    } catch { S.srv = null; }
    return S.srv;
  }
  async function loadLocalTTS(onProg) {
    if (S.localTTS) return S.localTTS;
    if (S.localTTSP) return S.localTTSP;
    S.localTTSP = (async () => {
      const { pipeline } = await lib();
      const seen = {};
      const prog = p => { if (p.status === 'progress' && p.total) { seen[p.file] = (p.loaded / p.total) * 100; const f = Object.keys(seen); onProg && onProg(Math.round(f.reduce((a, k) => a + seen[k], 0) / f.length)); } };
      const t = await pipeline('text-to-speech', 'Xenova/mms-tts-por', { progress_callback: prog });
      S.localTTS = t; return t;
    })();
    try { return await S.localTTSP; } finally { S.localTTSP = null; }
  }
  const TTS = {
    pending: 0, gen: 0, ctx: null, next: 0, srcs: [], chain: Promise.resolve(), onDrain: null, firstAudio: null,
    get busy() { return this.pending > 0; },
    done() { this.pending = Math.max(0, this.pending - 1); if (!this.pending && this.onDrain) this.onDrain(); },
    started() { if (this.firstAudio) { const f = this.firstAudio; this.firstAudio = null; f(); } },
    say(text) {
      this.pending++; const g = this.gen, e = engine();
      if (e === 'http') return this.sayBuf(g, fetch(C.ttsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: C.ttsModel, input: text, voice: C.ttsVoice, speed: C.rate, response_format: 'wav' }) })
        .then(r => { if (!r.ok) throw new Error('TTS ' + r.status); return r.arrayBuffer(); }).then(ab => this.ctx0().decodeAudioData(ab)), true);
      if (e === 'local') return this.sayBuf(g, null, false, text);
      try {
        const vs = bVoices();
        if (!vs.length && !this.warned) { this.warned = true; lg('Realtime: o navegador não tem voz de TTS. Em Configurações → Voz escolha "Neural local".', 'warn'); note('volume-x', 'Sem voz no navegador — escolha outra em Configurações → Voz.'); }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR'; u.rate = C.rate;
        const v = vs.find(v => v.name === C.voiceName) || vs.find(v => /pt[-_]BR/i.test(v.lang)) || vs.find(v => /^pt/i.test(v.lang)); if (v) { u.voice = v; u.lang = v.lang; }
        u.onstart = () => { if (g === this.gen) this.started(); };
        u.onend = u.onerror = () => { if (g === this.gen) this.done(); };
        speechSynthesis.speak(u);
      } catch { this.done(); }
    },
    ctx0() { return this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); },
    // enfileira um AudioBuffer: http busca em paralelo (prefetch); local sintetiza em série; toca em ordem no relógio do AudioContext
    sayBuf(g, bufP, _par, text) {
      const run = async () => {
        try {
          if (g !== this.gen) return;
          let buf;
          if (bufP) buf = await bufP;
          else {
            const t = await loadLocalTTS(); if (g !== this.gen) return;
            const o = await t(text);
            buf = this.ctx0().createBuffer(1, o.audio.length, o.sampling_rate); buf.copyToChannel(o.audio, 0);
          }
          if (g !== this.gen) return;
          const ctx = this.ctx0(); if (ctx.state === 'suspended') await ctx.resume();
          const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
          const at = Math.max(ctx.currentTime + 0.02, this.next); this.next = at + buf.duration;
          src.onended = () => { this.srcs = this.srcs.filter(x => x !== src); if (g === this.gen) this.done(); };
          this.srcs.push(src); src.start(at); this.started();
        } catch (e) { lg('TTS falhou: ' + ((e && e.message) || e), 'warn'); if (g === this.gen) this.done(); }
      };
      this.chain = this.chain.then(run);
    },
    cancel() {
      this.gen++; this.pending = 0; this.next = 0; this.firstAudio = null; this.onDrain = null; this.chain = Promise.resolve();
      try { speechSynthesis.cancel(); } catch {}
      this.srcs.forEach(s => {
        try { s.stop(0); } catch {}
        try { s.disconnect(); } catch {}
      });
      this.srcs = [];
    },
  };

  /* ───────── turno: texto → (ação | stream → fala) ───────── */
  // Pedidos que precisam de ferramentas/dados do app (tarefas, notas, memória, conversas, web, música…) vão direto
  // pelo MESMO pipeline do chat de texto (v2: executa → verifica → entrega). O resto é conversa: streaming + fala.
  const B = '(?<![\\wÀ-ÿ])', E = '(?![\\wÀ-ÿ])';
  const ACTION_RE = new RegExp(B + '(?:tarefas?|notas?|anota\\w*|mem[óo]ria|lembra\\w*|lembrete\\w*|esquece\\w*|conversas?|hist[óo]rico|pesquis\\w*|busc\\w*|procur\\w*|not[íi]cias?|abr(?:e|ir)|acess\\w*|toca(?:r)?|toque|m[úu]sica\\w*|v[íi]deo\\w*|youtube|baix\\w*|download|skills?|rotinas?|arquivos?|c[óo]digo|pasta|execut\\w*|rod(?:e|ar)|cri(?:e|ar|a)|adicion\\w*|apag\\w*|delet\\w*|exclu\\w*|conclu\\w*|marc(?:a|ar)|list(?:a|ar)|mostr\\w*|ler|leia|lê|edit\\w*|salv\\w*|agenda\\w*|clima|previs[ãa]o|pre[çc]o|cota[çc][ãa]o|navegador\\w*|browser\\w*|cliqu\\w*|clic\\w*|digit\\w*|scroll\\w*|inspecion\\w*|screenshot|print)' + E, 'i');
  const AGIR_RE = new RegExp('^@?AGIR' + E, 'i');
  function voiceSystem() {
    let mem = ''; try { mem = typeof memBlock === 'function' ? memBlock() : ''; } catch {}
    let lang = 'português do Brasil'; try { lang = PL(); } catch {}
    return 'Você é o Free Agent numa CONVERSA POR VOZ em tempo real. Responda em ' + lang + ', natural e falado, em 1 a 3 frases curtas. '
      + 'Sem markdown, sem listas, sem emojis, sem URLs, sem código. Frases curtas, a primeira já com a resposta direta. '
      + 'Se o pedido exigir AÇÃO ou DADOS do app (criar/listar/editar/concluir tarefas ou notas, ler memória, conversas, notas ou arquivos, '
      + 'buscar na web ou notícias, tocar música, abrir sites, rotinas, skills, código), responda SOMENTE com a palavra @AGIR e nada mais.' + mem;
  }
  let paintRaf = 0;
  function paint(full) {
    if (paintRaf || !S.bubble) return;
    paintRaf = requestAnimationFrame(() => { paintRaf = 0; try { S.bubble.innerHTML = mdLite(full()); $('#messages').scrollTop = 1e6; } catch {} });
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // texto da resposta do chat → frases falaveis (lista vira sentenças; limita p/ não ler um livro)
  function prepSpeech(t) {
    const out = t.split(/\n+/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean)
      .map(l => /[.!?…:;]$/.test(l) ? l : l + '.').join(' ');
    if (out.length <= 1500) return out;
    const cut = out.slice(0, 1500);
    return cut.slice(0, Math.max(cut.lastIndexOf('. '), 800) + 1) + ' O restante está no chat.';
  }
  function speakFinal(text, turn) {
    const ch = new Chunker(), parts = [...ch.push(text), ...ch.flush()];
    if (!parts.length) { setState('listening'); return; }
    TTS.firstAudio = () => { if (turn === S.turn) setState('speaking'); };
    TTS.onDrain = () => { if (turn === S.turn && S.on) setState('listening'); };
    parts.forEach(s => TTS.say(s));
  }

  // Ação: submete pelo composer (pipeline normal com ferramentas) e fala a resposta final que aparecer no chat.
  async function runAction(text, turn) {
    S.finishTurn = null; S.bubble = null;
    setState('thinking', 'Executando…');

    // Feedback imediato por voz para o usuário nunca ficar no vácuo, mesmo se o app estiver minimizado
    TTS.firstAudio = () => { if (turn === S.turn) setState('speaking', 'Analisando…'); };
    TTS.say('Só um segundinho que estou analisando senhor...');

    const box = $('#messages'), inp = $('#input'), form = $('#composer');
    if (!box || !inp || !form) { setState('listening'); return; }
    const typing = () => { const t = $('#typing'); return !!(t && !t.hidden); };
    const before = box.children.length, t0 = Date.now();
    inp.value = text; inp.dispatchEvent(new Event('input'));
    try { form.requestSubmit(); } catch { setState('listening'); return; }
    let last = Date.now(), cnt = before, ais = [];
    for (;;) {
      await sleep(150);
      if (turn !== S.turn || !S.on) return;                // interrompido: o pipeline termina sozinho, só não falamos
      const kids = [...box.children].slice(before);
      if (kids.length !== cnt) { cnt = kids.length; last = Date.now(); }
      ais = kids.filter(k => k.classList && k.classList.contains('ai'));
      if (Date.now() - t0 > 180000) break;
      if (!typing() && ais.length && Date.now() - last > 800) break;   // pipeline terminou e o chat parou de mudar
    }
    const texts = ais.map(k => {
      const c = k.cloneNode(true);
      c.querySelectorAll('.src,.actions,button,iframe,script,style,pre').forEach(n => n.remove());
      c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
      c.querySelectorAll('li,p,div,h1,h2,h3,h4,tr').forEach(n => n.append('\n'));
      return c.textContent.trim();
    }).filter(Boolean);
    lg(`Realtime ação concluída em ${((Date.now() - t0) / 1000).toFixed(1)}s (${text.slice(0, 50)})`, 'ok');
    if (turn !== S.turn || !S.on) return;
    if (!texts.length) { setState('listening'); return; }
    speakFinal(prepSpeech(texts.join('\n')), turn);
  }

  async function runTurn(text) {
    const turn = ++S.turn;
    if (ACTION_RE.test(text)) return runAction(text, turn);
    let userDone = false;
    const commitUser = () => { if (userDone) return; userDone = true; try { addMsg('user', text); } catch {} history.push({ role: 'user', content: text }); };
    const msgs = [{ role: 'system', content: voiceSystem() }, ...history.slice(-6).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: text }];
    let answer = '', gotTok = false, llmDone = false, decided = false, probe = '', handoff = false;
    S.bubble = null;
    S.abort = new AbortController();
    const ch = new Chunker();
    setState('thinking');
    const finish = () => { // grava o que foi dito (inclusive parcial, se interrompido) no histórico
      if (finish.done || handoff) return; finish.done = true;
      commitUser();
      if (answer.trim()) { history.push({ role: 'assistant', content: answer.trim() }); try { persist(); } catch {} }
      if (S.bubble) { try { S.bubble.innerHTML = mdLite(answer.trim() || '(interrompido)'); } catch {} }
      S.bubble = null;
    };
    S.finishTurn = finish;
    const settle = () => { if (turn !== S.turn || !S.on) return; finish(); setState('listening'); };
    TTS.onDrain = () => { if (llmDone) settle(); };
    TTS.firstAudio = () => {
      if (turn !== S.turn) return;
      setState('speaking');
      const t = performance.now(), m = S.tm;
      lg(`Realtime latência: fim da fala→texto ${Math.round(m.stt - m.end)}ms · →1º token ${Math.round(m.tok - m.stt)}ms · →1º áudio ${Math.round(t - m.tok)}ms · TOTAL ${Math.round(t - m.end)}ms`, 'ok');
    };
    const emit = d => {
      if (!gotTok) { gotTok = true; S.tm.tok = performance.now(); }
      if (!S.bubble) { commitUser(); try { S.bubble = addMsg('ai', '…'); } catch {} }
      answer += d; paint(() => answer);
      for (const s of ch.push(d)) TTS.say(s);
    };
    try {
      await streamLLM(msgs, S.abort.signal, d => {
        if (turn !== S.turn || handoff) return;
        if (decided) return emit(d);
        probe += d;
        const t = probe.trimStart();
        if (t.length < 5 && '@AGIR'.startsWith(t.toUpperCase())) return;   // ainda pode virar @AGIR: segura os primeiros chars
        decided = true;
        if (AGIR_RE.test(t)) { handoff = true; S.abort.abort(); return; }  // o modelo pediu ação → pipeline completo
        const b = probe; probe = ''; emit(b);
      });
      if (turn !== S.turn) return;
      if (!decided) { decided = true; const t = probe.trim(); if (AGIR_RE.test(t)) handoff = true; else if (t) emit(probe); }
      if (handoff) return runAction(text, turn);
      for (const s of ch.flush()) TTS.say(s);
      llmDone = true;
      if (!TTS.busy) settle();
    } catch (e) {
      if (turn !== S.turn) return;
      if (handoff) return runAction(text, turn);          // AbortError causado pelo próprio handoff
      if (e && e.name === 'AbortError') return;
      llmDone = true;
      lg('Realtime LLM falhou: ' + ((e && e.message) || e), 'warn');
      note('mic-off', 'Falha na IA: ' + String((e && e.message) || e).slice(0, 120));
      if (!answer) { commitUser(); answer = '(falha: ' + String((e && e.message) || e).slice(0, 100) + ')'; try { S.bubble = S.bubble || addMsg('ai', answer); } catch {} }
      if (!TTS.busy) settle();
    }
  }

  function interrupt() { // barge-in: corta voz + stream; o que já foi falado fica no histórico
    S.turn++;                                              // invalida callbacks do turno antigo
    try { S.abort && S.abort.abort(); } catch {}
    TTS.cancel();
    try { S.finishTurn && S.finishTurn(); } catch {}
    S.finishTurn = null;
  }

  /* ───────── Assistente / Modal de Ativação do Kokoro AI ───────── */
  function openKokoroModal(forced = false) {
    return new Promise(resolve => {
      let modal = $('#kokoroModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'kokoroModal';
        modal.className = 'modal';
        modal.hidden = true;
        modal.innerHTML = `
          <div class="modal-card glass-card" style="max-width:480px;padding:24px;border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.35)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;border-radius:10px;background:var(--grad);display:grid;place-items:center;color:#fff;box-shadow:0 0 16px rgba(125,42,255,.4)">
                  <i data-lucide="sparkles"></i>
                </div>
                <div>
                  <h3 style="margin:0;font-size:16px;font-weight:600">Voz em Tempo Real</h3>
                  <span style="font-size:12px;color:var(--muted)">Escolha a qualidade da sua voz</span>
                </div>
              </div>
              <button id="kmClose" class="btn ghost sm icon-only" title="Fechar"><i data-lucide="x"></i></button>
            </div>

            <p style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:16px">
              O Free Agent possui suporte ao <b>Kokoro AI</b>: nosso motor de síntese ultrarrealista com vozes humanas brasileiras (Dora e Alex), sem custos de API e resposta imediata.
            </p>

            <div id="kmChoiceView">
              <!-- Card Kokoro (Destaque) -->
              <div id="kmCardKokoro" style="border:1.5px solid var(--accent);border-radius:14px;padding:14px 16px;background:rgba(0,113,227,.05);margin-bottom:12px;cursor:pointer;transition:all .18s ease">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <b style="font-size:13.5px;color:var(--accent);display:flex;align-items:center;gap:6px">
                    <i data-lucide="zap"></i> Kokoro AI (Recomendado)
                  </b>
                  <span style="font-size:10px;font-weight:600;text-transform:uppercase;background:var(--accent);color:#fff;padding:2px 7px;border-radius:999px">Melhor Qualidade</span>
                </div>
                <p style="font-size:12px;color:var(--muted);margin:0 0 10px 0;line-height:1.4">
                  Síntese ultrarrealista com entonação humana e transcrição rápida. Baixa os modelos uma única vez.
                </p>
                <button type="button" id="kmBtnKokoro" class="btn primary sm" style="width:100%;justify-content:center;font-weight:600">
                  <i data-lucide="download"></i> Baixar e Ativar Kokoro
                </button>
              </div>

              <!-- Card Padrão -->
              <div id="kmCardStandard" style="border:1px solid var(--stroke);border-radius:14px;padding:14px 16px;background:var(--card);cursor:pointer;transition:all .18s ease">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <b style="font-size:13px;color:var(--ink);display:flex;align-items:center;gap:6px">
                    <i data-lucide="volume-2"></i> Usar Voz Padrão
                  </b>
                </div>
                <p style="font-size:12px;color:var(--muted);margin:0 0 10px 0;line-height:1.4">
                  Sem downloads adicionais. Usa as vozes já disponíveis no seu navegador ou sistema.
                </p>
                <button type="button" id="kmBtnStandard" class="btn ghost sm" style="width:100%;justify-content:center">
                  Continuar com Voz Padrão
                </button>
              </div>
            </div>

            <!-- View de Progresso do Download -->
            <div id="kmProgView" hidden style="margin-top:10px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span id="kmProgLabel" style="font-size:12.5px;font-weight:500;color:var(--ink)">Baixando modelo Kokoro…</span>
                <span id="kmProgPct" style="font-size:12px;font-family:var(--mono);color:var(--muted)">0%</span>
              </div>
              <div style="width:100%;height:8px;background:rgba(127,127,137,.2);border-radius:99px;overflow:hidden;margin-bottom:12px">
                <div id="kmProgBar" style="width:0%;height:100%;background:var(--grad);border-radius:99px;transition:width .2s ease"></div>
              </div>
              <p id="kmProgDetail" style="font-size:11.5px;color:var(--muted);line-height:1.4;margin:0 0 14px 0">Preparando download...</p>
              <div id="kmDoneActions" hidden class="btnrow" style="margin-top:8px">
                <button type="button" id="kmBtnDone" class="btn primary sm" style="width:100%;justify-content:center">Iniciar Conversa</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        try { window.lucide && lucide.createIcons(); } catch {}
      }

      const close = (val) => {
        modal.hidden = true;
        resolve(val);
      };

      $('#kmClose').onclick = () => close(null);
      $('#kmBtnStandard').onclick = () => {
        try { localStorage.setItem('nexus:kokoro_choice', 'standard'); } catch {}
        close('standard');
      };

      const startDownload = async () => {
        $('#kmChoiceView').hidden = true;
        $('#kmProgView').hidden = false;
        try { localStorage.setItem('nexus:kokoro_choice', 'kokoro'); } catch {}

        try {
          $('#kmProgLabel').textContent = 'Iniciando download…';
          $('#kmProgPct').textContent = '0%';
          $('#kmProgBar').style.width = '0%';
          $('#kmProgDetail').textContent = 'Conectando ao repositório de modelos…';

          // Inicia o download no backend local (Node/Electron), sem restrições de CORS
          const res = await fetch('/api/kokoro/download', { method: 'POST' });
          if (!res.ok) throw new Error(`Falha na requisição local: HTTP ${res.status}`);

          // Polling de progresso
          let downloadDone = false;
          while (!downloadDone) {
            await sleep(300);
            let st = null;
            try {
              const stRes = await fetch('/api/kokoro/status');
              if (stRes.ok) st = await stRes.json();
            } catch {}

            if (!st) continue;
            if (st.error) throw new Error(st.error);

            if (st.progress) {
              const p = st.progress;
              const fName = p.file || 'modelos';
              $('#kmProgLabel').textContent = `Baixando ${fName}…`;
              const pct = Math.max(0, Math.min(100, p.pct || 0));
              $('#kmProgPct').textContent = `${pct}%`;
              $('#kmProgBar').style.width = `${pct}%`;
              const mbLoaded = ((p.loaded || 0) / (1024 * 1024)).toFixed(1);
              const mbTotal = ((p.total || 370435312) / (1024 * 1024)).toFixed(0);
              $('#kmProgDetail').textContent = `${mbLoaded} MB de ${mbTotal} MB`;
            }

            if (st.done || (!st.isDownloading && st.modelsExist)) {
              downloadDone = true;
            }
          }

          $('#kmProgLabel').textContent = 'Iniciando motor de voz Kokoro…';
          $('#kmProgPct').textContent = '100%';
          $('#kmProgBar').style.width = '100%';
          $('#kmProgDetail').textContent = 'Aguardando inicialização do servidor de voz…';

          // Garante inicialização e aguarda servidor responder
          try { await fetch('/api/kokoro/start-server', { method: 'POST' }); } catch {}
          let serverOnline = false;
          for (let i = 0; i < 25; i++) {
            await sleep(500);
            await probe();
            if (S.srv?.tts) {
              serverOnline = true;
              break;
            }
          }

          $('#kmProgLabel').textContent = 'Kokoro pronto para uso!';
          $('#kmProgPct').textContent = '100%';
          $('#kmProgBar').style.width = '100%';
          $('#kmProgDetail').innerHTML = serverOnline
            ? 'Modelos baixados e motor ativado com sucesso.'
            : 'Modelos prontos. O motor Kokoro está configurado.';
          $('#kmDoneActions').hidden = false;
          $('#kmBtnDone').textContent = 'Iniciar Conversa';
          $('#kmBtnDone').onclick = async () => {
            await probe();
            close('kokoro');
          };
        } catch (err) {
          $('#kmProgLabel').textContent = 'Download não concluído';
          $('#kmProgDetail').textContent = 'Erro ao baixar: ' + (err.message || err) + '. Você pode usar a voz padrão por enquanto.';
          $('#kmDoneActions').hidden = false;
          $('#kmBtnDone').textContent = 'Continuar com Voz Padrão';
          $('#kmBtnDone').onclick = () => close('standard');
        }
      };

      $('#kmBtnKokoro').onclick = startDownload;
      $('#kmCardKokoro').onclick = (e) => { if (e.target !== $('#kmBtnKokoro')) startDownload(); };
      $('#kmCardStandard').onclick = (e) => { if (e.target !== $('#kmBtnStandard')) $('#kmBtnStandard').click(); };

      // Reset estado visual ao abrir
      $('#kmChoiceView').hidden = false;
      $('#kmProgView').hidden = true;
      $('#kmDoneActions').hidden = true;
      modal.hidden = false;
      try { window.lucide && lucide.createIcons(); } catch {}

      // Se modelos já existem em disco, adapta label do botão
      fetch('/api/kokoro/status').then(r => r.json()).then(st => {
        if (st.modelsExist && $('#kmBtnKokoro')) {
          $('#kmBtnKokoro').innerHTML = '<i data-lucide="zap"></i> Ativar Kokoro (Já baixado)';
          try { window.lucide && lucide.createIcons(); } catch {}
        }
      }).catch(() => {});
    });
  }

  /* ───────── ciclo de vida ───────── */
  async function start() {
    if (S.on) return;
    if (!ok()) { console.warn('[realtime] globais do app ausentes — módulo inativo'); return; }
    const p = cfg.provider;
    if (!(keys[p] || p === 'ollama' || p === 'lmstudio')) { note('plug', 'Conecte um provedor de IA antes (Configurações).'); return; }
    if (window.Voice && window.Voice.state !== 'idle') { note('mic-off', 'Termine a gravação do ditado primeiro.'); return; }

    // Na 1ª ativação: se o Kokoro não estiver ativo e o usuário ainda não tiver decidido, verifica modelos
    await probe();
    const kokoroDecided = (() => { try { return localStorage.getItem('nexus:kokoro_choice'); } catch { return null; } })();
    if (!S.srv?.tts && !kokoroDecided) {
      let modelsOnDisk = false;
      try {
        const stRes = await fetch('/api/kokoro/status');
        const st = await stRes.json();
        modelsOnDisk = !!st.modelsExist;
      } catch {}

      if (modelsOnDisk) {
        // Modelos já existem em disco: tenta subir o servidor e aguarda brevemente
        try { await fetch('/api/kokoro/start-server', { method: 'POST' }); } catch {}
        for (let i = 0; i < 6; i++) {
          await sleep(500);
          await probe();
          if (S.srv?.tts) break;
        }
      }

      if (!S.srv?.tts && !kokoroDecided && !modelsOnDisk) {
        const choice = await openKokoroModal(false);
        if (!choice) return;
      }
    }

    ui();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { note('mic-off', 'Microfone bloqueado. Libere o acesso no navegador.'); return; }
    S.on = true; S.stream = stream; S.utt = null; S.pre = []; S.voiced = 0;
    setState('loading');
    try {
      await probe();
      if (!(S.srv && S.srv.stt)) await loadSTT();           // sem servidor: Whisper no navegador (mais lento)
      if (!S.on) return;
      await voicesReady();
      if (engine() === 'local') {
        setState('loading', 'Baixando voz neural local…');
        await loadLocalTTS(pct => setState('loading', `Baixando voz neural local ${pct}%…`));
      }
      if (!S.on) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      S.ac = new AC(); S.sr = S.ac.sampleRate;
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      await S.ac.audioWorklet.addModule(url); URL.revokeObjectURL(url);
      S.src = S.ac.createMediaStreamSource(stream);
      S.node = new AudioWorkletNode(S.ac, 'rt-cap');
      S.node.port.onmessage = e => onFrame(e.data.pcm, e.data.rms);
      S.src.connect(S.node);
      S.mute = S.ac.createGain(); S.mute.gain.value = 0;   // worklet precisa estar ligado ao destino p/ ser processado; ganho 0 = sem eco
      S.node.connect(S.mute); S.mute.connect(S.ac.destination);
      if (S.ac.state === 'suspended') await S.ac.resume();
      try { speechSynthesis.getVoices(); } catch {}        // pré-carrega a lista de vozes
      setState('listening');
      lg('Conversa em tempo real ativa (' + PROVIDERS[p].label + ' · ' + cfg.model + ' · TTS ' + engine() + ' · STT ' + (S.srv && S.srv.stt ? 'servidor' : 'navegador') + ')', 'ok');
    } catch (e) {
      lg('Realtime não iniciou: ' + ((e && e.message) || e), 'warn');
      note('mic-off', 'Não consegui iniciar o tempo real: ' + String((e && e.message) || e).slice(0, 100));
      stop();
    }
  }
  function stop() {
    if (!S.on && S.state === 'off') return;
    S.on = false;
    try { interrupt(); } catch {}
    try { S.node && (S.node.port.onmessage = null, S.node.disconnect()); S.src && S.src.disconnect(); } catch {}
    try { S.ac && S.ac.close(); } catch {}
    try { S.stream && S.stream.getTracks().forEach(t => t.stop()); } catch {}
    S.node = S.src = S.ac = S.stream = null; S.utt = null; S.pre = [];
    setState('off');
  }
  function toggle() { S.on ? stop() : start(); }

  /* ───────── Configurações → Voz ───────── */
  function voicesReady() {
    return new Promise(res => {
      if (bVoices().length) return res();
      const t = setTimeout(res, 1500);
      try { speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); res(); }, { once: true }); } catch { clearTimeout(t); res(); }
    });
  }
  const saveC = (k, v) => { C[k] = v; try { localStorage.setItem('nexus:rt', JSON.stringify(C)); } catch {} };
  const escA = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function settingsUI() {
    const nav = $('#settingsModal .set-nav'), grid = $('#settingsModal .setgrid');
    if (!nav || !grid || $('#secVoice')) return;
    const nb = document.createElement('button');
    nb.dataset.sec = 'secVoice'; nb.innerHTML = '<i data-lucide="audio-lines"></i><span>Voz</span>';
    nav.insertBefore(nb, nav.querySelector('[data-sec="secHelp"]') || null);
    const sec = document.createElement('section');
    sec.className = 'set-block'; sec.id = 'secVoice';
    sec.innerHTML = `<h2><i data-lucide="audio-lines"></i> <span>Voz do agente</span></h2>
      <p class="hint" style="margin-top:0">Voz usada na conversa em tempo real (Alt+V). Tudo local, sem custo.</p>
      <label class="fld"><span>Motor de voz</span><select id="rtEng">
        <option value="auto">Automático (Kokoro local se estiver rodando → navegador → neural local)</option>
        <option value="browser">Voz do navegador / sistema</option>
        <option value="local">Neural local em português (baixa ~30 MB, sem instalar nada)</option>
        <option value="http">Kokoro — servidor local (melhor qualidade)</option></select></label>
      <label class="fld" id="rtVoiceW"><span>Voz</span><select id="rtVoice"></select></label>
      <div id="rtHttpW" hidden>
        <label class="fld"><span>Voz Kokoro</span><select id="rtHV"></select></label>
        <label class="fld"><span>URL do servidor</span><input id="rtUrl" /></label>
        <div class="btnrow"><button type="button" id="rtLoadV" class="btn ghost sm">Reconectar / recarregar vozes</button></div>
      </div>
      <label class="fld"><span>Velocidade: <b id="rtRateV"></b>×</span><input id="rtRate" type="range" min="0.7" max="1.5" step="0.05" /></label>
      <div class="fld" style="margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(127,127,137,.06);border:1px solid var(--stroke)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div>
            <b style="font-size:13px;display:flex;align-items:center;gap:6px">
              <i data-lucide="sparkles"></i> Modelo Kokoro AI (Alta Fidelidade)
            </b>
            <p class="hint" style="margin:2px 0 0 0" id="rtKokoroStatus">Voz neural ultrarrealista em português brasileiro.</p>
          </div>
          <button type="button" id="rtOpenKokoroModal" class="btn ghost sm"><i data-lucide="download"></i> Baixar / Ativar</button>
        </div>
      </div>
      <p class="hint" id="rtInfo"></p>`;
    grid.appendChild(sec);
    try { window.lucide && lucide.createIcons(); } catch {}
    $('#rtOpenKokoroModal').onclick = () => openKokoroModal(true);
    const fillBrowser = () => {
      const vs = bVoices().slice().sort((a, b) => (/^pt/i.test(b.lang) - /^pt/i.test(a.lang)) || a.name.localeCompare(b.name));
      const sel = $('#rtVoice');
      sel.innerHTML = vs.length
        ? '<option value="">(padrão: melhor voz em português)</option>' + vs.map(v => `<option value="${escA(v.name)}">${escA(v.name)} — ${escA(v.lang)}</option>`).join('')
        : '<option value="">(nenhuma voz instalada no navegador)</option>';
      sel.value = C.voiceName || '';
      info();
    };
    const info = () => {
      const e = engine(), n = bVoices().length;
      $('#rtVoiceW').hidden = e !== 'browser';
      $('#rtHttpW').hidden = e !== 'http' && C.tts !== 'http';
      const st = S.srv ? 'servidor de voz ONLINE (Kokoro' + (S.srv.stt ? ' + transcrição rápida' : '') + ')' : 'servidor de voz offline (rode voice-server — veja o README)';
      $('#rtInfo').textContent = (e === 'local' ? 'Em uso: voz neural local (pt), uma única voz.'
        : e === 'http' ? 'Em uso: Kokoro local.' : n ? `Em uso: voz do navegador (${n} disponíveis).` : 'Nenhuma voz no navegador — escolha "Neural local".') + ' · ' + st;
    };
    $('#rtEng').value = C.tts; $('#rtUrl').value = C.ttsUrl;
    $('#rtRate').value = C.rate; $('#rtRateV').textContent = Number(C.rate).toFixed(2);
    fillBrowser();
    try { speechSynthesis.addEventListener('voiceschanged', fillBrowser); } catch {}
    $('#rtEng').onchange = e => { saveC('tts', e.target.value); info(); };
    $('#rtVoice').onchange = e => saveC('voiceName', e.target.value);
    $('#rtUrl').onchange = e => saveC('ttsUrl', e.target.value.trim());
    $('#rtHV').onchange = e => saveC('ttsVoice', e.target.value);
    $('#rtRate').oninput = e => { saveC('rate', Number(e.target.value)); $('#rtRateV').textContent = Number(e.target.value).toFixed(2); };
    const loadSrvVoices = async () => {
      await probe();
      const sel = $('#rtHV');
      if (S.srv) {
        try {
          const j = await (await fetch(srvBase() + '/v1/audio/voices')).json();
          const list = (j.voices || []).map(v => v.name || v.id || v);
          const lab = v => (/^p[fm]_/.test(v) ? '🇧🇷 ' : '') + v;
          sel.innerHTML = list.map(v => `<option value="${escA(v)}">${escA(lab(v))}</option>`).join('');
          sel.value = list.includes(C.ttsVoice) ? C.ttsVoice : (list[0] || '');
          if (sel.value !== C.ttsVoice) saveC('ttsVoice', sel.value);
        } catch {}
      } else sel.innerHTML = '<option>(servidor offline)</option>';
      info();
    };
    $('#rtLoadV').onclick = loadSrvVoices;
    nb.addEventListener('click', loadSrvVoices);
    loadSrvVoices();
    $('#rtTest').onclick = async () => {
      TTS.cancel();
      await probe(); info();
      const txt = 'Olá! Esta é a voz do seu agente. Estou pronto para conversar.';
      if (engine() === 'local' && !S.localTTS) {
        $('#rtInfo').textContent = 'Baixando voz neural local…';
        try { await loadLocalTTS(p => { $('#rtInfo').textContent = `Baixando voz neural local ${p}%…`; }); } catch (e) { $('#rtInfo').textContent = 'Falhou ao baixar: ' + ((e && e.message) || e); return; }
        info();
      }
      TTS.say(txt);
    };
  }
  function bind() { ui(); settingsUI(); }
  if (document.readyState !== 'loading') bind(); else document.addEventListener('DOMContentLoaded', bind);

  // capture=true: roda antes do atalho Ctrl+Espaço do voice.js enquanto o tempo real estiver ligado
  window.addEventListener('keydown', e => {
    if (e.altKey && !e.ctrlKey && (e.key === 'v' || e.key === 'V' || e.code === 'KeyV')) { e.preventDefault(); toggle(); return; }
    if (!S.on) return;
    if (e.key === 'Escape') { e.preventDefault(); stop(); return; }
    if (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  window.Realtime = {
    toggle, start, stop,
    get state() { return S.state; },
    get config() { return Object.assign({}, C); },
    set(k, v) { if (!(k in DEF)) return false; C[k] = v; try { localStorage.setItem('nexus:rt', JSON.stringify(C)); } catch {} return true; },
  };
})();
