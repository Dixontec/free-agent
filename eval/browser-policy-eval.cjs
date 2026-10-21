// JavaScript, eval/browser-policy-eval.cjs, Node; browser policy and egress tests.
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { publicAddress, publicUrl, navigation, trustedFrame } = require('../desktop/browser-policy');
const { createBrowserNetwork } = require('../desktop/browser-network');

(async () => {
  for (const url of ['http://127.0.0.1:47811/', 'http://2130706433/', 'http://0x7f000001/',
    'https://localhost/', 'http://10.0.0.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/', 'file:///C:/Windows/', 'javascript:alert(1)', 'data:text/html,a',
    'http://user:pass@example.com/', 'http://192.168.1.2/', 'http://host.local/']) {
    assert.equal(publicUrl(url), false, url);
    assert.throws(() => navigation(url));
  }
  assert.equal(navigation('example.com:8443/path'), 'https://example.com:8443/path');
  assert.equal(navigation('pesquisa com espaços'), 'https://www.google.com/search?q=pesquisa%20com%20espa%C3%A7os');
  assert.equal(publicUrl('https://example.com/'), true);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  assert.equal(publicAddress('2001::1'), false);
  const frame = { url: 'http://127.0.0.1:47811/index.html' };
  const contents = { mainFrame: frame };
  assert.equal(trustedFrame({ sender: contents, senderFrame: frame }, contents, 'http://127.0.0.1:47811'), true);
  assert.equal(trustedFrame({ sender: contents, senderFrame: { ...frame } }, contents, 'http://127.0.0.1:47811'), false);
  assert.equal(trustedFrame({ sender: {}, senderFrame: frame }, contents, 'http://127.0.0.1:47811'), false);

  let lookupCalls = 0;
  const network = createBrowserNetwork({ lookup: async () => {
    lookupCalls++;
    return [{ address: lookupCalls === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }];
  } });
  const port = await network.start();
  try {
    assert.equal((await network.resolve('example.test')).address, '93.184.216.34');
    await assert.rejects(network.resolve('example.test'), /Private DNS/);
    const status = await new Promise((accept, reject) => {
      const req = http.get({ host: '127.0.0.1', port, path: 'http://127.0.0.1:47811/' }, res => { res.resume(); accept(res.statusCode); });
      req.on('error', reject);
    });
    assert.equal(status, 403, 'HTTP private destination blocked');
    const tunnel = await new Promise((accept, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => socket.write('CONNECT 127.0.0.1:47811 HTTP/1.1\r\nHost: 127.0.0.1:47811\r\n\r\n'));
      socket.on('data', data => { accept(data.toString()); socket.destroy(); }); socket.on('error', reject);
    });
    assert.match(tunnel, /403 Forbidden/);
  } finally { network.close(); }
  console.log('VERIFIED: public URL/IP policy, IPC sender checks, DNS revalidation, HTTP and CONNECT isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
