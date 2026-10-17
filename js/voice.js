/* My OS · Entrada por voz: Ctrl+Espaço grava → Espaço encerra → transcreve → envia à IA.
   Sem modal: pill flutuante com onda ao vivo + blur sutil. Ao encerrar, some tudo
   e só o chat mostra carregando. Transcrição LOCAL (Whisper tiny, 1 download).
   Fallback: ditado do navegador.
*/
'use strict';
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { state: 'idle', rec: null, chunks: [], stream: null, t0: 0, timer: null, transcriber: null, modelLoading: null, ac: null, analyser: null, raf: 0, cancelled: false };

  function icons() { try { window.lucide && lucide.createIcons(); } catch {} }
  let pillT = null;
  function showPill(label) {
    clearTimeout(pillT);
    const f = $('#voiceFloat'), b = $('#voiceBlur');
    if (f) { f.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => f.classList.add('show'))); }
    if (b) b.hidden = false;
    if (label) { const st = $('#voiceState'); if (st) st.textContent = label; }
    const btn = $('#btnVoice'); if (btn) btn.classList.add('live');
    icons();
  }
  function hidePill() {
    clearTimeout(pillT);
    const f = $('#voiceFloat'), b = $('#voiceBlur');
    if (f) {
      f.classList.remove('show');
      pillT = setTimeout(() => { if (f && !f.classList.contains('show')) f.hidden = true; }, 200);
    }
    if (b) b.hidden = true;
    const btn = $('#btnVoice'); if (btn) btn.classList.remove('live');
  }
  function showTyping(on) { const tp = $('#typing'); if (tp) tp.hidden = !on; }
  function setProg(pct) { const p = $('#voiceProg'); if (p) p.style.width = Math.max(0, Math.min(100, pct)) + '%'; }

  async function start() {
    if (S.state !== 'idle') return;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { try { toast('mic-off', 'Microfone bloqueado. Libere o acesso no navegador.'); } catch {} return; }
    S.stream = stream; S.chunks = []; S.cancelled = false; S.done = false;
    const rec = new MediaRecorder(stream);
    S.rec = rec;
    rec.ondataavailable = e => { if (e.data && e.data.size) S.chunks.push(e.data); };
    rec.onstop = onStopped;
    rec.onerror = ev => { console.error('[voice] erro do gravador:', (ev && (ev.error || ev.message)) || ev); try { if (S.rec && S.rec.state !== 'inactive') S.rec.stop(); } catch {} };
    try { rec.start(); console.info('[voice] gravando…'); }
    catch (err) { console.error('[voice] rec.start falhou:', err); cleanup(); hidePill(); S.state = 'idle'; try { toast('mic-off', 'Não consegui iniciar a gravação.'); } catch {} return; }
    S.state = 'recording'; S.t0 = Date.now(); setProg(0);
    showPill('Ouvindo… · ESPAÇO encerra');
    const tm = $('#voiceTimer'); if (tm) tm.textContent = '0:00';
    clearInterval(S.timer);
    S.timer = setInterval(() => {
      const el = $('#voiceTimer');
      if (el) { const s = Math.floor((Date.now() - S.t0) / 1000); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
      if (Date.now() - S.t0 > 120000) stop(true);
    }, 500);
    startWave(stream);
  }

  function stop(finish) {
    if (S.state !== 'recording') return;
    clearInterval(S.timer);
    stopWave();
    S.cancelled = !finish;
    S.state = finish ? 'transcribing' : 'idle';
    if (!finish) {
      // cancelar TAMBÉM para o gravador, senão o mic fica aberto para sempre
      try { S.rec && S.rec.state !== 'inactive' && S.rec.stop(); }
      catch { cleanup(); hidePill(); S.state = 'idle'; }
      return; // onStopped (via onstop) faz o resto
    }
    hidePill();          // sem modal: some tudo…
    showTyping(true);   // …e só o chat mostra carregando
    console.info('[voice] espaço → encerrando…');
    // se o gravador já morreu sozinho (erro de mic), vai direto p/ transcrever
    try { if (S.rec && S.rec.state !== 'inactive') S.rec.stop(); else onStopped(); } catch { onStopped(); }
  }

  function cleanup() {
    try { S.stream?.getTracks().forEach(t => t.stop()); } catch {}
    S.stream = null; S.rec = null;
  }

  // ── onda ao vivo do microfone ──
  function startWave(stream) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      S.ac = S.ac || new AC();
      if (S.ac.state === 'suspended') S.ac.resume();
      const src = S.ac.createMediaStreamSource(stream);
      S.analyser = S.ac.createAnalyser(); S.analyser.fftSize = 64;
      src.connect(S.analyser);
      const cv = $('#voiceWave');
      if (!cv) return;
      const ctx = cv.getContext('2d');
      const data = new Uint8Array(S.analyser.frequencyBinCount);
      const draw = () => {
        if (S.state !== 'recording') return;
        S.analyser.getByteFrequencyData(data);
        ctx.clearRect(0, 0, cv.width, cv.height);
        const n = 24, bw = cv.width / n;
        ctx.fillStyle = '#fff';
        for (let i = 0; i < n; i++) {
          const v = data[Math.floor(i * data.length / n)] / 255;
          const h = Math.max(3, v * cv.height);
          const x = i * bw + bw * 0.2, y = (cv.height - h) / 2;
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, bw * 0.6, h, 3); ctx.fill(); }
          else ctx.fillRect(x, y, bw * 0.6, h);
        }
        S.raf = requestAnimationFrame(draw);
      };
      draw();
    } catch {}
  }
  function stopWave() { try { cancelAnimationFrame(S.raf); } catch {} try { S.analyser?.disconnect(); } catch {} S.analyser = null; }

  async function onStopped() {
    if (S.done) return; // onstop pode disparar 2x — transcreve uma vez só
    S.done = true;
    console.info('[voice] gravação parada, chunks:', S.chunks.length);
    if (S.cancelled) { cleanup(); hidePill(); showTyping(false); S.state = 'idle'; S.cancelled = false; return; }
    const blob = new Blob(S.chunks, { type: S.rec?.mimeType || 'audio/webm' });
    cleanup();
    if (!blob.size) { showTyping(false); S.state = 'idle'; return; }
    try {
      const text = await transcribeLocal(blob);
      deliver(text);
    } catch (e) {
      console.error('[voice] whisper local falhou:', e);
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { showTyping(false); S.state = 'idle'; vErr('Transcrição local falhou (' + shortErr(e) + ') e não há ditado alternativo neste navegador.'); return; }
      // fallback VISÍVEL: usuário precisa saber que deve falar de novo
      showPill('Modelo local falhou — fale de novo (modo rápido)…');
      try {
        const text = await transcribeFallback();
        deliver(text);
      } catch (e2) {
        console.error('[voice] fallback falhou:', e2);
        showTyping(false); hidePill(); S.state = 'idle';
        vErr('Não consegui transcrever: ' + shortErr(e2) + '. Tente de novo.');
      }
    }
  }

  function shortErr(e) {
    const m = String((e && e.message) || e || 'erro desconhecido');
    if (/network|fetch|failed to fetch|load/i.test(m)) return 'falha de rede ao carregar o modelo';
    if (m.length > 90) return m.slice(0, 90) + '…';
    return m;
  }
  function vErr(html) { try { toast('mic-off', html); } catch {} try { log('Voz: ' + String(html).replace(/<[^>]+>/g, ''), 'warn'); } catch {} }

  function deliver(text) {
    text = String(text || '').trim();
    S.state = 'idle'; // libera p/ próxima gravação (sem isso, a voz só funciona 1x)
    showTyping(false);
    hidePill();
    if (!text) { try { toast('mic-off', 'Não captei nada. Fale mais perto do microfone.'); } catch {} return; }
    const inp = $('#input');
    if (inp) { inp.value = text; inp.dispatchEvent(new Event('input')); inp.focus(); }
    try { $('#composer').requestSubmit(); } catch {}
    try { log('Voz → IA (' + text.slice(0, 60) + '…)', 'ok'); } catch {}
  }

  // ── Whisper local (base entende PT bem melhor; tiny de fallback se faltar rede/memória) ──
  async function loadModel() {
    if (S.transcriber) return S.transcriber;
    if (S.modelLoading) return S.modelLoading;
    S.modelLoading = (async () => {
      showPill('Baixando voz local…'); // 1ª vez: único feedback extra, com progresso
      const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm');
      const seen = {};
      const mkProg = (tag) => (p) => {
        if (p.status === 'progress' && p.total) {
          seen[p.file] = (p.loaded / p.total) * 100;
          const files = Object.keys(seen);
          const pct = Math.round(files.reduce((a, f) => a + seen[f], 0) / files.length);
          setProg(pct);
          const st = $('#voiceState'); if (st) st.textContent = `Baixando voz local (${tag}) ${pct}%…`;
        }
      };
      let tr = null;
      try {
        tr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', { progress_callback: mkProg('base') });
        S.modelTag = 'base';
      } catch (e) {
        console.warn('[voice] whisper-base indisponível, caindo p/ tiny:', (e && e.message) || e);
        for (const k of Object.keys(seen)) delete seen[k];
        setProg(0);
        tr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { progress_callback: mkProg('tiny') });
        S.modelTag = 'tiny';
      }
      console.info('[voice] modelo pronto:', S.modelTag);
      S.transcriber = tr;
      return tr;
    })();
    try { return await S.modelLoading; }
    finally { S.modelLoading = null; }
  }

  async function toPCM16k(blob) {
    const ab = await blob.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('sem WebAudio');
    const actx = new AC();
    try {
      const buf = await actx.decodeAudioData(ab.slice(0));
      const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
      const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
      const out = await off.startRendering();
      return out.getChannelData(0);
    } finally { try { await actx.close(); } catch {} }
  }

  async function transcribeLocal(blob) {
    const needDl = !S.transcriber;
    const tr = await loadModel();
    if (needDl) hidePill(); // modelo pronto: pill some, chat assume com o loading
    const pcm = await toPCM16k(blob);
    if (pcm.length < 8000) throw new Error('áudio muito curto');
    const out = await tr(pcm, { language: 'portuguese', task: 'transcribe' });
    return out.text;
  }

  // ── fallback: ditado rápido do navegador ──
  function transcribeFallback() {
    return new Promise((resolve, reject) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return reject(new Error('sem reconhecedor alternativo'));
      const rec = new SR();
      rec.lang = 'pt-BR'; rec.interimResults = false; rec.maxAlternatives = 1;
      const to = setTimeout(() => { try { rec.stop(); } catch {} reject(new Error('tempo esgotado')); }, 15000);
      rec.onresult = e => { clearTimeout(to); resolve(e.results[0][0].transcript); };
      rec.onerror = e => { clearTimeout(to); reject(new Error(e.error || 'erro no ditado')); };
      try { rec.start(); } catch (e) { clearTimeout(to); reject(e); }
    });
  }

  function toggle() { if (S.state === 'recording') stop(true); else if (S.state === 'idle') start(); }

  // Certificação guiada: pré-carrega o modelo, grava 6s, transcreve e envia à IA.
  // A frase transcrita aparece como sua mensagem + a resposta da IA abaixo = prova ponta a ponta.
  async function selfTest() {
    if (S.state !== 'idle') return;
    try { addMsg('sys', 'Teste de voz: carregando modelo e ouvindo por 6s — fale uma frase completa.'); } catch {}
    try { await loadModel(); }
    catch (e) { hidePill(); vErr('Modelo de voz indisponível (' + shortErr(e) + ').'); return; }
    hidePill();
    await start();
    if (S.state !== 'recording') return; // mic bloqueado (start já avisou)
    setTimeout(() => { if (S.state === 'recording') stop(true); }, 6000);
  }

  function bind() {
    const b = $('#btnVoice'); if (b) b.onclick = toggle;
    // clicar na pill também encerra (caminho alternativo ao ESPAÇO)
    const f = $('#voiceFloat');
    if (f) f.addEventListener('click', () => { if (S.state === 'recording') stop(true); });
    icons();
  }
  document.addEventListener('DOMContentLoaded', bind);
  if (document.readyState !== 'loading') bind();

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); console.info('[voice] atalho, estado:', S.state); toggle(); return; }
    // ESPAÇO encerra (code + key como fallback p/ layouts/IMEs diferentes)
    if (S.state === 'recording' && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); stop(true); return; }
    if (S.state === 'recording' && e.key === 'Escape') { e.preventDefault(); stop(false); }
  });

  window.Voice = { toggle, start, stop, selfTest, get state() { return S.state; } };
})();
