/* My OS Harness v2.1 — verifiers.js
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
  if ((toolsUsed || []).some(x => ['code_write', 'code_edit'].includes(String(x).toLowerCase()))) return { ok: true, pending: [] };
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
    createTask: /tarefa/i.test(t) && /(cri|adicion|nova)/i.test(t),
    listTasks: /tem.+tarefa|tenho.+tarefa|alguma tarefa|tarefa pendente|o que.*pendente|lista.*tarefa|mostra.*tarefa/i.test(t),
  };
  const used = new Set((ctx.toolsUsed || []).map(x => String(x).toLowerCase()));
  // REGRA ESTRITA: alegar que executou sem a tool ter rodado = pendência.
  // (confirmação textual só vale se a tool correspondente executou — sem exceção)
  if (wants.play && !used.has('music_search') && !used.has('music_play'))
    pend.push({ check: 'tarefa-tocar', reason: 'pediu tocar mas nenhuma música entrou no player', fix: 'use music_search e coloque o resultado no player antes de responder' });
  if (wants.download && !used.has('music_download'))
    pend.push({ check: 'tarefa-baixar', reason: 'pediu baixar mas nenhum download foi iniciado', fix: 'use music_download e confirme o arquivo antes de responder' });
  if (wants.createTask && !used.has('create_task'))
    pend.push({ check: 'tarefa-criar', reason: 'pediu criar tarefa mas nenhuma foi salva', fix: 'use create_task com o texto da tarefa antes de responder' });
  if (wants.listTasks && !used.has('list_tasks') && !/nenhuma tarefa|pendente\(s\)|tudo em dia/i.test(a))
    pend.push({ check: 'tarefa-ler', reason: 'perguntou de tarefas mas não leu a lista real', fix: 'use list_tasks e responda SÓ com os dados retornados' });
  if (wants.open && !used.has('open_site'))
    pend.push({ check: 'tarefa-abrir', reason: 'pediu abrir mas open_site não executou', fix: 'execute open_site e só então confirme' });
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
  if (/<tool\s+name=|["']name"\s*:\s*"[\w-]+".*arguments/i.test(a))
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
