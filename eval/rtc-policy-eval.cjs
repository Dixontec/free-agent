'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const { sanitizeOffer, createRtcPolicy } = require('../web/rtc-policy.cjs');

const HOST = '192.168.50.10';
const NAME = '12345678-1234-1234-1234-123456789abc.local';
const fingerprint = Array(32).fill('AB').join(':');
function offer(host = HOST) {
  return ['v=0', 'o=- 123456 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0 1',
    'a=msid-semantic: WMS', `a=fingerprint:sha-256 ${fingerprint}`, 'a=setup:actpass',
    'a=ice-ufrag:abcd', 'a=ice-pwd:abcdefghijklmnopqrstuv',
    ...['audio', 'video'].flatMap((kind, index) => [
      `m=${kind} 9 UDP/TLS/RTP/SAVPF ${index ? 96 : 111}`, 'c=IN IP4 0.0.0.0',
      `a=mid:${index}`, 'a=recvonly', 'a=rtcp:9 IN IP4 0.0.0.0', 'a=rtcp-mux',
      `a=rtpmap:${index ? '96 VP8/90000' : '111 opus/48000/2'}`,
      `a=candidate:${index + 1} 1 udp 2122260223 ${host} 55000 typ host generation 0 network-id 1 network-cost 10`,
      'a=end-of-candidates'
    ]), ''].join('\r\n');
}
const policy = createRtcPolicy({ addresses: [HOST, '2001:db8::1', '8.8.8.8'] });
const reject = (sdp, code) => assert.rejects(policy.sanitizeOffer(sdp), { code });

test('realistic bundled audio/video, placeholders, loopback and owned public addresses', async () => {
  for (const host of [HOST, '127.0.0.1', '::1', '2001:db8::1', '2001:0db8:0:0:0:0:0:1', '8.8.8.8']) {
    const output = await policy.sanitizeOffer(offer(host));
    assert.match(output, /a=candidate:/);
    assert.equal(await policy.sanitizeOffer(output), output);
  }
  await sanitizeOffer(offer('127.0.0.1'));
  await policy.sanitizeOffer(offer().replace(/ udp /g, ' tcp ').replace(/typ host generation/g, 'typ host tcptype active generation').replace(/55000/g, '9'));
});

test('reject foreign IPs and hostnames in every address-bearing field', async () => {
  for (const host of ['192.168.50.11', '1.1.1.1', '2001:db8::2', '127.0.0.2', '0.0.0.0', '::', 'example.com', 'localhost', '1.2.3.4/32', 'fe80::1%2']) {
    await reject(offer(host), 'NONLOCAL_ADDRESS');
  }
  for (const line of ['c=IN IP4 1.1.1.1', 'a=rtcp:9 IN IP4 1.1.1.1']) {
    await reject(offer().replace(line.startsWith('c=') ? 'c=IN IP4 0.0.0.0' : 'a=rtcp:9 IN IP4 0.0.0.0', line), 'NONLOCAL_ADDRESS');
  }
  await reject(offer().replace('IN IP4 127.0.0.1', 'IN IP4 1.1.1.1'), 'NONLOCAL_ADDRESS');
});

test('rtcp-xr permits only bounded report negotiation, preserving the complete SDP', async () => {
  for (const report of ['rcvr-rtt=all', 'rcvr-rtt=sender', 'rcvr-rtt=all:10000', 'rcvr-rtt=sender:65535', 'rrtr', 'dlrr', 'rcvr-rtt=all:10000 rrtr dlrr']) {
    const sdp = offer().replace('a=rtcp-mux', `a=rtcp-mux\r\na=rtcp-xr:${report}`);
    assert.equal(await policy.sanitizeOffer(sdp), sdp);
  }
  for (const report of ['', 'rcvr-rtt=receiver', 'rcvr-rtt=all:1.1.1.1', 'rcvr-rtt=all:-1',
    'rcvr-rtt=all:4294967296', 'rcvr-rtt=all:9:extra', 'rcvr-rtt=all rcvr-rtt=sender',
    'rrtr rrtr', 'rrtr=1.1.1.1', 'dlrr:9', 'raddr=1.1.1.1', 'remote-candidates=1',
    'rcvr-rtt=all raddr 1.1.1.1', 'rcvr-rtt=all  rrtr', 'unknown-report']) {
    await reject(offer() + `a=rtcp-xr:${report}\r\n`, 'RTCP_XR_INVALID');
  }
  await reject(offer() + 'a=rtcp-xr:rrtr\r\na=rtcp-xr:dlrr\r\n', 'DUPLICATE_ATTRIBUTE');
  await reject(offer() + 'a=unknown-xr:rcvr-rtt=all\r\n', 'ATTRIBUTE_NOT_ALLOWED');
});

test('known ICE capabilities including embedded Chromium SPED preserve bounded negotiation', async () => {
  for (const options of ['trickle', 'trickle renomination', 'trickle googspedv1', 'trickle sped googspedv1', 'ice2 trickle']) {
    const sdp=offer()+`a=ice-options:${options}\r\n`;assert.equal(await policy.sanitizeOffer(sdp),sdp);
  }
  for (const options of ['', 'trickle arbitrary', 'trickle trickle', 'trickle  googspedv1', 'trickle 1.1.1.1']) {
    await reject(offer()+`a=ice-options:${options}\r\n`,'ICE_OPTIONS_INVALID');
  }
  await reject(offer('1.1.1.1')+'a=ice-options:trickle googspedv1\r\n','NONLOCAL_ADDRESS');
});

test('reject srflx/relay/prflx, related addresses and malformed candidate extensions', async () => {
  for (const kind of ['srflx', 'relay', 'prflx']) await reject(offer().replace('typ host', `typ ${kind}`), 'CANDIDATE_NOT_ALLOWED');
  for (const extra of ['raddr 1.1.1.1', 'rport 9', 'ufrag abcd', 'foo bar', 'network-id 2', 'generation -1']) {
    await reject(offer().replace('network-cost 10', `network-cost 10 ${extra}`), 'CANDIDATE_EXTENSION');
  }
  for (const replacement of ['0', '65536', '-1', 'abc']) await reject(offer().replace('55000', replacement), 'CANDIDATE_NOT_ALLOWED');
  await reject(offer().replace(' udp ', ' sctp '), 'CANDIDATE_NOT_ALLOWED');
  await reject(offer().replace(' udp ', ' tcp '), 'CANDIDATE_TCP_TYPE');
});

test('security attributes, SDP bounds, datachannels, remote-candidates and injected code fail closed', async () => {
  for (const name of ['fingerprint', 'ice-ufrag', 'ice-pwd', 'setup']) {
    await reject(offer().split('\r\n').filter((line) => !line.startsWith(`a=${name}:`)).join('\r\n'), 'SECURITY_ATTRIBUTE_REQUIRED');
  }
  await reject(offer().replace('sha-256', 'sha-1'), 'FINGERPRINT_REQUIRED_SHA256');
  await reject(offer().replace('ice-pwd:abcdefghijklmnopqrstuv', 'ice-pwd:short'), 'ICE_PWD_INVALID');
  await reject(offer().replace('m=video 9 UDP/TLS/RTP/SAVPF 96', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel'), 'MEDIA_NOT_ALLOWED');
  await reject(offer() + 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', 'MEDIA_LIMIT');
  for (const line of ['a=remote-candidates:1 1.1.1.1 9', 'a=ice-lite', 'a=connection:new', 'u=https://example.com', '<script>alert(1)</script>']) {
    await assert.rejects(policy.sanitizeOffer(offer() + line + '\r\n'));
  }
  await reject(offer().replace(/^a=candidate:.*\r\n/gm, ''), 'HOST_CANDIDATE_REQUIRED');
  await reject('x'.repeat(65537), 'SDP_SIZE_OR_TYPE');
  await reject(offer() + '\u0000', 'SDP_ENCODING');
});

test('mDNS dedup, literal rewrite, no second resolution, and mixed/rebinding rejection', async () => {
  let calls = 0;
  let signal;
  const injected = createRtcPolicy({ addresses: [HOST], lookupMdns: async (name, options) => {
    calls++;
    signal = options.signal;
    assert.equal(name, NAME);
    return calls === 1 ? [HOST] : ['1.1.1.1'];
  } });
  const result = await injected.sanitizeOffer(offer(NAME));
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  assert.ok(!result.includes('.local'));
  assert.equal(await injected.sanitizeOffer(result), result);
  assert.equal(calls, 1);
  await assert.rejects(injected.sanitizeOffer(offer(NAME)), { code: 'NONLOCAL_ADDRESS' });
  for (const answers of [[HOST, '1.1.1.1'], [], ['not-an-ip'], HOST]) {
    await assert.rejects(policy.sanitizeOffer(offer(NAME), { lookupMdns: async () => answers }));
  }
  await assert.rejects(policy.sanitizeOffer(offer(NAME), { lookupMdns: async () => { throw new Error('secret-address'); } }),
    (error) => error.code === 'MDNS_LOOKUP_FAILED' && !error.message.includes('secret-address'));
  await assert.rejects(policy.sanitizeOffer(offer(NAME), { lookupMdns: async () => { throw null; } }), { code: 'MDNS_LOOKUP_FAILED' });
});

test('mDNS caps unique queries before invoking resolver and enforces deadline/abort', async () => {
  let calls = 0;
  const extra = Array.from({ length: 17 }, (_, i) => `a=candidate:X${i} 1 udp 123 ${randomUUID()}.local 9 typ host\r\n`).join('');
  await assert.rejects(policy.sanitizeOffer(offer() + extra, { lookupMdns: async () => { calls++; return [HOST]; } }), { code: 'MDNS_NAME_LIMIT' });
  assert.equal(calls, 0);
  let signal;
  await assert.rejects(policy.sanitizeOffer(offer(NAME), { lookupMdns: (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } }), { code: 'MDNS_LOOKUP_FAILED' });
  assert.equal(signal.aborted, true);
});

// Opt-in real multicast integration: RTC_POLICY_MDNS_TEST=1 node --test eval/rtc-policy-eval.cjs
test('actual multicast-dns A/AAAA query and socket cleanup', { skip: process.env.RTC_POLICY_MDNS_TEST !== '1' }, async () => {
  const address = Object.values(os.networkInterfaces()).flat().find((entry) => entry && entry.family === 'IPv4' && !entry.internal)?.address;
  assert.ok(address, 'IPv4 NIC required for multicast integration');
  const responder = require('multicast-dns')();
  const name = `${randomUUID()}.local`;
  let questions = 0;
  try {
    await new Promise((resolve, reject) => { responder.once('ready', resolve); responder.once('error', reject); });
    responder.on('query', (packet) => {
      if (!packet.questions.some((q) => q.name === name)) return;
      assert.equal(packet.questions.length, 1, 'Chromium accepts one question per datagram');
      questions += packet.questions.filter((q) => q.name === name).length;
      responder.respond([{ name, type: 'A', ttl: 120, data: address }]);
    });
    const result = await sanitizeOffer(offer(name));
    assert.ok(!result.includes('.local'));
    assert.ok(questions >= 2);
  } finally {
    await new Promise((resolve) => responder.destroy(resolve));
  }
});

test('actual multicast-dns timeout closes its socket', { skip: process.env.RTC_POLICY_MDNS_TEST !== '1' }, async () => {
  await assert.rejects(sanitizeOffer(offer(`${randomUUID()}.local`)), { code: 'MDNS_LOOKUP_FAILED' });
});

test('real resolver retries, short TTL pins and ownership revalidation fail closed',
  { skip: process.env.RTC_POLICY_MDNS_TEST !== '1' }, async () => {
    const responder = require('multicast-dns')();
    const name = `${randomUUID()}.local`;
    const addresses = [HOST];
    const pinned = createRtcPolicy({ addresses });
    let queries = 0;
    let mode = 'local';
    try {
      await new Promise((resolve, reject) => { responder.once('ready', resolve); responder.once('error', reject); });
      responder.on('query', (packet) => {
        if (!packet.questions.some((q) => q.name === name)) return;
        if (++queries === 1 || mode === 'silent') return;
        responder.respond([{ name, type: 'A', ttl: 1, data: mode === 'foreign' ? '1.1.1.1' : HOST }]);
      });
      const result = await pinned.sanitizeOffer(offer(name));
      assert.ok(queries >= 2, 'lost initial query must be retried');
      const before = queries;
      mode = 'silent';
      assert.equal(await pinned.sanitizeOffer(offer(name)), result);
      assert.equal(queries, before, 'valid pins need no new socket/query');
      addresses.length = 0;
      mode = 'foreign';
      await assert.rejects(pinned.sanitizeOffer(offer(name)), { code: 'NONLOCAL_ADDRESS' });
      addresses.push(HOST);
      mode = 'local';
      await pinned.sanitizeOffer(offer(name));
      await new Promise((resolve) => setTimeout(resolve, 1100));
      mode = 'silent';
      await assert.rejects(pinned.sanitizeOffer(offer(name)), { code: 'MDNS_LOOKUP_FAILED' });
    } finally {
      await new Promise((resolve) => responder.destroy(resolve));
    }
  });

// Opt-in installed Chrome; no fake resolver, SDP filtering, or browser-profile changes.
test('installed Chrome five sequential new peers with real mDNS pass unchanged except candidate IPs',
  { skip: process.env.RTC_POLICY_CHROME_TEST !== '1', timeout: 90000 }, async (t) => {
    const http = require('node:http');
    const net = require('node:net');
    const { chromium } = require('playwright-core');
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><title>RTC policy integration</title>');
    });
    let browser;
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const previousNames = new Set();
      const failures = [];
      for (let round = 1; round <= 5; round++) {
      if (process.env.RTC_POLICY_EXPIRE_TEST === '1' && round === 3) await new Promise(resolve => setTimeout(resolve, 31000));
      const sdp = await page.evaluate(async () => {
        window.policyPeer?.close();
        const pc = window.policyPeer = new RTCPeerConnection({ iceServers: [] });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        pc.addTransceiver('video', { direction: 'recvonly' });
        await pc.setLocalDescription(await pc.createOffer());
        if (pc.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Chrome ICE gathering timeout')), 10000);
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') { clearTimeout(timer); resolve(); }
          });
        });
        return pc.localDescription.sdp;
      });
      assert.ok(Buffer.byteLength(sdp) < 32768, 'complete offer fits service message bound');
      const original = sdp.trimEnd().split('\r\n');
      const candidates = original.filter((line) => line.startsWith('a=candidate:'));
      const mdns = candidates.filter((line) => line.split(' ')[4].endsWith('.local'));
      assert.ok(mdns.length > 0, 'Chrome must actually advertise mDNS for this integration check');
      const names = new Set(mdns.map((line) => line.split(' ')[4]));
      const reused = [...names].filter((name) => previousNames.has(name)).length;
      for (const name of names) previousNames.add(name);
      const started = Date.now();
      let result;
      try { result = await sanitizeOffer(sdp); } catch (error) {
        failures.push({ round, code: error.code });
        t.diagnostic(`round=${round}; uniqueNames=${names.size}; reusedNames=${reused}; result=${error.code}; elapsedMs=${Date.now() - started}`);
        continue;
      }
      const elapsed = Date.now() - started;
      const sanitized = result.trimEnd().split('\r\n');
      assert.equal(sanitized.length, original.length, 'no SDP fields removed');
      const canonical = (address) => net.isIP(address) === 6
        ? new URL(`http://[${address}]/`).hostname.slice(1, -1) : address;
      const own = new Set(['127.0.0.1', '::1', ...Object.values(os.networkInterfaces()).flat()
        .filter(Boolean).map((entry) => canonical(entry.address))]);
      for (let i = 0; i < original.length; i++) {
        if (!original[i].startsWith('a=candidate:')) {
          assert.ok(original[i] === sanitized[i], 'non-candidate SDP field preserved');
          continue;
        }
        const before = original[i].split(' ');
        const after = sanitized[i].split(' ');
        assert.ok(net.isIP(after[4]) !== 0 && own.has(canonical(after[4])), 'rewritten candidate belongs to actual OS NIC or explicit loopback');
        before[4] = after[4];
        assert.ok(before.join(' ') === after.join(' '), 'only candidate address changed');
      }
      assert.ok(!result.includes('.local'), 'no second mDNS resolution remains');
      assert.equal(await sanitizeOffer(result), result);
      // Also let Chrome parse the sanitized complete offer, without media capture.
      await page.evaluate(async (sdp) => {
        const peer = new RTCPeerConnection({ iceServers: [] });
        try { await peer.setRemoteDescription({ type: 'offer', sdp }); } finally { peer.close(); }
      }, result);
      t.diagnostic(`Chrome ${browser.version()}; round=${round}; offerBytes=${Buffer.byteLength(sdp)}; candidates=${candidates.length}; mdnsRewritten=${mdns.length}; uniqueNames=${names.size}; reusedNames=${reused}; elapsedMs=${elapsed}`);
      }
      assert.equal(failures.length, 0, `repeated offer failures: ${JSON.stringify(failures)}`);
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
