/* My OS Harness v2 — context-budget.js
   Contexto é orçamento: compacta em vez de truncar, offload >4k.
   Falha que originou: history.slice(-10) cego + truncate 6000 chars.
*/
'use strict';

const OFFLOAD_CHARS = 4000;

export function estimateTokens(s) { return Math.ceil(String(s || '').length / 4); }

export function buildBudget({ history, summary, toolResult, limit = 12000 }) {
  // prioridade: system fora daqui. Aqui: resumo + últimas 6 + resultado atual
  const tail = history.slice(-6);
  let used = estimateTokens(summary) + tail.reduce((a, m) => a + estimateTokens(m.content), 0);
  let result = toolResult || '';
  let offloaded = null;
  if (result.length > OFFLOAD_CHARS) {
    offloaded = { ref: `file://tool-output-${Date.now().toString(36)}.md`, preview: result.slice(0, OFFLOAD_CHARS) };
    result = `${offloaded.preview}\n\n[…truncado: ver ${offloaded.ref} (${result.length} chars)]`;
  }
  used += estimateTokens(result);
  // compactação coercitiva: se >85%, resume cauda antiga
  const over = used > limit * 0.85;
  return { tail, summary, result, offloaded, used, over, limit };
}

export async function summarizeOld(history, callLLM) {
  // resume tudo exceto últimas 6; chamado quando over=true
  const old = history.slice(0, -6);
  if (old.length < 4) return '';
  const txt = old.map(m => `${m.role}: ${m.content}`).join('\n').slice(0, 8000);
  try {
    const out = await callLLM([
      { role: 'system', content: 'Resuma a conversa em 8 bullets factuais pt-BR, preservando URLs, nomes e decisões. Sem opinião.' },
      { role: 'user', content: txt },
    ], { maxTokens: 600 });
    return out.slice(0, 2000);
  } catch { return old.slice(-2).map(m => `${m.role}: ${String(m.content).slice(0, 200)}`).join('\n'); }
}
