/* Free Agent Harness — self-test no navegador. Uso: http://localhost:8080/?eval=1
   Roda os cenários de eval/golden-tasks.json contra o app VIVO
   (intents reais, player real, IndexedDB real) com ISOLAMENTO TOTAL:
   snapshot de tudo antes, restore de tudo depois. Não destrói dados.
*/
'use strict';
window.runBrowserEval = async function () {
  const $ = s => document.querySelector(s);
  const results = [];
  const ok = (id, cond, detail = '') => { results.push({ id, ok: !!cond, detail }); console.log(`[eval] ${cond ? 'ok  ' : 'FAIL'} ${id}${detail ? ' — ' + detail : ''}`); };

  // ── espera app pronto ──
  for (let i = 0; i < 50 && !(window.tryLocalAutomation && window.LocalMusic && window.MusicPlayer); i++)
    await new Promise(r => setTimeout(r, 200));
  if (!window.tryLocalAutomation) { document.title = 'EVAL abortado'; return; }

  // ── snapshot ──
  const lsSnap = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); lsSnap[k] = localStorage.getItem(k); }
  const activeConv = store.get('activeConv', null);
  const activeTab = (document.querySelector('.tabs button.active') || {}).dataset?.tab || 'routines';
  const qbak = MusicPlayer.queue.slice();
  const localIdsBefore = new Set(LocalMusic.list().map(t => t.id));

  const GOLDEN = await (await fetch('eval/golden-tasks.json')).json();

  // ── A. paridade de parse (cópia do app.js × mesmo golden do Node) ──
  for (const c of GOLDEN.parse) {
    const r = parseToolCall(c.input);
    ok(`parse:${c.tool || 'null'}`, c.tool === null ? r === null : (r && r.name === c.tool && r.arg === c.arg), JSON.stringify(r));
  }

  // ── setups ──
  function wavFile(name) {
    const n = 1600, buf = new Uint8Array(44 + n * 2);
    const dv = new DataView(buf.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 16000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.sin(i / 8) * 12000, true);
    return new File([buf], name, { type: 'audio/wav' });
  }
  const lastAi = () => { const m = [...document.querySelectorAll('#messages .msg.ai')]; return (m[m.length - 1]?.innerText || ''); };

  // ── B. cenários comportamentais (em ordem) ──
  for (const c of GOLDEN.browser) {
    try {
      if (c.setup === 'clearTasks') { store.set('tasks', []); renderTasks(); }
      if (c.setup === 'clearQueue') { MusicPlayer.queue.length = 0; localStorage.setItem('nexus:playlist', '[]'); localStorage.setItem('nexus:playidx', '-1'); }
      if (c.setup === 'seedLocalWav') {
        const fresh = LocalMusic.list().filter(t => !localIdsBefore.has(t.id) && /cantiga eval/i.test(t.title));
        if (!fresh.length) await LocalMusic.addFiles([wavFile('cantiga eval.wav')]);
      }
      if (c.input === '__internal_tab_log__') {
        switchTab('log');
        const btn = document.querySelector('.tabs button[data-tab="log"]');
        const r = btn && btn.offsetParent !== null && !$('#tab-log').hidden;
        ok(c.id, !!r, 'aba Log visível sem rolagem escondida');
        continue;
      }
      await tryLocalAutomation(c.input);
      const e = c.expect || {};
      if (e.tasksHas) ok(c.id + ':tarefa salva', getTasks().some(t => t.text.includes(e.tasksHas)), e.tasksHas);
      if (e.chatHas) { const txt = lastAi().toLowerCase(); ok(c.id + ':chat responde', e.chatHas.every(s => txt.includes(s.toLowerCase())), lastAi().slice(0, 80)); }
      if (e.nowTitle) { const now = MusicPlayer.now(); ok(c.id + ':tocando', !!now && now.title.toLowerCase().includes(e.nowTitle), now?.title || 'nada'); }
      if (e.audioPaused) ok(c.id + ':pausado', !!document.querySelector('#musicAudio')?.paused);
      if (e.tabVisible) ok(c.id + ':aba', !$('#tab-' + e.tabVisible).hidden);
    } catch (err) { ok(c.id, false, 'exceção: ' + err.message); }
  }

  // ── restore total ──
  try { document.querySelector('#musicAudio')?.pause(); } catch {}
  const testLocalIds = LocalMusic.list().map(t => t.id).filter(id => !localIdsBefore.has(id));
  for (const id of testLocalIds) await LocalMusic.remove(id).catch(() => {});
  localStorage.clear();
  for (const [k, v] of Object.entries(lsSnap)) localStorage.setItem(k, v);
  MusicPlayer.queue.length = 0;
  for (const t of qbak) MusicPlayer.queue.push(t);
  loadConv(activeConv);
  renderTasks(); MusicPlayer.renderQueue(); MusicPlayer.renderLocal(); MusicPlayer.paintSide();
  try { document.querySelector('#musicAudio')?.removeAttribute('src'); } catch {}

  // ── relatório (após restore, p/ não ser apagado) ──
  const p = results.filter(r => r.ok).length;
  const fails = results.filter(r => !r.ok);
  const card = document.createElement('div');
  card.innerHTML = `<div class="logitem ${fails.length ? 'warn' : 'ok'}"><b>EVAL navegador: ${p}/${results.length} passou</b>${fails.length ? ' — falhas: ' + fails.map(f => f.id).join(', ') : ''}</div>`
    + results.map(r => `<div class="logitem ${r.ok ? 'ok' : 'warn'}">${r.ok ? '✓' : '✗'} ${r.id}${r.detail ? ' — ' + r.detail.slice(0, 100) : ''}</div>`).join('');
  $('#execLog').prepend(card);
  switchTab('log');
  document.title = `EVAL ${p}/${results.length}`;
  console.table(results);
  return { pass: p, total: results.length, fails: fails.map(f => f.id) };
};
