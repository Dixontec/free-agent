// JavaScript, eval/browser-web-startup.cjs, Node/Python; actual owned-child startup/shutdown.
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const WebSocket = require('ws');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = path.join(__dirname, '..');
async function bootstrap(origin) {
  for (let i = 0; i < 60; i++) {
    try { const response = await fetch('http://127.0.0.1:47812/bootstrap', { headers: { Origin: origin } }); if (response.ok) return response.json(); } catch {}
    await wait(100);
  }
  throw new Error('Service failed to start');
}
async function launchedBrowser(boot, origin) {
  const socket = new WebSocket('ws://127.0.0.1:47812/session', { origin });
  await new Promise((accept, reject) => { socket.once('open', accept); socket.once('error', reject); });
  const result = new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 20000);
    socket.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.type === 'state' && !socket.started) {
        socket.started = true;
        socket.send(JSON.stringify({ id: 1, command: 'create', payload: { url: 'https://example.com/' } }));
      }
      if (message.id === 1) { clearTimeout(timer); message.error ? reject(new Error(message.error)) : accept(); }
    });
  });
  socket.send(JSON.stringify({ type: 'auth', token: boot.token }));
  await result;
  return socket;
}
async function run(executable, args, origin, appUrl, env) {
  const child = spawn(executable, args, { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  let socket;
  try {
    const boot = await bootstrap(origin);
    assert.equal(boot.protocol, 'free-agent-browser/2');
    if (appUrl) assert.equal((await fetch(appUrl)).status, 200);
    socket = await launchedBrowser(boot, origin);
    const start = Date.now();
    child.stdin.end('shutdown\n');
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Graceful shutdown timed out: ' + output)), 9000);
      child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    assert.equal(code, 0, output);
    const elapsed = Date.now() - start;
    assert.ok(!output.includes('finalizando apenas a árvore'), output);
    console.log(`VERIFIED: ${executable} startup, real Chrome launch and cooperative shutdown in ${elapsed}ms.`);
  } catch (error) { throw new Error(error.message + '\nChild diagnostic: ' + output); }
  finally { socket?.terminate(); if (child.exitCode === null) child.kill(); }
}
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode', 'fa-web-start-'));
  const env = { ...process.env, LOCALAPPDATA: temp, FA_APP_PORT: '18081' };
  await run(process.execPath, ['web/start-local.cjs'], 'http://127.0.0.1:18081', 'http://127.0.0.1:18081/', env);
  // Exercise exactly the helpers used by serve.py, with real Node/Chrome children.
  const script = "import bridge; c=bridge._start_browser_service(18080); input(); bridge._stop_browser_service(c); assert c.returncode == 0";
  await run('python', ['-u', '-c', script], 'http://127.0.0.1:18080', null, env);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
