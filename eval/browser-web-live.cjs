'use strict';

// Live public-site probe: deliberately no fixtures, page/CDP access or protection overrides.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { WebSocket } = require('ws');
const { startBrowserService } = require('../web/browser-service.cjs');
const { navigation, publicUrl } = require('../desktop/browser-policy');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = path.resolve(__dirname, '..');
const tempParent = 'C:\\Users\\ndavi\\AppData\\Local\\Temp\\opencode';
const checks = [];
const siteobservations = [];
let service, socket, profileDir, state, sequence = 0, current;
const pending = new Map();
function verified(check) { checks.push(check); console.log(`VERIFIED: ${check}`); }
function rpc(command, payload = {}, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC ${command}: timeout`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, command, payload }));
  });
}
function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null;
  for (let i = 2; i + 8 < bytes.length;) {
    if (bytes[i] !== 0xff) return null;
    if ([0xc0, 0xc1, 0xc2].includes(bytes[i + 1])) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
    const length = bytes.readUInt16BE(i + 2);
    if (length < 2) return null;
    i += length + 2;
  }
  return null;
}

async function run() {
  assert((await fs.stat(tempParent)).isDirectory());
  profileDir = await fs.mkdtemp(path.join(tempParent, 'browser-web-live-'));
  assert(path.relative(root, profileDir).startsWith('..' + path.sep));
  service = await startBrowserService({ engine: 'jpeg', port: 0, origins: ['http://127.0.0.1:8080'], profileDir });
  assert(service.port > 0);
  verified('real service on ephemeral loopback port; temporary profile outside workspace');
  socket = new WebSocket(`ws://127.0.0.1:${service.port}/session`, { origin: 'http://127.0.0.1:8080' });
  socket.on('message', data => {
    let message;
    try { message = JSON.parse(data.toString()); } catch { return; }
    if (message.type === 'state') state = message.state;
    if (message.type === 'frame' && current && (!current.tabId || current.tabId === message.tabId)) {
      const bytes = Buffer.from(message.data, 'base64');
      const size = jpegSize(bytes);
      if (size?.width === 1000 && size.height === 700) {
        current.frames++;
        current.bytes += bytes.length;
        current.lastFrame = bytes;
      } else current.invalidFrames++;
    }
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
    }
  });
  socket.on('error', () => {});
  socket.on('close', () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('WebSocket closed')); }
    pending.clear();
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    socket.once('open', () => { clearTimeout(timer); resolve(); });
    socket.once('error', () => { clearTimeout(timer); reject(new Error('WebSocket connection failed')); });
  });
  socket.send(JSON.stringify({ type: 'auth', token: service.token }));
  const authDeadline = Date.now() + 3000;
  while (!state && Date.now() < authDeadline) await sleep(50);
  assert.equal(state?.controlling, true);
  assert.equal(state.capabilities.audio, false);
  verified('authenticated controlling WebSocket using service token; audio capability false');
  await rpc('layout', { visible: true, x: 0, y: 0, width: 1000, height: 700 });

  for (const [index, input] of ['youtube.com', 'youtube', 'yt', 'https://www.bing.com/search?q=yt'].entries()) {
    const canonicalTarget = navigation(input);
    assert(publicUrl(canonicalTarget));
    current = { frames: 0, bytes: 0, invalidFrames: 0, tabId: state.activeId };
    const observation = { input, command: index === 0 ? 'create' : 'navigate', canonicalTarget };
    siteobservations.push(observation);
    try {
      // Launch time is separate from the bounded public-navigation observation window.
      const reply = await rpc(observation.command, index === 0 ? { url: input } : { value: input }, 25000);
      current.tabId = reply.activeId;
      const start = Date.now(), deadline = start + 25000;
      let stableSince = 0, previous = '', settled = false, tab;
      while (Date.now() < deadline) {
        tab = state?.tabs.find(item => item.id === current.tabId);
        const signature = JSON.stringify([tab?.url, tab?.title, tab?.error]);
        if (tab && publicUrl(tab.url) && !tab.loading) {
          if (signature !== previous) stableSince = Date.now();
          if (Date.now() - stableSince >= 2500) { settled = true; break; }
        } else stableSince = Date.now();
        previous = signature;
        await sleep(200);
      }
      tab = state?.tabs.find(item => item.id === current.tabId);
      Object.assign(observation, { elapsedMs: Date.now() - start, settled, title: tab?.title ?? null,
        url: tab?.url ?? null, error: tab?.error ?? null, loading: tab?.loading ?? null });
      const gate = /captcha|unusual traffic|consent|before you continue|sign in|access denied|robot|blocked|\/sorry(?:\/|\?)/i.test(`${tab?.title} ${tab?.url}`);
      observation.status = tab?.error ? 'navigation_failed' : !settled ? 'settle_timeout' : gate ? 'possible_site_gate' : 'public_navigation_observed_content_unverified';
      observation.limitations = [];
      if (tab?.error) observation.limitations.push(tab.error);
      if (!settled) observation.limitations.push('Public navigation did not settle within 25 seconds.');
      if (gate) observation.limitations.push('Possible CAPTCHA/auth/consent/site block; no interaction or bypass attempted.');
      if (index > 0) observation.limitations.push('Search result relevance and successful query delivery are not established by title/URL or JPEG receipt.');
      if (settled) verified(`${input}: public URL/loading/title state settled (does not establish site/query success)`);
    } catch (error) {
      observation.status = 'probe_failed';
      observation.error = String(error.message).replaceAll(service.token, '[redacted]');
      observation.limitations = ['Command failed; site/query success not established.'];
    }
    Object.assign(observation, { actualJPEGFrames: current.frames,
      avgJPEGBytes: current.frames ? Math.round(current.bytes / current.frames) : 0,
      invalidFrames: current.invalidFrames, mediaVisibleViaFrames: 'not established', actualAVProven: false });
    if (current.lastFrame) {
      observation.frameEvidence = path.join(profileDir, `input-${index + 1}.jpg`);
      await fs.writeFile(observation.frameEvidence, current.lastFrame);
      verified(`${input}: ${current.frames} actual JPEG frame(s), 1000x700`);
    } else observation.limitations.push('No validated 1000x700 JPEG received.');
    current = null;
    if (observation.status === 'settle_timeout') await rpc('stop').catch(() => {});
  }
}

(async () => {
  const watchdog = setTimeout(() => {
    console.error('Live probe exceeded runtime budget; cleanup requested.');
    socket?.terminate();
    void service?.close();
    process.exitCode = 1;
  }, 105000);
  try { await run(); }
  catch (error) {
    console.error(`Live probe failed: ${String(error.message).replaceAll(service?.token || '\0', '[redacted]')}`);
    process.exitCode = 1;
  } finally {
    try {
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        await new Promise(resolve => {
          const timer = setTimeout(() => { socket.terminate(); resolve(); }, 1000);
          socket.once('close', () => { clearTimeout(timer); resolve(); });
          socket.close();
        });
      }
      await service?.close();
      if (service) {
        assert.equal(service.state().connected, false);
        assert.equal(service.state().tabs.length, 0);
        verified('WebSocket closed; service/browser resources closed; no connected browser or remaining tabs');
      }
    } catch { console.error('Resource cleanup could not be verified.'); process.exitCode = 1; }
    clearTimeout(watchdog);
    console.log(JSON.stringify({ checks, siteobservations, limitations: [
      'Live internet through the unchanged service public-IP HTTP/TLS proxy; no fixtures.',
      'JPEG receipt establishes image transport only; inspect frameEvidence for site content and media visibility.',
      'YouTube homepage only; no video selected, no fabricated video ID, actual audio/video playback not proven.',
      'Audio unavailable; downloads denied and service workers blocked by the existing engine.',
      'CAPTCHA/auth/consent were not bypassed. Temporary profile and JPEG evidence retained outside workspace.'
    ] }, null, 2));
  }
})();
