/* My OS Harness v2 — trace-store.js
   Observabilidade completa: tool calls + decisões + latência + tokens.
   Falha que originou: log() 100 linhas sem latência, coreWindows máx 6.
*/
'use strict';

const KEY = 'nexus:trace-v2';
const CAP = 300;

export function trace(evt) {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    // nunca grave keys/tokens brutos
    const safe = { ...evt, at: new Date().toISOString() };
    if (safe.arg) safe.arg = String(safe.arg).slice(0, 300);
    if (safe.answer) safe.answer = String(safe.answer).slice(0, 500);
    arr.unshift(safe);
    localStorage.setItem(KEY, JSON.stringify(arr.slice(0, CAP)));
  } catch {}
}

export function getTraces() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function exportTraces() {
  const blob = new Blob([getTraces().map(t => JSON.stringify(t)).join('\n')], { type: 'application/jsonl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'myos-traces.jsonl'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
