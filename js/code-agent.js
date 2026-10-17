/* ═══════════ Free Agent · Coding Agent (estilo OpenCode) ═══════════
   Ferramentas de arquivo + shell p/ o agente codar dentro do workspace.
   - Workspace = pasta autorizada (File System Access API, mesma de getWorkDir).
   - Toda escrita restrita ao workspace (contenção por partes, sem `..` fugindo).
   - Permissões: allow / ask / deny por ferramenta + modo Plan (só leitura) / Build.
   - Snapshots em memória p/ undo (não toca no git do usuário).
   - Bash via bridge local opcional (bridge.py); sem bridge = negado com orientação.
   Uso pelo LLM: <tool name="code_write">{"path":"...","content":"..."}</tool>
*/
'use strict';
window.CodeAgent = (() => {
  /* ── env injetado pelo app (confirm/toast/log/bridge) ── */
  const env = { confirm: null, notify: null, log: null, bridge: null };
  function bind(e) { Object.assign(env, e || {}); }

  /* ── args: JSON na tag; fallback path cru ── */
  function parseArgs(raw) {
    const s = String(raw || '').trim();
    if (!s) return {};
    try { const o = JSON.parse(s); return (o && typeof o === 'object') ? o : { path: s }; }
    catch { return { path: s }; }
  }

  /* ── contenção de path (puro, testável) ── */
  function resolvePath(rel) {
    let s = String(rel || '').replace(/\\/g, '/').trim();
    if (!s) return { ok: false, reason: 'path vazio' };
    if (/^[a-zA-Z]:/.test(s) || s.startsWith('/') || s.includes('\0')) return { ok: false, reason: 'path absoluto/fora do workspace' };
    const parts = [];
    for (const seg of s.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') {
        if (!parts.length) return { ok: false, reason: 'path escapa do workspace (..)' };
        parts.pop(); continue;
      }
      if (/[<>:"|?*\x00-\x1f]/.test(seg)) return { ok: false, reason: 'caractere inválido: ' + seg };
      parts.push(seg);
    }
    if (!parts.length) return { ok: false, reason: 'path vazio' };
    return { ok: true, parts, rel: parts.join('/') };
  }

  /* ── permissões ── */
  const TOOLS = ['code_read', 'code_list', 'code_glob', 'code_grep', 'code_write', 'code_edit', 'code_bash'];
  const WRITE_TOOLS = new Set(['code_write', 'code_edit', 'code_bash']);
  const DEFAULT_PERMS = {
    mode: 'plan',
    tools: { code_read: 'allow', code_list: 'allow', code_glob: 'allow', code_grep: 'allow', code_write: 'ask', code_edit: 'ask', code_bash: 'deny' }
  };
  function lsGet(k, fb) { try { const v = localStorage.getItem('nexus:' + k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem('nexus:' + k, JSON.stringify(v)); } catch {} }
  function getPerms() {
    const p = Object.assign({}, DEFAULT_PERMS, lsGet('code-perms', {}));
    p.tools = Object.assign({}, DEFAULT_PERMS.tools, (p.tools || {}));
    if (p.mode !== 'plan' && p.mode !== 'build') p.mode = 'plan';
    for (const t of TOOLS) if (!['allow', 'ask', 'deny'].includes(p.tools[t])) p.tools[t] = DEFAULT_PERMS.tools[t];
    return p;
  }
  function savePerms(p) { lsSet('code-perms', p); }
  function setMode(m) { const p = getPerms(); p.mode = (m === 'build') ? 'build' : 'plan'; savePerms(p); return p; }
  function setToolPerm(tool, perm) {
    if (!TOOLS.includes(tool) || !['allow', 'ask', 'deny'].includes(perm)) return getPerms();
    const p = getPerms(); p.tools[tool] = perm; savePerms(p); return p;
  }
  // Decisão pura (sem UI): modo Plan nega escrita; senão vale o por-ferramenta.
  function decide(tool, perms) {
    const p = perms || getPerms();
    if (WRITE_TOOLS.has(tool) && p.mode === 'plan')
      return { decision: 'deny', reason: 'modo Plan: só leitura. Troque p/ Build p/ escrever.' };
    const d = p.tools[tool] || 'deny';
    if (d === 'allow') return { decision: 'allow' };
    if (d === 'ask') return { decision: 'ask', reason: 'permissão = ask' };
    return { decision: 'deny', reason: `permissão = deny p/ ${tool}` };
  }

  /* ── navegação no handle (interface mínima: getFileHandle/getDirectoryHandle/values) ── */
  async function dirFor(root, parts, create) {
    let dir = root;
    for (const seg of parts) dir = await dir.getDirectoryHandle(seg, { create: !!create });
    return dir;
  }
  async function readFile(root, rel, opts = {}) {
    const r = resolvePath(rel);
    if (!r.ok) throw new Error(r.reason);
    const dir = await dirFor(root, r.parts.slice(0, -1), false);
    const fh = await dir.getFileHandle(r.parts[r.parts.length - 1]);
    const f = await fh.getFile();
    if (f.size > 2 * 1024 * 1024) throw new Error('arquivo grande demais (>2MB) — use offset/limit');
    const text = await f.text();
    const lines = text.split('\n');
    const off = Math.max(0, (opts.offset | 0) || 0);
    const lim = Math.min(400, Math.max(1, (opts.limit | 0) || 200));
    const slice = lines.slice(off, off + lim);
    return { rel: r.rel, totalLines: lines.length, offset: off, text: slice.join('\n'), truncated: off + lim < lines.length };
  }
  async function listDir(root, rel = '') {
    const r = rel ? resolvePath(rel) : { ok: true, parts: [] };
    if (!r.ok) throw new Error(r.reason);
    const dir = await dirFor(root, r.parts, false);
    const out = [];
    for await (const [name, h] of dir.values()) out.push({ name, kind: h.kind });
    out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
    return { rel: r.parts.join('/'), entries: out.slice(0, 500) };
  }
  function globToReg(pattern) {
    let re = '^';
    const s = String(pattern || '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '*') {
        if (s[i + 1] === '*') { re += '.*'; i++; if (s[i + 1] === '/') i++; }
        else re += '[^/]*';
      }
      else if (c === '?') re += '[^/]';
      else re += c.replace(/[.+^${}()|[\]\\]/, '\\$&');
    }
    return new RegExp(re + '$');
  }
  async function glob(root, pattern, opts = {}) {
    const rx = globToReg(pattern);
    const max = Math.min(500, Math.max(1, opts.max | 0 || 200));
    const found = [];
    async function walk(dir, prefix, depth) {
      if (found.length >= max || depth > 12) return;
      for await (const [name, h] of dir.values()) {
        const rel = prefix ? prefix + '/' + name : name;
        if (h.kind === 'file') { if (rx.test(rel)) found.push(rel); }
        else if (h.kind === 'directory' && found.length < max) await walk(h, rel, depth + 1);
        if (found.length >= max) return;
      }
    }
    await walk(root, '', 0);
    return { pattern, files: found };
  }
  const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|mp3|ogg|wav|m4a|flac|opus|mp4|zip|gz|pdf|exe|bin|woff2?|ttf)$/i;
  async function grep(root, pattern, opts = {}) {
    let rx;
    try { rx = new RegExp(String(pattern), 'i'); }
    catch { throw new Error('regex inválida: ' + pattern); }
    const inc = opts.include ? globToReg(opts.include) : null;
    const maxM = Math.min(100, Math.max(1, opts.max | 0 || 40));
    const matches = [];
    async function walk(dir, prefix, depth) {
      if (matches.length >= maxM || depth > 12) return;
      for await (const [name, h] of dir.values()) {
        if (matches.length >= maxM) return;
        const rel = prefix ? prefix + '/' + name : name;
        if (h.kind === 'directory') { await walk(h, rel, depth + 1); continue; }
        if (inc && !inc.test(rel)) continue;
        if (SKIP_EXT.test(name)) continue;
        try {
          const f = await h.getFile();
          if (!f || f.size > 1024 * 1024) continue;
          const text = await f.text();
          if (text.includes('\0')) continue;
          const lines = text.split('\n');
          for (let i = 0; i < lines.length && matches.length < maxM; i++) {
            if (rx.test(lines[i])) matches.push({ file: rel, line: i + 1, text: lines[i].slice(0, 240) });
          }
        } catch {}
      }
    }
    await walk(root, '', 0);
    return { pattern: String(pattern), matches };
  }

  /* ── snapshots / undo (memória; não toca no git) ── */
  const _snaps = []; // [{ts, rel, before|null}]
  function snap(rel, before) {
    _snaps.push({ ts: Date.now(), rel, before: (before === undefined ? null : before) });
    while (_snaps.length > 50) _snaps.shift();
  }
  function history() { return _snaps.map(s => ({ ts: new Date(s.ts).toLocaleString('pt-BR'), rel: s.rel, created: s.before === null })); }
  async function undo(root) {
    const s = _snaps.pop();
    if (!s) return { ok: false, msg: 'nada p/ desfazer' };
    const r = resolvePath(s.rel);
    if (!r.ok) throw new Error(r.reason);
    if (s.before === null) {
      try { await dirFor(root, r.parts.slice(0, -1), false).then(d => d.removeEntry(r.parts[r.parts.length - 1])); } catch {}
      return { ok: true, msg: 'criação desfeita (arquivo removido): ' + r.rel };
    }
    await writeRaw(root, r, s.before);
    return { ok: true, msg: 'restaurado: ' + r.rel };
  }
  async function writeRaw(root, r, content) {
    const dir = await dirFor(root, r.parts.slice(0, -1), true);
    const fh = await dir.getFileHandle(r.parts[r.parts.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  }

  /* ── write / edit ── */
  async function readWhole(root, rel) {
    const r = resolvePath(rel);
    if (!r.ok) throw new Error(r.reason);
    try {
      const dir = await dirFor(root, r.parts.slice(0, -1), false);
      const fh = await dir.getFileHandle(r.parts[r.parts.length - 1]);
      return { r, text: await (await fh.getFile()).text(), existed: true };
    } catch { return { r, text: null, existed: false }; }
  }
  async function writeFile(root, rel, content, opts = {}) {
    const cur = await readWhole(root, rel);
    const body = String(content ?? '');
    if (cur.existed && cur.text === body && !opts.force)
      return { ok: true, rel: cur.r.rel, skipped: true, msg: 'conteúdo idêntico — nada escrito' };
    snap(cur.r.rel, cur.existed ? cur.text : null);
    await writeRaw(root, cur.r, body);
    return { ok: true, rel: cur.r.rel, created: !cur.existed, bytes: body.length };
  }
  async function editFile(root, rel, oldString, newString, opts = {}) {
    if (oldString === undefined || oldString === null || String(oldString) === '')
      throw new Error('old_string vazio — informe o trecho exato a substituir');
    const cur = await readWhole(root, rel);
    if (!cur.existed) throw new Error('arquivo não existe: ' + cur.r.rel + ' (use write p/ criar)');
    const oldS = String(oldString), newS = String(newString ?? '');
    const count = cur.text.split(oldS).length - 1;
    if (!count) throw new Error('old_string não encontrado exatamente em ' + cur.r.rel);
    if (count > 1 && !opts.replaceAll)
      throw new Error(`old_string aparece ${count}x em ${cur.r.rel} — refine o trecho ou use replace_all`);
    const next = opts.replaceAll ? cur.text.split(oldS).join(newS) : cur.text.replace(oldS, newS);
    if (next === cur.text) return { ok: true, rel: cur.r.rel, skipped: true, msg: 'sem mudança' };
    snap(cur.r.rel, cur.text);
    await writeRaw(root, cur.r, next);
    return { ok: true, rel: cur.r.rel, replacements: opts.replaceAll ? count : 1, diff: formatDiff(diffLines(cur.text, next)) };
  }

  /* ── diff (LCS por linhas, cap p/ preview) ── */
  function diffLines(a, b) {
    const A = String(a).split('\n'), B = String(b).split('\n');
    const N = Math.min(A.length, 2000), M = Math.min(B.length, 2000);
    const dp = Array.from({ length: N + 1 }, () => new Uint16Array(M + 1));
    for (let i = N - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ops = [];
    let i = 0, j = 0;
    while (i < N && j < M) {
      if (A[i] === B[j]) { ops.push({ t: ' ', s: A[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: '-', s: A[i++] }); }
      else { ops.push({ t: '+', s: B[j++] }); }
    }
    while (i < N) ops.push({ t: '-', s: A[i++] });
    while (j < M) ops.push({ t: '+', s: B[j++] });
    if (A.length > N || B.length > M) ops.push({ t: ' ', s: `… (truncado: ${A.length}/${B.length} linhas)` });
    return ops;
  }
  function formatDiff(ops, ctx = 3) {
    const marks = ops.map((o, i) => ({ ...o, i })).filter(o => o.t !== ' ');
    if (!marks.length) return '(sem mudanças)';
    const keep = new Set();
    for (const m of marks) for (let k = Math.max(0, m.i - ctx); k <= Math.min(ops.length - 1, m.i + ctx); k++) keep.add(k);
    const out = [];
    let last = -2;
    [...keep].sort((x, y) => x - y).forEach(k => {
      if (k > last + 1) out.push('@@');
      out.push(ops[k].t + ' ' + ops[k].s.slice(0, 300));
      last = k;
    });
    return out.slice(0, 120).join('\n');
  }

  /* ── diagnósticos + formatters (hook) ── */
  const formatters = {};
  function registerFormatter(ext, fn) { formatters[String(ext).toLowerCase()] = fn; }
  function format(path, content) {
    const m = String(path).match(/\.[a-z0-9]+$/i);
    const fn = m && formatters[m[0].toLowerCase()];
    if (!fn) return { text: content, formatted: false };
    try { return { text: fn(content), formatted: true }; } catch (e) { return { text: content, formatted: false, error: e.message }; }
  }
  function diagnose(path, content) {
    const issues = [];
    try {
      if (/\.js$/i.test(path)) { new Function(content); }
      else if (/\.json$/i.test(path)) { JSON.parse(content); }
    } catch (e) { issues.push(String((e && e.message) || e).slice(0, 300)); }
    return issues;
  }

  /* ── bash via bridge local (fail closed) ── */
  async function execBash(cmd, opts = {}) {
    const br = env.bridge && env.bridge.url ? env.bridge : null;
    if (!br) throw new Error('shell indisponível no navegador. Rode `python3 bridge.py` na pasta do projeto e configure URL/token em Configurações → Coding.');
    const timeout = Math.min(120000, Math.max(1000, (opts.timeoutMs | 0) || 30000));
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), timeout + 5000);
    try {
      const r = await fetch(br.url.replace(/\/$/, '') + '/exec', {
        method: 'POST', signal: c.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: env.bridge.token || '', cmd: String(cmd).slice(0, 4000), timeoutMs: timeout })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('bridge HTTP ' + r.status));
      return j;
    } finally { clearTimeout(id); }
  }

  /* ── orquestrador: permissão → (ask) → executa ── */
  async function runTool(name, rawArg, ctx = {}) {
    const a = parseArgs(rawArg);
    const root = ctx.root || null;
    const needRoot = name !== 'code_bash';
    if (needRoot && !root) return { ok: false, msg: 'sem workspace: autorize a pasta em Configurações → Coding → Autorizar pasta.' };
    const dec = decide(name, ctx.perms);
    if (dec.decision === 'deny') return { ok: false, msg: 'negado: ' + (dec.reason || name) };
    const exec = async () => {
      switch (name) {
        case 'code_read': {
          const r = await readFile(root, a.path, { offset: a.offset, limit: a.limit });
          return { ok: true, msg: `${r.rel} (linhas ${r.offset + 1}-${r.offset + r.text.split('\n').length} de ${r.totalLines})${r.truncated ? ' …truncado, use offset' : ''}\n${r.text}` };
        }
        case 'code_list': {
          const r = await listDir(root, a.path || '');
          return { ok: true, msg: (r.rel ? r.rel + '/' : './') + '\n' + r.entries.map(e => (e.kind === 'directory' ? e.name + '/' : e.name)).join('\n') };
        }
        case 'code_glob': {
          if (!a.pattern) throw new Error('informe "pattern" (ex.: src/**/*.js)');
          const r = await glob(root, a.pattern, { max: a.max });
          return { ok: true, msg: `${r.files.length} arquivo(s):\n` + r.files.join('\n') };
        }
        case 'code_grep': {
          if (!a.pattern) throw new Error('informe "pattern" (regex)');
          const r = await grep(root, a.pattern, { include: a.include, max: a.max });
          return { ok: true, msg: r.matches.length
            ? r.matches.map(m => `${m.file}:${m.line}: ${m.text}`).join('\n')
            : 'sem ocorrências' };
        }
        case 'code_write': {
          if (a.path === undefined || a.content === undefined) throw new Error('informe "path" e "content"');
          const fmt = format(a.path, String(a.content));
          const r = await writeFile(root, a.path, fmt.text);
          const issues = r.skipped ? [] : diagnose(a.path, fmt.text);
          if (env.log) env.log(`Code write ${r.rel}${r.skipped ? ' (idêntico, pulado)' : r.created ? ' (novo)' : ''}${issues.length ? ' · DIAG: ' + issues[0] : ''}`, issues.length ? 'warn' : 'ok');
          return { ok: true, msg: (r.skipped ? r.msg : `escrito: ${r.rel} (${r.bytes} bytes${r.created ? ', novo' : ''}${fmt.formatted ? ', formatado' : ''})`) + (issues.length ? `\nDIAGNÓSTICO: ${issues.join(' | ')}\nUse undo se precisar reverter.` : '') };
        }
        case 'code_edit': {
          if (a.path === undefined || a.old_string === undefined || a.new_string === undefined)
            throw new Error('informe "path", "old_string" e "new_string"');
          const r = await editFile(root, a.path, a.old_string, a.new_string, { replaceAll: !!a.replace_all });
          const issues = r.skipped ? [] : diagnose(a.path, (await readWhole(root, a.path)).text);
          if (env.log) env.log(`Code edit ${r.rel} (${r.replacements || 0}x)${issues.length ? ' · DIAG: ' + issues[0] : ''}`, issues.length ? 'warn' : 'ok');
          return { ok: true, msg: (r.skipped ? r.msg : `editado: ${r.rel} (${r.replacements}x)`) + (issues.length ? `\nDIAGNÓSTICO: ${issues.join(' | ')}` : '') };
        }
        case 'code_bash': {
          if (!a.cmd) throw new Error('informe "cmd"');
          const t0 = Date.now();
          const j = await execBash(a.cmd, { timeoutMs: a.timeout_ms });
          const out = `exit=${j.code} ${Date.now() - t0}ms\n${(j.stdout || '').slice(0, 3000)}${j.stderr ? '\nSTDERR:\n' + String(j.stderr).slice(0, 1500) : ''}`;
          if (env.log) env.log(`Code bash exit=${j.code}: ${String(a.cmd).slice(0, 80)}`, j.code === 0 ? 'ok' : 'warn');
          return { ok: true, msg: out };
        }
        default: return { ok: false, msg: 'ferramenta desconhecida: ' + name };
      }
    };
    if (dec.decision === 'allow') {
      try { return await exec(); } catch (e) { return { ok: false, msg: 'erro: ' + e.message }; }
    }
    // ask → preview + confirmação humana
    try {
      let preview = '';
      if ((name === 'code_write' || name === 'code_edit') && root) {
        const cur = await readWhole(root, a.path).catch(() => ({ text: null }));
        const next = name === 'code_write' ? String(a.content ?? '') : (cur.text === null ? '' : cur.text.split(String(a.old_string)).join(String(a.new_string ?? '')));
        preview = '\n\nDIFF:\n' + (cur.text === null ? `(novo arquivo — ${String(a.content ?? '').length} bytes)` : formatDiff(diffLines(cur.text, next)));
      } else if (name === 'code_bash') {
        preview = '\n\nCMD: ' + String(a.cmd).slice(0, 500);
      }
      const okC = env.confirm ? await env.confirm('Permitir ' + name + '?', `${label(name)}: ${a.path || a.cmd || a.pattern || ''}${preview}`.slice(0, 1500), 'Permitir') : false;
      if (!okC) return { ok: false, msg: 'usuário negou a ação — ofereça alternativa.' };
      return await exec();
    } catch (e) { return { ok: false, msg: 'erro: ' + e.message }; }
  }
  function label(n) {
    return { code_read: 'Ler arquivo', code_list: 'Listar pasta', code_glob: 'Buscar arquivos', code_grep: 'Buscar texto', code_write: 'Escrever arquivo', code_edit: 'Editar arquivo', code_bash: 'Executar comando' }[n] || n;
  }

  return {
    TOOLS, bind, parseArgs, resolvePath, getPerms, savePerms, setMode, setToolPerm, decide,
    readFile, readWhole, listDir, glob, grep, writeFile, editFile, undo, history,
    diffLines, formatDiff, diagnose, registerFormatter, format, runTool, label
  };
})();
