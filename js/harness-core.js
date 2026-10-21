/* Free Agent Harness v2.1 — harness-core.js
   Loop: executa → VERIFICA se terminou → se pendência, pede correção → só então entrega.
*/
'use strict';
import { buildToolsSection, parseToolCall } from './tools-registry.js';
const PL = () => (typeof window !== 'undefined' && window.I18N && window.I18N.promptLang) ? window.I18N.promptLang() : 'pt-BR';
import { buildBudget, summarizeOld } from './context-budget.js';
import { verifyFinal, assertBrowserEvidence } from './verifiers.js';
import { sandboxCheck, requestApproval } from './gate.js';
import { trace } from './trace-store.js';

const LIMITS = { maxSteps: 8, llmTimeoutMs: 25000, totalMs: 90000, maxCorrections: 2 };

async function callWithTimeout(callLLM, msgs, opts = {}) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), opts.timeoutMs || LIMITS.llmTimeoutMs);
  try {
    return await Promise.race([
      callLLM(msgs, opts),
      new Promise((_, rej) => c.signal.addEventListener('abort', () => rej(new Error('LLM timeout 25s')))),
    ]);
  } finally { clearTimeout(id); }
}

export async function runReAct(userText, deps) {
  const browserEvidence = [];
  const result = await runReActImpl(userText, deps, browserEvidence);
  const check = assertBrowserEvidence(result.answer, { browserEvidence });
  if (!check.ok) return { ...result, ok: false, pending: [...(result.pending || []), ...check.pending], answer: result.answer + '\n\n[Pendente: uma ação do navegador não teve efeito confirmado.]' };
  return result;
}

function correctionPrompt(pending) {
  const items = pending.map((p, i) => `${i + 1}. [${p.check}] ${p.reason} → correção: ${p.fix}`).join('\n');
  return `Sua resposta foi REJEITADA na verificação determinística. Pendências:\n${items}\n\nSe o fix exigir tool, responda APENAS com a chamada (ex.: <tool name="create_task">texto</tool>) e o sistema executa. Senão, responda a versão corrigida completa usando SÓ dados já obtidos. Se impossível cumprir, diga exatamente o que falta em 1 frase.`;
}

// Fontes reais obtidas pelas tools — usado p/ auto-anexar quando o modelo resume sem citar.
function extractUrls(toolOutputs, max = 5) {
  const seen = new Set();
  const out = [];
  for (const t of (toolOutputs || [])) {
    for (const m of String(t).matchAll(/https?:\/\/[^\s<")]+/g)) {
      let u = m[0].replace(/[.,;)\]]+$/, '');
      if (!seen.has(u) && /^https?:\/\//.test(u)) { seen.add(u); out.push(u); }
      if (out.length >= max) return out;
    }
  }
  return out;
}

// Se pesquisou mas respondeu sem link, anexa Fontes reais (do corpus) em vez de rejeitar em loop.
function withAutoSources(answer, ctx) {
  const a = String(answer || '');
  const usedWeb = (ctx.toolsUsed || []).some(x => ['web_search', 'web_open', 'news'].includes(String(x).toLowerCase()));
  if (!usedWeb || /https?:\/\//.test(a)) return a;
  const urls = extractUrls(ctx.toolOutputs || []);
  if (!urls.length) return a;
  return `${a.trim()}\n\nFontes:\n${urls.map(u => `- ${u}`).join('\n')}`;
}

// Linhas de controle do loop (não são dados reais — nunca vão p/ resposta final).
function isControlLine(s) {
  return /^\[(busca repetida|limite de buscas|correção|tool .+ ignorada|busca .+ ignorada)/i.test(String(s || '').trim());
}
function realCorpus(toolOutputs) {
  return (toolOutputs || []).filter(t => !isControlLine(String(t))).join('\n');
}
function hasRealData(toolOutputs) {
  const c = realCorpus(toolOutputs);
  return c.length > 120 && /https?:\/\//.test(c);
}

function fallbackFromTools(userText, toolOutputs, toolsUsed) {
  const corpus = realCorpus(toolOutputs);
  if (!corpus.trim()) return `Não consegui buscar dados agora (fontes fora do ar). Tente de novo em instantes, ou use /news tecnologia — e confira sua conexão.`;
  const urls = extractUrls(toolOutputs || [], 6);
  const seen = new Set();
  const lines = corpus.split('\n').map(s => s.trim())
    .filter(s => s && !/sem resultados\.? tente reformular/i.test(s))
    .filter(s => { const k = s.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; })
    .filter(s => /^[-•\d]/.test(s) || s.length > 40).slice(0, 10);
  if (!lines.length && !urls.length) return `Busquei nas fontes, mas todas voltaram vazias agora. Tente de novo em instantes ou use /news tecnologia (caminho direto, sem IA).`;
  const body = lines.length ? lines.join('\n') : corpus.slice(0, 1500);
  return `Aqui está o que encontrei sobre "${String(userText || '').slice(0, 80)}":\n\n${body}${urls.length ? `\n\nFontes:\n${urls.map(u => `- ${u}`).join('\n')}` : ''}`;
}

async function runReActImpl(userText, deps, browserEvidence) {
  const { history, cfg, callLLM, getSkills } = deps;
  const onStatus = deps.onStatus || (() => {});
  const t0 = Date.now();
  const activeSlugs = (getSkills?.() || []).filter(s => s.active).map(s => s.slug);
  const toolsSection = buildToolsSection(activeSlugs);
  const wsNote = deps.workspace
    ? `\n[WORKSPACE ativo: ${deps.workspace} — arquivos do projeto via code_read/code_list/code_glob/code_grep/code_write/code_edit/code_bash.]`
    : `\n[Sem workspace autorizado: se pedir criar/ler/editar código, use code_* mesmo assim (o sistema orienta a autorizar a pasta) ou explique Configurações → Coding → Autorizar pasta.]`;
  const memBlock = (typeof window !== 'undefined' && window.__agentMemoryFn) ? window.__agentMemoryFn() : '';
  const systemBase = `Você é o Free Agent. Responda em ${PL()}, direto.\n${toolsSection}${wsNote}${memBlock}\nRegra: se dá p/ responder direto, RESPONDA DIRETO sem tool. Só chame tool se pedir dado externo/ação. web_search SÓ quando o usuário pedir busca expressamente (pesquise/busque/notícias/preço/clima) — NUNCA pesquise do nada para complementar ou enfeitar a resposta; responda do seu conhecimento. 1 tool por turno ou resposta final. Máx ${LIMITS.maxSteps} passos. NUNCA use JSON {"name":...} — só <tool name="...">. Se o usuário corrigir algo claramente ("não é…", "na verdade…", "esquece isso", "lembra que…"), confirme a correção e chame save_correction. Antes de responder, confira: cumpri o pedido? citei links reais só se pesquisei?`;
  const toolOutputs = [];
  const toolsUsed = [];
  const searchQs = [];
  let usedTool = false;
  let summary = deps.summary || '';
  let corrections = 0;

  // executor único de tools (caminho normal + correções que agem)
  // Gate anti-tool-desnecessária, em 2 níveis:
  //  · web_search → EXIGE pedido expresso de busca/notícia/preço/clima/etc. Nunca do nada.
  //  · web_open   → gatilho amplo (página que o usuário indicou/colou).
  const SEARCH_RE = /pesquis|busc|not[ií]cias?|procure|procurar|google|bing|duckduckgo|wiki|pre[çc]os?|clima|cota[çc]|ultim[oa]s?|atualiza|manchete|apuro|curiosidad|defini[çc]|significad|hist[óo]ria d[ao]|compar|versus|\bvs\b/i;
  const needsSearchFor = () => SEARCH_RE.test(String(userText || ''));
  const NEEDS_RE = /not[ií]cia|\bnota|pesquis|busc|atual|hoje|recente|2024|2025|2026|abrir|acess|ver\s+site|youtube|v[ií]deo|tarefa|pendente|toca|toque|play|m[uú]sica|baixar|download|skill|rotina|pre[çc]o|clima|dado|fonte|link/i;
  const needsToolFor = (t) => NEEDS_RE.test(String(userText || '')) || toolOutputs.length > 0;
  async function runToolCall(tool, step) {
    if (tool.name === 'web_search' && !needsSearchFor()) {
      trace({ kind: 'tool-skip-unneeded', step, tool: tool.name });
      toolOutputs.push(`[Tool web_search ignorada — busca só quando pedir expressamente. Responda direto em ${PL()}.]`);
      return;
    }
    if (tool.name === 'web_open' && !needsToolFor()) {
      trace({ kind: 'tool-skip-unneeded', step, tool: tool.name });
      toolOutputs.push(`[Tool ${tool.name} ignorada — pedido não exige dado externo. Responda direto em ${PL()}.]`);
      return;
    }
    // Anti-loop com memória: mesma pergunta pode repetir (cache do execTool devolve na hora);
    // só bloqueia a partir da 3ª busca idêntica ou 4ª busca total no pedido.
    if (tool.name === 'web_search') {
      const nq = String(tool.arg || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      searchQs.push(nq);
      const sameCount = searchQs.filter(x => x && x === nq).length;
      if (searchQs.length > 4 || sameCount > 3) {
        trace({ kind: 'tool-skip-dup', step, tool: tool.name });
        toolOutputs.push(`[Limite de buscas atingido — use os resultados já obtidos acima e responda final com fontes.]`);
        return;
      }
    }
    const sb = sandboxCheck(tool);
    if (!sb.ok) { trace({ kind: 'gate-deny', step, tool: tool.name }); toolOutputs.push(`BLOQUEADO: ${sb.reason}`); usedTool = true; return; }
    const needAppr = (tool.name === 'open_site') || sb.needApproval;
    if (needAppr) {
      const ok = await requestApproval({ ...tool, uiConfirm: deps.uiConfirm });
      if (!ok) { trace({ kind: 'gate-deny-user', step, tool: tool.name }); toolOutputs.push('Usuário negou a ação. Peça alternativa.'); usedTool = true; return; }
    }
    onStatus({ phase: 'tool', step, tool: tool.name, arg: tool.arg });
    const s2 = performance.now();
    try {
      const res = await deps.execToolReal(tool.name, tool.arg);
      if (tool.name.startsWith('browser_') && typeof res === 'string' && res.startsWith('[BROWSER_RESULT]')) {
        try { const evidence = JSON.parse(res.slice('[BROWSER_RESULT]'.length)); browserEvidence.push({ tool: tool.name, verified: evidence.verified === true, performed: evidence.performed === true }); } catch { browserEvidence.push({ tool: tool.name, verified: false }); }
      }
      toolOutputs.push(typeof res === 'string' ? res.slice(0, 6500) : JSON.stringify(res).slice(0, 6500));
      usedTool = true; toolsUsed.push(tool.name);
      trace({ kind: 'tool', step, tool: tool.name, ms: Math.round(performance.now() - s2), ok: true });
    } catch (e) { toolOutputs.push(`FALHA NA FERRAMENTA: ${e.message}`); usedTool = true; toolsUsed.push(tool.name); trace({ kind: 'tool', step, tool: tool.name, ok: false, err: e.message }); }
  }

  for (let step = 1; step <= LIMITS.maxSteps; step++) {
    if (Date.now() - t0 > LIMITS.totalMs) return { answer: 'Tempo esgotado (90s). Tente uma pergunta menor.', ok: false, pending: [{ check: 'tempo', reason: 'estourou 90s', fix: 'pergunta menor' }] };
    const budget = buildBudget({ history, summary, toolResult: toolOutputs.slice(-1)[0] || '' });
    if (budget.over) summary = await summarizeOld(history, callLLM);

    const msgs = [
      { role: 'system', content: systemBase + (summary ? `\n[RESUMO]\n${summary}` : '') },
      ...budget.tail.map(m => ({ role: m.role, content: m.content })),
      ...(step === 1 ? [{ role: 'user', content: userText }] : [{ role: 'user', content: step >= LIMITS.maxSteps - 2 ? `[RESULTADO]\n${budget.result}\nResponda final AGORA em ${PL()} com os dados acima, citando links. NÃO chame tool.` : `[RESULTADO]\n${budget.result}\nResponda final com fontes ou chame 1 tool.` }]),
    ];
    const s = performance.now();
    let out;
    try { out = await callWithTimeout(callLLM, msgs); }
    catch (e) {
      if (/timeout|network|fetch|5\d\d/i.test(e.message) && !deps._retried) {
        deps._retried = true; trace({ kind: 'llm-retry', step, err: e.message }); continue;
      }
      trace({ kind: 'llm-fail', step, err: e.message }); return { answer: `Falha na API: ${e.message}`, ok: false, pending: [] };
    }
    trace({ kind: 'llm', step, ms: Math.round(performance.now() - s), model: cfg.model, usedTool });

    const tool = parseToolCall(out);
    if (!tool) {
      // ── VERIFICAÇÃO antes de entregar (com auto-fontes p/ não travar em loop) ──
      onStatus({ phase: 'verifying', step });
      const ctx = { toolOutputs, usedTool, toolsUsed, userText, browserEvidence };
      out = withAutoSources(out, ctx);
      const v = verifyFinal(out, ctx);
      if (v.ok) return { answer: out, ok: true, corrections, toolsUsed };
      // ── PENDÊNCIA: pede correção ao modelo (até maxCorrections) ──
      if (corrections >= LIMITS.maxCorrections) {
        trace({ kind: 'verify-fail-final', pending: v.pending.map(p => p.check) });
        return { answer: out + `\n\n[Pendente: ${v.pending.map(p => p.reason).join(' | ')}]`, ok: false, pending: v.pending, corrections, toolsUsed };
      }
      corrections++;
      onStatus({ phase: 'correcting', step, pending: v.pending, attempt: corrections });
      trace({ kind: 'verify-reject', step, pending: v.pending.map(p => p.check), attempt: corrections });
      try {
        const fixed = await callWithTimeout(callLLM, [
          { role: 'system', content: systemBase },
          { role: 'user', content: `Pedido original: ${userText}\n\nSua resposta rejeitada:\n${out.slice(0, 4000)}\n\n${correctionPrompt(v.pending)}` },
        ]);
        // correção pode AGIR (chamar a tool que faltou) — executa e volta ao loop
        const fixTool = parseToolCall(fixed);
        if (fixTool) {
          trace({ kind: 'verify-correct-tool', step, tool: fixTool.name, attempt: corrections });
          await runToolCall(fixTool, step);
          continue;
        }
        const v2 = verifyFinal(fixed, ctx);
        if (v2.ok) return { answer: fixed, ok: true, corrections, toolsUsed };
        const healed = withAutoSources(fixed, ctx);
        if (healed !== fixed) {
          const v3 = verifyFinal(healed, ctx);
          if (v3.ok) return { answer: healed, ok: true, corrections, toolsUsed };
        }
        out = fixed; // mantém a corrigida p/ próxima iteração do loop não perder contexto
        toolOutputs.push(`[CORREÇÃO ${corrections} rejeitada: ${v2.pending.map(p => p.reason).join(' | ')}]`);
        continue;
      } catch (e) { return { answer: out, ok: false, pending: v.pending, corrections, toolsUsed }; }
    }
    // Nos 2 últimos passos: não executa mais tool — força resposta final com o que já tem.
    if (step >= LIMITS.maxSteps - 1) {
      trace({ kind: 'force-final', step, tool: tool.name });
      onStatus({ phase: 'verifying', step });
      try {
        const forced = await callWithTimeout(callLLM, [
          { role: 'system', content: systemBase },
          { role: 'user', content: `Pedido original: ${userText}\n\nDados já obtidos:\n${realCorpus(toolOutputs).slice(0, 6000)}\n\nResponda final AGORA em ${PL()}, em tópicos curtos, citando os links acima. NÃO chame tool. NÃO use JSON.` },
        ]);
        // Se mesmo forçado o modelo cuspiu tool crua, descarta e usa fallback com dados reais.
        if (parseToolCall(forced)) {
          trace({ kind: 'force-final-tool-leak', step });
          const fbLeak = fallbackFromTools(userText, toolOutputs, toolsUsed);
          if (toolOutputs.length) { const okLeak = hasRealData(toolOutputs); return { answer: fbLeak, ok: okLeak, pending: okLeak ? [] : [{ check: 'fontes', reason: 'fontes fora do ar', fix: 'tente de novo' }], corrections, toolsUsed }; }
        } else {
          const ctxF = { toolOutputs, usedTool: true, toolsUsed, userText };
          const healedF = withAutoSources(forced, ctxF);
          const vF = verifyFinal(healedF, ctxF);
          if (vF.ok) return { answer: healedF, ok: true, corrections, toolsUsed };
          // Forçado mas ainda com pendência leve (ex.: sem link e sem URL no corpus):
          // entrega o melhor esforço com os dados reais em vez de vazar tool.
          if (toolOutputs.length && !parseToolCall(healedF)) { const okH = hasRealData(toolOutputs); return { answer: healedF, ok: okH, pending: okH ? [] : [{ check: 'fontes', reason: 'sem fontes citáveis', fix: 'tente de novo' }], corrections, toolsUsed }; }
        }
      } catch {}
      const fb = fallbackFromTools(userText, toolOutputs, toolsUsed);
      if (toolOutputs.length) { const okFb = hasRealData(toolOutputs); return { answer: fb, ok: okFb, pending: okFb ? [] : [{ check: 'fontes', reason: 'fontes fora do ar', fix: 'tente de novo' }], corrections, toolsUsed }; }
    }
    await runToolCall(tool, step);
  }
  // Fallback útil (nunca vazio): se já buscou algo, entrega síntese + fontes.
  if (toolOutputs.length) {
    const fb = fallbackFromTools(userText, toolOutputs, toolsUsed);
    trace({ kind: 'steps-exhausted-fallback', tools: toolsUsed });
    const okEx = hasRealData(toolOutputs);
    return { answer: fb, ok: okEx, pending: okEx ? [] : [{ check: 'fontes', reason: 'fontes fora do ar', fix: 'tente de novo' }], corrections, toolsUsed };
  }
  return { answer: 'Limite de 8 passos sem resposta verificada. Refine a pergunta.', ok: false, pending: [], corrections, toolsUsed };
}
