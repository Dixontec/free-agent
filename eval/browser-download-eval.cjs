// Focused authorization regression, real AV worker; no audiovisual benchmark.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { WebSocket } = require('ws');
const { startBrowserService } = require('../web/browser-service.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const origin = 'http://127.0.0.1:8080';
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode', 'fa-download-'));
  let service, socket, state, sequence = 0;
  const pending = new Map();
  const watchdog = setTimeout(() => { console.error('FAILED: download regression exceeded 40 seconds'); socket?.terminate(); void service?.close(); process.exitCode = 1; }, 40000);
  async function until(predicate, label) {
    const start = Date.now();
    while (Date.now() - start < 8000) { if (predicate()) return; await pause(50); }
    throw new Error('Timeout: ' + label);
  }
  function rpc(command, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('RPC timeout: ' + command)); }, 12000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, command, payload }));
    });
  }
  async function clickDownload() {
    for (const eventType of ['mousePressed', 'mouseReleased']) await rpc('input', { kind: 'mouse', eventType, x: 365, y: 32, button: 'left', buttons: eventType === 'mousePressed' ? 1 : 0, clickCount: 1 });
  }
  try {
    service = await startBrowserService({ port: 0, origins: [origin], profileDir: profile, fixtureDirectory: path.join(__dirname, 'av-fixtures') });
    socket = new WebSocket(`ws://127.0.0.1:${service.port}/session`, { origin });
    socket.on('message', data => {
      const message = JSON.parse(data);
      if (message.type === 'state') state = message.state;
      const request = pending.get(message.id);
      if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error)) : request.resolve(message.result); }
    });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    socket.send(JSON.stringify({ type: 'auth', token: service.token }));
    await until(() => state?.controlling, 'authentication');
    await rpc('layout', { visible: true, width: 800, height: 450 });
    await rpc('create', { url: 'https://fixture.test/' });
    await until(() => state.tabs.some(tab => tab.title === 'AV demo ready'), 'fixture');
    await clickDownload();
    await until(() => state.downloads.some(item => item.state === 'awaiting-authorization'), 'download pending');
    const first = state.downloads.find(item => item.state === 'awaiting-authorization');
    const url = `http://127.0.0.1:${service.port}/download/${first.id}`;
    const headers = { Origin: origin, Authorization: `Bearer ${service.token}` };
    await pause(1000);
    assert.equal(service.state().downloads.find(item => item.id === first.id).state, 'awaiting-authorization');
    assert.equal((await fetch(url, { headers: { Origin: origin } })).status, 401);
    assert.equal((await fetch(url, { headers })).status, 404);
    await rpc('download-accept', { id: first.id });
    await until(() => state.downloads.some(item => item.id === first.id && item.state === 'completed'), 'authorized completion');
    const response = await fetch(url, { headers });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Free Agent authorized AV download fixture/);
    await clickDownload();
    await until(() => state.downloads.some(item => item.id !== first.id && item.state === 'awaiting-authorization'), 'second download');
    const second = state.downloads.find(item => item.id !== first.id && item.state === 'awaiting-authorization');
    await rpc('download-cancel', { id: second.id });
    await until(() => state.downloads.some(item => item.id === second.id && item.state === 'cancelled'), 'cancellation');
    assert.equal((await fetch(`http://127.0.0.1:${service.port}/download/${second.id}`, { headers })).status, 404);
    console.log('VERIFIED: real AV-worker download remains quarantined before approval, unauthorized read rejected, approved bytes verified, cancellation prevents retrieval.');
  } finally {
    clearTimeout(watchdog);
    for (const request of pending.values()) clearTimeout(request.timer);
    socket?.terminate(); await service?.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
