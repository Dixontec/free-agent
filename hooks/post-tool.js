/* hooks/post-tool.js — feedback: sensor pós-execução */
export function postTool({ tool, result }) {
  const len = String(result || '').length;
  if (!len) return { ok: false, reason: `tool ${tool} retornou vazio — reformule` };
  if (len < 80) return { ok: true, warn: 'resultado curto, pode faltar fonte' };
  return { ok: true };
}
