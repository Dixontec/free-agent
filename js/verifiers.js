/* Free Agent Harness v2.1 — verifiers.js
   Verificação determinística com pendências estruturadas.
   Cada check retorna { ok, pending: [{check, reason, fix}] }.
*/
'use strict';

/* URLs de assets públicos em código (fontes, CDNs, imagens) não são alucinação. */
const ASSET_HOSTS = new Set([
  'images.unsplash.com', 'unsplash.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
  'cdnjs.cloudflare.com', 'unpkg.com', 'cdn.jsdelivr.net', 'cdn.tailwindcss.com',
  'stackpath.bootstrapcdn.com', 'maxcdn.bootstrapcdn.com', 'ajax.googleapis.com',
  'code.jquery.com', 'picsum.photos', 'via.placeholder.com', 'placehold.co',
  'i.ytimg.com', 'www.youtube-nocookie.com',
]);
export function assertNoHallucinatedURL(answer, toolOutputs, toolsUsed = []) {
  // Código gerado referencia assets externos por design — não há o que verificar.
  if ((toolsUsed || []).some(x => ['code_write', 'code_edit', 'browser_open', 'browser_inspect', 'browser_click', 'browser_type', 'browser_screenshot', 'browser_scroll'].includes(String(x).toLowerCase()))) return { ok: true, pending: [] };
  const urls = [...String(answer).matchAll(/https?:\/\/[^\s<")]+/g)].map(m => m[0]);
  const corpus = (toolOutputs || []).join('\n');
  const bad = urls.filter(u => {
    try { if (ASSET_HOSTS.has(new URL(u).hostname.replace(/^www\./, ''))) return false; } catch {}
    const id = (u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/) || [])[1];
    if (id) return !corpus.includes(id);
    try { const host = new URL(u).hostname; return !corpus.includes(host); }
    catch { return true; }
  });
  if (!bad.length) return { ok: true, pending: [] };
  return { ok: false, pending: [{ check: 'urls-verificadas', reason: `URLs sem fonte: ${bad.slice(0, 3).join(', ')}`, fix: 'remova URLs inventadas ou cite só links retornados pelas tools' }] };
}

export function assertSources(answer, toolOutputs, toolsUsed = []) {
  // links só são exigíveis quando houve pesquisa web — criar tarefa/tocar música não tem o que citar
  const webUsed = (toolsUsed || []).some(x => ['web_search', 'web_open', 'news'].includes(String(x).toLowerCase()));
  if (!webUsed) return { ok: true, pending: [] };
  const hasLink = /https?:\/\//.test(answer);
  if (!hasLink) return { ok: false, pending: [{ check: 'fontes-citadas', reason: 'pesquisou mas não citou links', fix: 'inclua os links reais retornados pela tool' }] };
  return { ok: true, pending: [] };
}

// Novo: a tarefa pedida foi realmente executada? (não basta responder bonito)
export function assertTaskComplete(userText, answer, ctx) {
  const t = String(userText || '').toLowerCase();
  const a = String(answer || '').toLowerCase();
  const pend = [];
  const wants = {
    play: /toca|toque|play|ouvir|m[uú]sica/.test(t) && !/youtube|v[ií]deo/.test(t),
    download: /baix|download/.test(t),
    open: /abr[ai]|acessa|mostra.*site/.test(t),
    news: /not[ií]cia/.test(t),
    routine: /rotina/.test(t),
    createTask: /tarefa/i.test(t) && /(cri|adicion|nova)/i.test(t) && !/agentes?/i.test(t),
    completeTask: /tarefa/i.test(t) && /(conclu|finaliz|termin|marcar.*(feito|conclu)|cumpriu|fez a tarefa|deu.*pronto)/i.test(t) && !/(cri|adicion|nova)/i.test(t),
    deleteTask: /tarefa/i.test(t) && /(delet|apag|remov|exclu)/i.test(t) && !/(cri|adicion|nova)/i.test(t),
    createNote: /\bnota/i.test(t) && /(cri|anote|anotar|adicion|salve|salvar|nova)/i.test(t) && !/(edit|atualiz|delet|apag|remov|exclu)/i.test(t),
    listNotes: /nota/i.test(t) && /lista|mostra|minhas?\s+nota|tem.{0,20}nota|alguma\s+nota/i.test(t) && !/(cri|anote|edit|delet|apag)/i.test(t),
    editNote: /nota/i.test(t) && /(edit|atualiz|mudar|alter)/i.test(t),
    deleteNote: /nota/i.test(t) && /(delet|apag|remov|exclu)/i.test(t),
    listTasks: /tem.+tarefa|tenho.+tarefa|alguma tarefa|tarefa pendente|o que.*pendente|lista.*tarefa|mostra.*tarefa/i.test(t),
    agentHistory: /o que (o|a|os|as)?\s*(agente\s+|subagente\s+)?[\wÀ-ú-]+\s+(fez|disse|respondeu|entregou|trabalhou)|(hist[óo]rico|conversa|contexto)\s+d[oae]s?\s+(sub-?)?agentes?|(o que|como)\s+(est[aá]|anda)\s+(o|a)\s+(agente|subagente)/i.test(t),
    createAgent: /(cri|monte|montar|fa[çc]a|adicion|nov[oa]s?)/i.test(t) && /sub-?agentes?|\bagentes?\b/i.test(t) && !/(delet|apag|remov|exclu)/i.test(t),
    delegate: /(?:deleg|pe[çc]a|pede|mande|manda|pergunt[ae]|perguntar)\s+(?:a|ao|para|pro|pra|aos?|às?)\s+[\wÀ-ú-]+|deleg/i.test(t),
    browserInspect: /inspecion|elementos.*(p[áa]gina|tela|navegador|browser)/i.test(t),
    browserScreenshot: /screenshot|print|captur.*(tela|p[áa]gina|navegador|browser)/i.test(t),
  };
  if (ctx && ctx.isSubagent) {
    wants.createAgent = false;
    wants.delegate = false;
  }
  const used = new Set((ctx.toolsUsed || []).map(x => String(x).toLowerCase()));
  // REGRA ESTRITA: alegar que executou sem a tool ter rodado = pendência.
  // (confirmação textual só vale se a tool correspondente executou — sem exceção)
  if (wants.play && !used.has('music_search') && !used.has('music_play'))
    pend.push({ check: 'tarefa-tocar', reason: 'pediu tocar mas nenhuma música entrou no player', fix: 'use music_search e coloque o resultado no player antes de responder' });
  if (wants.download && !used.has('music_download'))
    pend.push({ check: 'tarefa-baixar', reason: 'pediu baixar mas nenhum download foi iniciado', fix: 'use music_download e confirme o arquivo antes de responder' });
  if (wants.createTask && !used.has('create_task'))
    pend.push({ check: 'tarefa-criar', reason: 'pediu criar tarefa mas nenhuma foi salva', fix: 'use create_task com o texto da tarefa antes de responder' });
  if (wants.completeTask && !used.has('complete_task'))
    pend.push({ check: 'tarefa-concluir', reason: 'pediu concluir tarefa mas complete_task não executou', fix: 'use complete_task com o texto da tarefa antes de responder' });
  if (wants.deleteTask && !used.has('delete_task'))
    pend.push({ check: 'tarefa-deletar', reason: 'pediu deletar tarefa mas delete_task não executou', fix: 'use delete_task com o texto da tarefa antes de responder' });
  if (wants.createNote && !used.has('create_note'))
    pend.push({ check: 'nota-criar', reason: 'pediu criar nota mas create_note não executou', fix: 'use create_note com o conteúdo antes de responder' });
  if (wants.listNotes && !used.has('list_notes') && !/nenhuma nota/i.test(a))
    pend.push({ check: 'nota-ler', reason: 'perguntou de notas mas não leu a lista real', fix: 'use list_notes e responda SÓ com os dados retornados' });
  if (wants.editNote && !used.has('edit_note'))
    pend.push({ check: 'nota-editar', reason: 'pediu editar nota mas edit_note não executou', fix: 'use edit_note com match e novo texto antes de responder' });
  if (wants.deleteNote && !used.has('delete_note'))
    pend.push({ check: 'nota-deletar', reason: 'pediu deletar nota mas delete_note não executou', fix: 'use delete_note com o trecho da nota antes de responder' });
  if (wants.listTasks && !used.has('list_tasks') && !/nenhuma tarefa|pendente\(s\)|tudo em dia/i.test(a))
    pend.push({ check: 'tarefa-ler', reason: 'perguntou de tarefas mas não leu a lista real', fix: 'use list_tasks e responda SÓ com os dados retornados' });
  if (wants.open && !used.has('open_site') && !used.has('browser_open'))
    pend.push({ check: 'tarefa-abrir', reason: 'pediu abrir mas nem open_site nem browser_open executou', fix: 'execute browser_open ou open_site e só então confirme' });
  if (wants.agentHistory && !used.has('agent_history'))
    pend.push({ check: 'agente-historico', reason: 'perguntou sobre o que um agente fez mas o histórico dele não foi lido', fix: 'use agent_history com o nome do agente e responda só com o que ele mostra' });
  if (wants.createAgent && !used.has('agent_create') && !used.has('agent_update'))
    pend.push({ check: 'agente-criar', reason: 'pediu criar agente mas agent_create não executou', fix: 'use agent_create com name e instructions antes de responder' });
  if (used.has('agent_delegate')) {
    // Prime só entrega depois de analisar: a resposta precisa citar cada subagente que trabalhou.
    const normS = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normAns = normS(a);
    const names = [...new Set([...(ctx.toolOutputs || []).join('\n').matchAll(/\[(?:RESULTADO|FALHA) DO AGENTE ([^\]]+)\]/g)].map(m => m[1].trim()))];
    const miss = names.filter(n => !normAns.includes(normS(n)));
    if (names.length && miss.length)
      pend.push({ check: 'prime-analise', reason: `resposta não analisa a entrega de: ${miss.join(', ')}`, fix: 'cite cada subagente pelo nome com o que fez e seu veredito (ok/ressalva)' });
  }
  const askingToCreate = /(?:quer|deseja|posso)\s+que\s+(?:eu\s+)?crie\s+(?:um\s+)?(?:sub-?)?agente/i.test(a) ||
    /(?:n[ãa]o|nao)\s+(?:encontrei|achei|existe)\s+(?:o|a|nenhum)?\s*(?:sub-?)?agente/i.test(a);
  if (wants.delegate && !used.has('agent_delegate') && !askingToCreate)
    pend.push({ check: 'agente-delegar', reason: 'pediu delegar a subagente mas agent_delegate não executou', fix: 'se o subagente existir, use agent_delegate; se não existir, pergunte ao usuário se quer criá-lo' });
  if (wants.browserInspect && !used.has('browser_inspect'))
    pend.push({ check: 'browser-inspecionar', reason: 'pediu inspecionar mas browser_inspect não executou', fix: 'use browser_inspect para escanear a página antes de responder' });
  if (wants.browserScreenshot && !used.has('browser_screenshot'))
    pend.push({ check: 'browser-screenshot', reason: 'pediu screenshot mas browser_screenshot não executou', fix: 'use browser_screenshot para capturar a tela antes de responder' });
  if (wants.news && !used.has('web_search') && !used.has('news') && ctx.usedTool && !/https?:\/\//.test(a))
    pend.push({ check: 'tarefa-noticia', reason: 'pediu notícias mas sem dados verificados', fix: 'busque antes de resumir' });
  return pend.length ? { ok: false, pending: pend } : { ok: true, pending: [] };
}

export function assertRoutine(actions, results) {
  const failed = results.filter(r => !r.ok);
  if (failed.length) return { ok: false, pending: failed.map(f => ({ check: 'rotina', reason: `ação falhou: ${f.line.slice(0, 60)}`, fix: 'reexecute ou reporte a falha, nunca marque concluída' })) };
  const unknown = results.filter(r => /desconhecida|ignorada/i.test(r.detail || ''));
  if (unknown.length) return { ok: false, pending: unknown.map(u => ({ check: 'rotina', reason: `ação desconhecida: ${u.line.slice(0, 60)}`, fix: 'use só musica:/baixar:/abrir:/prompt:/skill:' })) };
  return { ok: true, pending: [] };
}

export function assertSkillSlug(slug, activeSlugs) {
  if (!activeSlugs.includes(slug)) return { ok: false, pending: [{ check: 'skill', reason: `skill inexistente/inativa: ${slug}`, fix: 'liste slugs válidos ao usuário' }] };
  return { ok: true, pending: [] };
}

// Novo: resposta final nunca pode ser uma chamada de tool crua (vazamento de sintaxe).
export function assertNoRawTool(answer) {
  const a = String(answer || '');
  if (/<tool\s+name=|<\/?agent_(create|list|update|delete|delegate|history)\b|["']name"\s*:\s*"[\w-]+".*arguments/i.test(a))
    return { ok: false, pending: [{ check: 'sem-tool-crua', reason: 'resposta é chamada de tool, não resposta final', fix: 'responda em pt-BR com os dados já obtidos, sem <tool>' }] };
  return { ok: true, pending: [] };
}

// Gate final estruturado: junta todos os pendentes
export function verifyFinal(answer, ctx) {
  const all = [];
  for (const c of [
    assertNoRawTool(answer),
    assertNoHallucinatedURL(answer, ctx.toolOutputs || [], ctx.toolsUsed || []),
    assertSources(answer, ctx.toolOutputs || [], ctx.toolsUsed || []),
    assertTaskComplete(ctx.userText || '', answer, ctx),
  ]) if (!c.ok) all.push(...c.pending);
  return all.length ? { ok: false, pending: all } : { ok: true, pending: [] };
}
