/* hooks/pre-tool.js — feedforward: allowlist + tamanho */
export function preTool({ tool, arg }) {
  if (String(arg).length > 500) return { ok: false, reason: 'arg >500 chars, refine a consulta' };
  if (tool === 'web_open' && !/^https?:\/\//i.test(arg)) return { ok: false, reason: 'web_open exige https://' };
  return { ok: true };
}
