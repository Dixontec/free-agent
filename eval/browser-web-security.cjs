// Independent adversarial audit. Uses only its own ephemeral service and Chrome profile.
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { WebSocket } = require('ws');
const childProcess = require('node:child_process');
const originalSpawn = childProcess.spawn;
const launches = [];
childProcess.spawn = function (file, args, ...rest) {
  const child = originalSpawn.call(this, file, args, ...rest);
  launches.push({ args: args || [], child });
  return child;
};
const { startBrowserService } = require('../web/browser-service.cjs');
const origin = 'http://127.0.0.1:31987';
const checks = [];
const sockets = new Set();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return; await delay(25); }
  throw new Error('Timeout: ' + label);
}
async function check(name, action) { await action(); checks.push(name); console.log('PASS:', name); }
function open(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/session`, { origin: headers.Origin || origin, headers });
    sockets.add(ws); ws.on('error', () => {});
    ws.once('open', () => resolve(ws)); ws.once('error', reject);
  });
}
function closed(ws) { return new Promise(resolve => ws.once('close', code => resolve(code))); }
function peer(ws) {
  let sequence = 0;
  const messages = [];
  ws.on('message', data => messages.push(JSON.parse(data.toString())));
  return { ws, messages, async rpc(command, payload = {}) {
    const id = ++sequence; ws.send(JSON.stringify({ id, command, payload }));
    await until(() => messages.some(m => m.id === id), command);
    return messages.find(m => m.id === id);
  } };
}
async function authenticated(port, token) {
  const p = peer(await open(port));
  p.ws.send(JSON.stringify({ type: 'auth', token }));
  await until(() => p.messages.some(m => m.type === 'state'), 'auth state');
  return p;
}
function request(port, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: requestPath, headers }, res => {
      let body = ''; res.on('data', data => { body += data; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}
async function rejectedUpgrade(port, headers) {
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/session`, { origin: headers.Origin || origin, headers });
    sockets.add(ws); ws.on('error', () => {});
    ws.once('open', () => { ws.terminate(); reject(new Error('Unexpected upgrade')); });
    ws.once('unexpected-response', (_, res) => {
      try { assert.equal(res.statusCode, 403); res.resume(); ws.terminate(); resolve(); } catch (e) { reject(e); }
    });
  });
}
(async () => {
  const parent = path.join(os.tmpdir(), 'opencode');
  assert.ok((await fs.stat(parent)).isDirectory());
  const profileDir = await fs.mkdtemp(path.join(parent, 'fa-security-'));
  let service, remotePage;
  const watchdog = setTimeout(() => { console.error('FAIL: audit deadline'); process.exit(1); }, 90000);
  try {
    service = await startBrowserService({ engine: 'jpeg', port: 0, origins: [origin], profileDir,
      fixture: route => {
        remotePage = route.request().frame().page();
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>security fixture</title><input autofocus><script>window.events=[];onkeydown=e=>events.push("down:"+e.code);onkeyup=e=>events.push("up:"+e.code);</script>' });
      } });
    const { port } = service;
    let token;
    await check('bootstrap rejects missing Origin, foreign Origin and forged Host', async () => {
      for (const headers of [{}, { Origin: 'https://evil.invalid' }, { Origin: origin, Host: 'evil.invalid' }]) {
        const res = await request(port, '/bootstrap', headers); assert.equal(res.status, 403);
        assert.ok(!res.body.includes(service.token)); assert.equal(res.headers['access-control-allow-origin'], undefined);
      }
      const res = await request(port, '/bootstrap', { Origin: origin });
      assert.equal(res.status, 200); token = JSON.parse(res.body).token;
      assert.match(token, /^[a-f0-9]{64}$/); assert.equal(res.headers['cache-control'], 'no-store');
    });
    await check('untrusted WS Origin and Host rejected before upgrade', async () => {
      await rejectedUpgrade(port, { Origin: 'https://evil.invalid' });
      await rejectedUpgrade(port, { Host: 'evil.invalid' });
    });
    await check('bad token and command before authentication close with 1008', async () => {
      for (const payload of [{ type: 'auth', token: 'bad' }, { id: 1, command: 'state' }]) {
        const ws = await open(port), done = closed(ws); ws.send(JSON.stringify(payload)); assert.equal(await done, 1008);
      }
    });
    await check('invalid JSON, binary and oversized messages are rejected', async () => {
      for (const [payload, code] of [['{', 1008], [Buffer.from('{}'), 1008], ['x'.repeat(32769), 1009]]) {
        const ws = await open(port), done = closed(ws); ws.send(payload); assert.equal(await done, code);
      }
    });
    await check('unauthenticated idle socket times out with 1008', async () => {
      const ws = await open(port); assert.equal(await closed(ws), 1008);
    });
    const owner = await authenticated(port, token);
    assert.equal(owner.messages[0].state.controlling, true);
    await check('unknown command, arbitrary CDP/system and injected input fields rejected', async () => {
      for (const command of ['cdp', 'Runtime.evaluate', 'Browser.close', 'system', 'exec']) {
        assert.ok((await owner.rpc(command, { expression: '1+1' })).error);
      }
      assert.ok((await owner.rpc('input', { kind: 'key', eventType: 'keyDown', key: 'a', code: 'KeyA', modifiers: 0, windowsVirtualKeyCode: 65, commands: ['selectAll'] })).error);
      assert.ok((await owner.rpc('layout', { visible: true, width: '800', height: 600 })).error);
    });
    await check('private/file/javascript create rejected without launching browser', async () => {
      for (const url of ['http://127.0.0.1/', 'http://[::1]/', 'http://10.0.0.1/', 'http://169.254.169.254/', 'file:///C:/Windows/win.ini', 'javascript:alert(1)']) {
        assert.ok((await owner.rpc('create', { url })).error, url);
      }
      assert.equal(service.state().tabs.length, 0); assert.equal(service.state().connected, false);
    });
    await check('actual Chrome fixture loads and private/file navigation remains rejected', async () => {
      const result = await owner.rpc('create', { url: 'https://fixture.test/security' }); assert.ok(result.result, JSON.stringify(result));
      await until(() => remotePage && service.state().tabs.some(t => t.title === 'security fixture'), 'fixture load');
      for (const value of ['http://localhost:47812/bootstrap', 'http://192.168.1.1/', 'file:///C:/Windows/win.ini']) assert.ok((await owner.rpc('navigate', { value })).error);
      assert.equal(service.state().tabs.length, 1);
    });
    await check('actual browser uses CDP pipe with no debugging port; service exposes no CDP discovery', async () => {
      const launch = launches.find(item => item.child.exitCode === null && item.args.includes('--remote-debugging-pipe'));
      assert.ok(launch, 'Running Chrome must be spawned with a debugging pipe');
      assert.ok(!launch.args.some(arg => /^--remote-debugging-(port|address)(=|$)/.test(arg)));
      for (const url of ['/json/version', '/json/list', '/devtools/browser']) assert.equal((await request(port, url, { Origin: origin })).status, 404);
    });
    const observer = await authenticated(port, token);
    await check('observer cannot mutate browser or send input', async () => {
      assert.equal(observer.messages[0].state.controlling, false);
      assert.ok((await observer.rpc('create', { url: 'https://fixture.test/other' })).error);
      assert.ok((await observer.rpc('layout', { visible: true, width: 800, height: 600 })).error);
      assert.equal(service.state().tabs.length, 1);
    });
    await delay(1100);
    await check('server releases held key on hide', async () => {
      assert.ok((await owner.rpc('layout', { visible: true, width: 800, height: 600 })).result);
      assert.ok((await owner.rpc('input', { kind: 'key', eventType: 'keyDown', key: 'Shift', code: 'ShiftLeft', modifiers: 8, windowsVirtualKeyCode: 16 })).result);
      assert.ok((await owner.rpc('layout', { visible: false })).result);
      assert.ok((await remotePage.evaluate(() => events)).includes('up:ShiftLeft'));
    });
    await check('owner disconnect promotes observer, restores control and delivers resized frames', async () => {
      const done = closed(owner.ws); owner.ws.close(); await done;
      await until(() => observer.messages.some(m => m.type === 'state' && m.state.controlling === true), 'promotion');
      const promoted = observer.messages.filter(m => m.type === 'state' && m.state.controlling).at(-1);
      assert.ok(!promoted.state.diagnostic.includes('Outra janela'));
      assert.ok((await observer.rpc('layout', { visible: true, width: 810, height: 610 })).result);
      await until(() => observer.messages.some(m => m.type === 'frame' && m.width === 810 && m.height === 610), 'promoted frames');
      assert.ok((await observer.rpc('navigate', { value: 'https://fixture.test/promoted' })).result);
    });
    console.log('VERIFIED:', JSON.stringify({ checks: checks.length, names: checks, engine: 'actual Chrome via production service', profile: 'isolated outside workspace', limitations: 'No full frontend rerun, no exhaustive egress proof, no unrelated process touched' }));
  } finally {
    for (const ws of sockets) if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
    await service?.close(); childProcess.spawn = originalSpawn; clearTimeout(watchdog);
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
