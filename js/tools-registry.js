/* My OS Harness v2 — tools-registry.js
   4 tools distintas, schemas sob demanda. Nada é despejado no prompt.
   Falha que originou: skillsCtx() jogava 9 prompts no system todo turno.
*/
'use strict';

export const TOOLS = {
  web_search: {
    desc: 'Buscar fato atual/externo (Wiki + DDG + HN).',
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
};

// System enxuto: nomes + 1 linha cada + slugs (sem prompts das skills)
export function buildToolsSection(activeSlugs) {
  const lines = [
    `- web_search(query): fato atual/externo.`,
    `- web_open(url): ler 1 página https.`,
    `- run_skill(slug): [${activeSlugs.join(', ') || 'nenhuma ativa'}]`,
    `- open_site(alvo): só se usuário pediu abrir/ver.`,
    `- music_search(q): música livre p/ tocar.`,
    `- music_download(q): baixar MP3 gratuito.`,
    `- create_task(texto): criar tarefa na aba Tarefas.`,
    `- list_tasks: ler tarefas (use ao perguntar pendências).`,
    `- code_read({"path"}): ler arquivo do projeto.`,
    `- code_list({"path"}): listar pasta.`,
    `- code_glob({"pattern"}): achar arquivos.`,
    `- code_grep({"pattern"}): buscar texto no projeto.`,
    `- code_write({"path","content"}): criar/sobrescrever arquivo (p/ novo ou reescrita).`,
    `- code_edit({"path","old_string","new_string"}): troca precisa (p/ mudança pequena).`,
    `- code_bash({"cmd"}): shell no projeto (exige bridge; senão negado).`,
  ];
  return `[TOOLS]\n${lines.join('\n')}\nFormato: <tool name="web_search">texto</tool> — 1 por turno. Code tools usam JSON na tag. NUNCA use JSON {"name":...} — só o formato <tool>.`;
}

export function parseToolCall(text) {
  const s = String(text || '');
  const m = s.match(/<tool\s+name=["'](web_search|web_open|open_site|run_skill|music_search|music_download|music_play|create_task|list_tasks|news|code_read|code_list|code_glob|code_grep|code_write|code_edit|code_bash)["']\s*>([\s\S]*?)<\/tool>/i);
  if (m) {
    let name = m[1].toLowerCase();
    if (name === 'news') name = 'web_search'; // compat legado
    const cap = name.startsWith('code_') ? 20000 : 500;
    return { name, arg: m[2].trim().slice(0, cap) };
  }
  // Fallback: modelo emitiu tool nativa JSON em vez de <tool> (causa do Groq 400 tool_use_failed)
  try {
    const jm = s.match(/\{\s*"name"\s*:\s*"([\w-]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/);
    if (jm) {
      let name = jm[1].toLowerCase();
      if (name === 'news') name = 'web_search';
      let arg = '';
      try { const ao = JSON.parse(jm[2]); arg = ao.query ?? ao.text ?? ao.alvo ?? ao.url ?? ao.slug ?? ''; } catch {}
      if (name) return { name, arg: String(arg).slice(0, 500) };
    }
  } catch {}
  return null;
}
