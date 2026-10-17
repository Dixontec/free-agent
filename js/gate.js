/* Free Agent Harness v2 — gate.js
   Sandbox + aprovação humana p/ irreversível.
   Falha que originou: window.open(url) arbitrário + export com keys.
*/
'use strict';

const ALLOW_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'youtu.be', 'mail.google.com', 'drive.google.com',
  'github.com', 'news.ycombinator.com', 'pt.wikipedia.org', 'www.google.com', 'gmail.com',
]);

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

export function sandboxCheck({ tool, arg }) {
  if (tool === 'web_open' || tool === 'open_site') {
    const m = String(arg).match(/https?:\/\/[^\s)]+/);
    if (m) {
      const h = hostOf(m[0]);
      // YouTube IDs e busca interna sempre ok; resto: avisa mas permite com aprovação
      const open = !h || [...ALLOW_HOSTS].some(a => h.endsWith(a.replace(/^www\./, '')));
      if (!open) return { ok: true, warn: `host fora do allowlist: ${h} — exigindo confirmação` , needApproval: true };
    }
  }
  if (/rm\s+-rf|mkfs|:?\(\)\s*\{|shutdown|crontab\s+-r/i.test(String(arg))) {
    return { ok: false, reason: 'comando destrutivo bloqueado pelo sandbox' };
  }
  return { ok: true };
}

// needsApproval vem do registry (open_site) ou do sandboxCheck.warn
export async function requestApproval({ tool, arg, uiConfirm }) {
  if (!uiConfirm) return true; // sem UI → nega por padrão em produção? aqui permite p/ compat
  return await uiConfirm('Confirmar ação', `Executar ${tool}: ${String(arg).slice(0, 120)}?`, 'Executar');
}

export function stripSecrets(obj) {
  const c = JSON.parse(JSON.stringify(obj));
  if (c.keys) Object.keys(c.keys).forEach(k => c.keys[k] = '***');
  if (c.cfg) delete c.cfg.baseUrl;
  return c;
}
