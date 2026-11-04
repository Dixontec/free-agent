/* Free Agent Harness v2 — tools-registry.js
   4 tools distintas, schemas sob demanda. Nada é despejado no prompt.
   Falha que originou: skillsCtx() jogava 9 prompts no system todo turno.
*/
'use strict';

export const TOOLS = {
  web_search: {
    desc: 'Buscar fato atual/externo (Wiki + DDG + HN). SÓ se o usuário pedir busca expressamente (pesquise/busque/notícias/preço/clima).',
    schema: { type: 'object', properties: { query: { type: 'string', maxLength: 200 } }, required: ['query'] },
    needsApproval: false,
    renderHint: () => `<tool name="web_search">sua consulta</tool>`,
  },
  web_open: {
    desc: 'Ler 1 página http(s). Só URL retornada por web_search ou do usuário.',
    schema: { type: 'object', properties: { url: { type: 'string', pattern: '^https?://' } }, required: ['url'] },
    needsApproval: false,
    renderHint: () => `<tool name="web_open">https://...</tool>`,
  },
  run_skill: {
    desc: 'Executar 1 skill do catálogo ativo, por slug exato.',
    // schema carregado sob demanda: só slugs ativos, não prompts inteiros
    schemaOf: (activeSlugs) => ({ type: 'object', properties: { slug: { type: 'string', enum: activeSlugs } }, required: ['slug'] }),
    needsApproval: false,
    renderHint: (slugs) => `slugs: ${slugs.join(' · ')}`,
  },
  open_site: {
    desc: 'Exibir site/vídeo no chat. Só com pedido explícito abrir/ver/acessar.',
    schema: { type: 'object', properties: { alvo: { type: 'string', maxLength: 200 } }, required: ['alvo'] },
    needsApproval: true, // gating: abre janela/iframe → confirma
    renderHint: () => `<tool name="open_site">youtube | gmail | URL</tool>`,
  },
  code_read: {
    desc: 'Ler arquivo do projeto (offset/limit). Leia antes de editar.',
    schema: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['path'] },
    needsApproval: false,
    renderHint: () => `<tool name="code_read">{"path":"src/app.js","limit":120}</tool>`,
  },
  code_list: {
    desc: 'Listar pasta do projeto.',
    schema: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
    needsApproval: false,
    renderHint: () => `<tool name="code_list">{}</tool>`,
  },
  code_glob: {
    desc: 'Achar arquivos por padrão (*, **, ?).',
    schema: { type: 'object', properties: { pattern: { type: 'string' }, max: { type: 'number' } }, required: ['pattern'] },
    needsApproval: false,
    renderHint: () => `<tool name="code_glob">{"pattern":"src/**/*.js"}</tool>`,
  },
  code_grep: {
    desc: 'Buscar texto (regex) no projeto.',
    schema: { type: 'object', properties: { pattern: { type: 'string' }, include: { type: 'string' }, max: { type: 'number' } }, required: ['pattern'] },
    needsApproval: false,
    renderHint: () => `<tool name="code_grep">{"pattern":"TODO","include":"*.js"}</tool>`,
  },
  code_write: {
    desc: 'Criar/sobrescrever arquivo INTEIRO (cria pastas). P/ novo ou reescrita grande.',
    schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    needsApproval: false, // permissão própria (plan/build + allow/ask/deny) + preview de diff
    renderHint: () => `<tool name="code_write">{"path":"src/novo.js","content":"..."}</tool>`,
  },
  code_edit: {
    desc: 'Troca precisa old_string→new_string (exato). P/ mudança pequena.',
    schema: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] },
    needsApproval: false, // permissão própria + preview de diff
    renderHint: () => `<tool name="code_edit">{"path":"f","old_string":"a","new_string":"b"}</tool>`,
  },
  code_bash: {
    desc: 'Shell no projeto (exige bridge.py + permissão; negado sem bridge).',
    schema: { type: 'object', properties: { cmd: { type: 'string', maxLength: 4000 }, timeout_ms: { type: 'number' } }, required: ['cmd'] },
    needsApproval: false, // permissão própria (default deny)
    renderHint: () => `<tool name="code_bash">{"cmd":"npm test"}</tool>`,
  },
  music_search: {
    desc: 'Buscar música livre (Archive.org + Wikimedia, sem chave).',
    schema: { type: 'object', properties: { query: { type: 'string', maxLength: 100 } }, required: ['query'] },
    needsApproval: false,
    renderHint: () => `<tool name="music_search">lofi</tool>`,
  },
  music_download: {
    desc: 'Baixar MP3 gratuito do 1º resultado (ou music_play p/ só tocar).',
    schema: { type: 'object', properties: { query: { type: 'string', maxLength: 100 } }, required: ['query'] },
    needsApproval: false,
    renderHint: () => `<tool name="music_download">jazz</tool>`,
  },
  create_task: {
    desc: 'Criar tarefa na aba Tarefas. Use quando pedir criar/adicionar tarefa.',
    schema: { type: 'object', properties: { text: { type: 'string', maxLength: 200 } }, required: ['text'] },
    needsApproval: false,
    renderHint: () => `<tool name="create_task">texto da tarefa</tool>`,
  },
  list_tasks: {
    desc: 'Ler tarefas salvas (pendentes + concluídas). Use quando perguntar se tem tarefa/pendência.',
    schema: { type: 'object', properties: {} },
    needsApproval: false,
    renderHint: () => `<tool name="list_tasks"></tool>`,
  },
  complete_task: {
    desc: 'Concluir/marcar tarefa como feita na aba Tarefas. Use quando pedir concluir/fazer/terminar tarefa.',
    schema: { type: 'object', properties: { text: { type: 'string', maxLength: 200 } }, required: ['text'] },
    needsApproval: false,
    renderHint: () => `<tool name="complete_task">texto (ou parte) da tarefa</tool>`,
  },
  delete_task: {
    desc: 'Deletar/remover tarefa da aba Tarefas. Use quando pedir deletar/apagar/remover tarefa.',
    schema: { type: 'object', properties: { text: { type: 'string', maxLength: 200 } }, required: ['text'] },
    needsApproval: false,
    renderHint: () => `<tool name="delete_task">texto (ou parte) da tarefa</tool>`,
  },
  create_note: {
    desc: 'Criar nota na aba Notas. Use quando pedir criar/anotar/anote nota.',
    schema: { type: 'object', properties: { title: { type: 'string', maxLength: 120 }, text: { type: 'string', maxLength: 4000 } }, required: ['text'] },
    needsApproval: false,
    renderHint: () => `<tool name="create_note">{"title":"Título","text":"conteúdo"}</tool>`,
  },
  list_notes: {
    desc: 'Ler notas salvas. Use quando perguntar se tem nota/minhas notas.',
    schema: { type: 'object', properties: {} },
    needsApproval: false,
    renderHint: () => `<tool name="list_notes"></tool>`,
  },
  edit_note: {
    desc: 'Editar nota existente (por trecho do texto/título ou nº). Use quando pedir editar/atualizar nota.',
    schema: { type: 'object', properties: { match: { type: 'string', maxLength: 200 }, text: { type: 'string', maxLength: 4000 } }, required: ['match', 'text'] },
    needsApproval: false,
    renderHint: () => `<tool name="edit_note">{"match":"trecho da nota","text":"novo conteúdo"}</tool>`,
  },
  delete_note: {
    desc: 'Deletar nota da aba Notas. Use quando pedir deletar/apagar/remover nota.',
    schema: { type: 'object', properties: { match: { type: 'string', maxLength: 200 } }, required: ['match'] },
    needsApproval: false,
    renderHint: () => `<tool name="delete_note">trecho da nota ou nº</tool>`,
  },
  list_convs: {
    desc: 'Listar conversas salvas (id + título + data). Use quando pedir ler/ver conversas anteriores.',
    schema: { type: 'object', properties: {} },
    needsApproval: false,
    renderHint: () => `<tool name="list_convs"></tool>`,
  },
  read_conv: {
    desc: 'Ler mensagens de uma conversa salva (por trecho do título ou id). Use quando pedir ler/achar info em conversa antiga.',
    schema: { type: 'object', properties: { match: { type: 'string', maxLength: 200 } }, required: ['match'] },
    needsApproval: false,
    renderHint: () => `<tool name="read_conv">{"match":"trecho do título ou id"}</tool>`,
  },
  save_correction: {
    desc: 'Salvar uma correção/preferência do usuário na Memória do Agente. Use quando o usuário corrigir algo claramente.',
    schema: { type: 'object', properties: { text: { type: 'string', maxLength: 400 } }, required: ['text'] },
    needsApproval: false,
    renderHint: () => `<tool name="save_correction">resumo da correção em 1 linha</tool>`,
  },
  browser_open: {
    desc: 'Abrir URL no navegador embutido persistente. Use quando pedir abrir site no navegador ou navegar.',
    schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    needsApproval: false,
    renderHint: () => `<tool name="browser_open">https://...</tool>`,
  },
  browser_inspect: {
    desc: 'Computer Use: Inspecionar página no navegador embutido. Retorna lista [#1, #2...] de botões, links e campos interativos.',
    schema: { type: 'object', properties: { selector: { type: 'string' } } },
    needsApproval: false,
    renderHint: () => `<tool name="browser_inspect"></tool>`,
  },
  browser_click: {
    desc: 'Computer Use: Clicar em elemento do navegador por [#número], seletor ou texto. Mostra pulso visual.',
    schema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
    needsApproval: false,
    renderHint: () => `<tool name="browser_click">#1</tool>`,
  },
  browser_type: {
    desc: 'Computer Use: Digitar texto em campo do formulário no navegador.',
    schema: { type: 'object', properties: { target: { type: 'string' }, text: { type: 'string' }, enter: { type: 'boolean' } }, required: ['text'] },
    needsApproval: false,
    renderHint: () => `<tool name="browser_type">{"target":"#1","text":"termo","enter":true}</tool>`,
  },
  browser_screenshot: {
    desc: 'Computer Use: Capturar tela (screenshot) do navegador embutido e exibir no monitor do agente.',
    schema: { type: 'object', properties: {} },
    needsApproval: false,
    renderHint: () => `<tool name="browser_screenshot"></tool>`,
  },
  agent_create: {
    desc: 'Criar subagente(s) com nome e instruções definidas pelo agente principal.',
    schema: { type: 'object', properties: { name: { type: 'string' }, instructions: { type: 'string' }, icon: { type: 'string' } }, required: ['name', 'instructions'] },
    needsApproval: false,
    renderHint: () => `<tool name="agent_create">{"name":"Pesquisador","instructions":"..."}</tool>`,
  },
  agent_history: {
    desc: 'Ler o histórico de conversa de um subagente (filtro por período).',
    schema: { type: 'object', properties: { agent: { type: 'string' }, since: { type: 'string' }, limit: { type: 'number' } }, required: [] },
    needsApproval: false,
    renderHint: () => `<tool name="agent_history">{"agent":"Redator","since":"hoje"}</tool>`,
  },
  agent_list: { desc: 'Listar subagentes.', schema: { type: 'object', properties: {}, required: [] }, needsApproval: false, renderHint: () => `<tool name="agent_list"></tool>` },
  agent_update: {
    desc: 'Alterar instruções de um subagente.',
    schema: { type: 'object', properties: { name: { type: 'string' }, instructions: { type: 'string' } }, required: ['name', 'instructions'] },
    needsApproval: false,
    renderHint: () => `<tool name="agent_update">{"name":"Pesquisador","instructions":"..."}</tool>`,
  },
  agent_delete: {
    desc: 'Excluir subagente (confirmação via UI).',
    schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    needsApproval: false, // a confirmação é feita dentro de execAgentTool
    renderHint: () => `<tool name="agent_delete">{"name":"Pesquisador"}</tool>`,
  },
  agent_delegate: {
    desc: 'Delegar tarefa(s) a subagentes (paralelo); retorna resultados p/ revisão do principal.',
    schema: { type: 'object', properties: { agent: { type: 'string' }, task: { type: 'string' }, feedback: { type: 'string' } }, required: ['agent', 'task'] },
    needsApproval: false,
    renderHint: () => `<tool name="agent_delegate">{"agent":"Pesquisador","task":"..."}</tool>`,
  },
  browser_scroll: {
    desc: 'Computer Use: Rolar página do navegador para cima ou para baixo.',
    schema: { type: 'object', properties: { direction: { type: 'string' }, amount: { type: 'number' } }, required: ['direction'] },
    needsApproval: false,
    renderHint: () => `<tool name="browser_scroll">{"direction":"down","amount":500}</tool>`,
  },
};

// System enxuto: nomes + 1 linha cada + slugs (sem prompts das skills)
export function buildToolsSection(activeSlugs, isSubagent = false) {
  const lines = [
    `- web_search(query): SÓ se pedir pesquisar/buscar/notícias/preço/clima. NUNCA do nada.`,
    `- web_open(url): ler 1 página https.`,
    `- run_skill(slug): [${activeSlugs.join(', ') || 'nenhuma ativa'}]`,
    `- open_site(alvo): só se usuário pediu abrir/ver.`,
    `- music_search(q): música livre p/ tocar.`,
    `- music_download(q): baixar MP3 gratuito.`,
    `- create_task(texto): criar tarefa na aba Tarefas.`,
    `- list_tasks: ler tarefas (use ao perguntar pendências).`,
    `- complete_task(texto): concluir/marcar tarefa como feita.`,
    `- delete_task(texto): deletar/remover tarefa.`,
    `- create_note({"title","text"}): criar nota na aba Notas.`,
    `- list_notes: ler notas COM o conteúdo (use ao perguntar minhas notas / o que anotei / conteúdo de nota).`,
    `- edit_note({"match","text"}): editar nota por trecho/nº.`,
    `- delete_note(match): deletar nota por trecho/nº.`,
    `- list_convs: listar conversas salvas.`,
    `- read_conv({"match"}): ler mensagens de uma conversa (trecho do título ou id).`,
    `- save_correction(texto): salvar correção/preferência do usuário na Memória do Agente.`,
    `- browser_open(url): abrir página no navegador embutido persistente.`,
    `- browser_inspect: Computer Use — inspecionar elementos interativos [#1, #2, ...] da página atual.`,
    `- browser_click(target): Computer Use — clicar em elemento por [#número], seletor ou texto.`,
    `- browser_type({"target","text",enter}): Computer Use — digitar em campo de formulário.`,
    `- browser_screenshot: Computer Use — tirar screenshot da página e exibir no monitor.`,
    `- browser_scroll({"direction","amount"}): Computer Use — rolar página (down/up).`,
    `- code_read({"path"}): ler arquivo do projeto.`,
    `- code_list({"path"}): listar pasta.`,
    `- code_glob({"pattern"}): achar arquivos.`,
    `- code_grep({"pattern"}): buscar texto no projeto.`,
    `- code_write({"path","content"}): criar/sobrescrever arquivo (p/ novo ou reescrita).`,
    `- code_edit({"path","old_string","new_string"}): troca precisa (p/ mudança pequena).`,
    `- code_bash({"cmd"}): shell no projeto (exige bridge; senão negado).`,
  ];
  if (!isSubagent) {
    lines.push(
      `- FORMATO EXATO p/ agentes (use sempre a tag <tool name=...>, nunca <agent_create>): <tool name="agent_create">{"name":"Redator","instructions":"Você é ...","icon":"pen-line"}</tool> — "icon" = nome lucide em inglês (bot, pen-line, megaphone, search), nunca emoji.`,
      `- agent_create({"name","instructions","icon"}): cria subagente com as instruções que VOCÊ define (vários: {"agents":[{...},{...}]}). Só quando o usuário pedir agentes/equipe/delegar.`,
      `- agent_history({"agent","since","limit"}): LÊ a conversa persistida de um subagente (pedidos do Prime, respostas e pedidos diretos do usuário, com horário). "since":"hoje" ou nº de horas. Sem "agent" = resumo de todos. Qualquer pergunta sobre o que um agente fez/disse/sabe/tratou → chame ANTES de responder; nunca invente.`,
      `- agent_list: lista subagentes existentes (use antes de criar/delegar).`,
      `- agent_update({"name","instructions"}): muda as instruções de um subagente.`,
      `- agent_delete({"name"}): remove subagente (pede confirmação).`,
      `- agent_delegate({"agent","task","feedback"}) ou {"tasks":[{"agent","task"},...]}: subagentes executam em paralelo e o resultado volta p/ você REVISAR. "task" deve ser autocontida. "feedback" = correção p/ refazer.`
    );
  }
  return `[TOOLS]\n${lines.join('\n')}\nFormato: <tool name="web_search">texto</tool> — 1 por turno. Code tools usam JSON na tag. NUNCA use JSON {"name":...} — só o formato <tool>.`;
}

export function parseToolCall(text) {
  const s = String(text || '');
  const m = s.match(/<tool\s+name=["'](web_search|web_open|open_site|run_skill|music_search|music_download|music_play|create_task|list_tasks|complete_task|delete_task|create_note|list_notes|edit_note|delete_note|list_convs|read_conv|save_correction|browser_open|browser_inspect|browser_click|browser_type|browser_screenshot|browser_scroll|news|code_read|code_list|code_glob|code_grep|code_write|code_edit|code_bash|agent_create|agent_list|agent_update|agent_delete|agent_delegate|agent_history)["']\s*>([\s\S]*?)<\/tool>/i);
  if (m) {
    let name = m[1].toLowerCase();
    if (name === 'news') name = 'web_search'; // compat legado
    const cap = (name.startsWith('code_') || name.startsWith('browser_')) ? 20000 : name.startsWith('agent_') ? 8000 : 500;
    return { name, arg: m[2].trim().slice(0, cap) };
  }
  // Alias: modelo escreveu <agent_create>{...}</agent_create> em vez de <tool name="agent_create">
  const am = s.match(/<(agent_(?:create|list|update|delete|delegate|history))\s*>([\s\S]*?)<\/\1\s*>/i);
  if (am) return { name: am[1].toLowerCase(), arg: am[2].trim().slice(0, 8000) };
  // Fallback: modelo emitiu tool nativa JSON em vez de <tool> (causa do Groq 400 tool_use_failed)
  try {
    const jm = s.match(/\{\s*"name"\s*:\s*"([\w-]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/);
    if (jm) {
      let name = jm[1].toLowerCase();
      if (name === 'news') name = 'web_search';
      let arg = '';
      try { const ao = JSON.parse(jm[2]); arg = /^(agent_|code_|browser_)/.test(name) ? JSON.stringify(ao) : (ao.query ?? ao.text ?? ao.alvo ?? ao.url ?? ao.slug ?? ''); } catch {}
      if (name) return { name, arg: String(arg).slice(0, /^agent_/.test(name) ? 8000 : 500) };
    }
  } catch {}
  return null;
}
