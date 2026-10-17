/* Free Agent Harness — eval automatizado (zero deps). Uso: node eval/run-eval.mjs
   Testa os módulos REAIS: registry, verifiers, gate, context-budget e o
   loop runReAct com LLM simulado (prova verifica→corrige→entrega).
   Exit 0 = tudo passou. Exit 1 = regressão (pronto p/ CI).
*/
'use strict';

// ── stubs de browser p/ módulos puros ──
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: k => void m.delete(k),
  };
})();

import { readFileSync } from 'node:fs';

const J = (p) => new URL(p, import.meta.url).href;
const { parseToolCall, buildToolsSection } = await import(J('../js/tools-registry.js'));
const V = await import(J('../js/verifiers.js'));
const G = await import(J('../js/gate.js'));
const C = await import(J('../js/context-budget.js'));
const { runReAct } = await import(J('../js/harness-core.js'));
const GOLDEN = JSON.parse(readFileSync(new URL('./golden-tasks.json', import.meta.url), 'utf8'));

let pass = 0, fail = 0;
const bad = [];
function t(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; bad.push(name); console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ── A. matriz de parse compartilhada ──
console.log('\n[A] parse de <tool> (golden-tasks.json × tools-registry)');
for (const c of GOLDEN.parse) {
  const r = parseToolCall(c.input);
  if (c.tool === null) t(`parse: "${c.input.slice(0, 30)}" → null`, r === null, JSON.stringify(r));
  else t(`parse: ${c.tool}`, r && r.name === c.tool && r.arg === c.arg, JSON.stringify(r));
}
t('tools section cita create_task/list_tasks',
  buildToolsSection(['a']).includes('create_task') && buildToolsSection(['a']).includes('list_tasks'));

// ── B. verifiers ──
console.log('\n[B] verificação determinística');
{
  const v = V.verifyFinal('Veja https://youtube.com/watch?v=ABCDEF12345', { toolOutputs: ['nada a ver'], usedTool: true, toolsUsed: ['web_search'], userText: 'pesquise IA' });
  t('url alucinada → pendente urls-verificadas', !v.ok && v.pending.some(p => p.check === 'urls-verificadas'), JSON.stringify(v.pending));
}
{
  const v = V.verifyFinal('Resumo com fonte https://example.com/x', { toolOutputs: ['dados de https://example.com/x'], usedTool: true, toolsUsed: ['web_search'], userText: 'pesquise' });
  t('resposta com fonte real → ok', v.ok);
}
{
  const v = V.verifyFinal('Pronto! Pesquisa feita, confia.', { toolOutputs: ['dados https://example.com'], usedTool: true, toolsUsed: ['web_search'], userText: 'pesquise' });
  t('usou tool sem citar link → pendente fontes-citadas', !v.ok && v.pending.some(p => p.check === 'fontes-citadas'));
}
{
  const v = V.verifyFinal('Pronto! Tarefa criada.', { toolOutputs: [], usedTool: false, toolsUsed: [], userText: 'crie uma tarefa comprar pão' });
  t('disse que criou sem salvar → pendente tarefa-criar', !v.ok && v.pending.some(p => p.check === 'tarefa-criar'));
}
{
  const v = V.verifyFinal('Tarefa criada: comprar pão', { toolOutputs: ['TAREFA CRIADA: comprar pão'], usedTool: true, toolsUsed: ['create_task'], userText: 'crie uma tarefa comprar pão' });
  t('tool executou + confirmação → ok', v.ok, JSON.stringify(v.pending));
}
{
  const v = V.verifyFinal('Você tem 20 tarefas, todas urgentes!', { toolOutputs: [], usedTool: false, toolsUsed: [], userText: 'tenho alguma tarefa pendente?' });
  t('chutou tarefas sem ler → pendente tarefa-ler', !v.ok && v.pending.some(p => p.check === 'tarefa-ler'));
}
{
  const v = V.assertRoutine(['musica: x', 'deleta: tudo'], [{ line: 'musica: x', ok: true }, { line: 'deleta: tudo', ok: false, detail: 'boom' }]);
  t('rotina com ação falha → pendente', !v.ok);
}
{
  const v = V.assertSkillSlug('skill-fantasma', ['pesquisa-web']);
  t('skill inexistente → pendente', !v.ok);
}

// ── C. gate/sandbox ──
console.log('\n[C] sandbox + segredos');
t('rm -rf bloqueado', G.sandboxCheck({ tool: 'web_open', arg: 'x; rm -rf /' }).ok === false);
t('host estranho exige aprovação (não bloqueia)', G.sandboxCheck({ tool: 'web_open', arg: 'https://site-obscuro-xyz.com/a' }).ok === true);
{
  const s = G.stripSecrets({ keys: { groq: 'gsk-secreto' }, cfg: { provider: 'groq', baseUrl: 'u' } });
  t('stripSecrets zera keys', s.keys.groq !== 'gsk-secreto' && !('baseUrl' in (s.cfg || {})));
}

// ── D. orçamento de contexto ──
console.log('\n[D] contexto = orçamento');
{
  const b = C.buildBudget({ history: [], summary: '', toolResult: 'x'.repeat(5000) });
  t('resultado >4k vira offload com ref', !!b.offloaded && b.offloaded.ref.startsWith('file://'));
  const b2 = C.buildBudget({ history: [], summary: '', toolResult: 'curto' });
  t('resultado curto fica inline', !b2.offloaded);
  t('estimateTokens ~ len/4', C.estimateTokens('a'.repeat(400)) === 100);
}

// ── E. loop real: verifica → corrige → entrega ──
console.log('\n[E] runReAct com LLM simulado');
const base = { history: [], cfg: { model: 'eval' }, getSkills: () => [], uiConfirm: async () => true, onStatus: () => {} };
{
  // modelo mente → correção AGE (chama a tool) → entrega verificada
  let n = 0;
  const seen = [];
  const llm = async () => (++n === 1
    ? 'Pronto! Tarefa criada.'
    : n === 2
      ? '<tool name="create_task">comprar pão</tool>'
      : 'Tarefa criada: comprar pão');
  const r = await runReAct('crie uma tarefa comprar pão', {
    ...base,
    callLLM: llm,
    execToolReal: async (name) => { seen.push(name); return `TAREFA CRIADA: comprar pão`; },
  });
  t('mente que terminou → correção chama tool → entregue ok', r.ok === true && r.corrections === 1 && seen.includes('create_task'), JSON.stringify({ ok: r.ok, c: r.corrections, seen }));
}
{
  let step = 0;
  const llm2 = async () => (++step === 1
    ? '<tool name="web_search">IA</tool>'
    : 'Resumo com fonte https://example.com/ia');
  const seen = [];
  const r = await runReAct('pesquise sobre IA', { ...base, callLLM: llm2, execToolReal: async (name, arg) => { seen.push(name); return 'DADOS https://example.com/ia sobre IA'; } });
  t('tool executada + fonte citada → ok sem correção', r.ok === true && r.corrections === 0 && seen.includes('web_search'), JSON.stringify({ ok: r.ok, c: r.corrections }));
}
{
  const llm = async () => 'feito.';
  const r = await runReAct('crie uma tarefa X', { ...base, callLLM: llm, execToolReal: async () => 'n/a' });
  t('modelo teimoso → máx 2 correções → entrega com pendência explícita', r.ok === false && r.corrections === 2 && (r.pending || []).length > 0, JSON.stringify({ ok: r.ok, c: r.corrections }));
}

// ── F. sanidade do golden ──
console.log('\n[F] golden-tasks.json íntegro');
t('todo parse-case tem input', GOLDEN.parse.every(c => typeof c.input === 'string'));
t('todo browser-case tem id+input+expect', GOLDEN.browser.every(c => c.id && typeof c.input === 'string' && c.expect));

// ── resumo ──
console.log(`\n═══ eval: ${pass} passou, ${fail} falhou ═══`);
if (bad.length) console.log('falhas: ' + bad.join(' | '));
process.exit(fail ? 1 : 0);
