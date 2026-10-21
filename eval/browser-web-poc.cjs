'use strict';

const { chromium } = require('playwright-core');
const { mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = `<!doctype html><html><head><title>Fixture ready</title>
<style>body{margin:20px;font:20px sans-serif}input,button{font:20px sans-serif;padding:12px}canvas,video{display:block;margin-top:12px}#tail{height:3000px;background:linear-gradient(white,steelblue)}</style>
</head><body><input id="name" aria-label="Name"><button id="apply">Apply</button>
<p id="result">Waiting</p><canvas id="canvas" width="600" height="200"></canvas>
<video id="video" width="300" height="100" muted playsinline></video><div id="tail">Scroll target</div>
<script>
const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d');
function animate(t) {
  ctx.fillStyle = 'hsl(' + ((t / 15) % 360) + ',70%,40%)';
  ctx.fillRect(0, 0, 600, 200);
  ctx.fillStyle = 'white';
  ctx.fillRect((t / 3) % 550, 50, 50, 100);
  ctx.font = '24px sans-serif'; ctx.fillText('Live canvas ' + Math.floor(t), 20, 30);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
window.mediaState = { playResolved: false, audioState: 'not-created', error: null };
document.querySelector('#apply').addEventListener('click', async () => {
  const text = 'Applied: ' + document.querySelector('#name').value;
  document.title = text; document.querySelector('#result').textContent = text;
  try {
    const audio = window.fixtureAudio = new AudioContext();
    const osc = window.fixtureOscillator = audio.createOscillator();
    const gain = audio.createGain(); gain.gain.value = 0.01;
    osc.frequency.value = 440; osc.connect(gain); gain.connect(audio.destination); osc.start();
    const video = document.querySelector('#video');
    video.srcObject = canvas.captureStream(30);
    await Promise.all([audio.resume(), video.play()]);
    window.mediaState.playResolved = true;
    window.mediaState.audioState = audio.state;
  } catch (e) { window.mediaState.error = String(e); }
});
</script></body></html>`;

async function main() {
  let profile, context, cdp;
  let screencastStarted = false;
  let collecting = false;
  let totalFrames = 0;
  const frames = [];
  const ackErrors = [];
  const pendingAcks = new Set();
  let metrics;
  try {
    profile = await mkdtemp(path.join('C:\\Users\\ndavi\\AppData\\Local\\Temp\\opencode', 'browser-web-poc-'));
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chrome', headless: true, chromiumSandbox: true,
      viewport: { width: 1000, height: 700 },
    });
    await context.route('https://fixture.test/**', route => route.fulfill({
      status: 200, contentType: 'text/html; charset=utf-8', body: fixture,
    }));
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://fixture.test/', { waitUntil: 'load' });
    cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const browserVersion = await cdp.send('Browser.getVersion');
    cdp.on('Page.screencastFrame', event => {
      totalFrames++;
      const jpeg = Buffer.from(event.data, 'base64');
      if (collecting) frames.push({
        bytes: jpeg.length,
        hash: createHash('sha256').update(jpeg).digest('hex'),
        jpeg: jpeg[0] === 0xff && jpeg[1] === 0xd8,
      });
      const ack = cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId })
        .catch(error => ackErrors.push(String(error)))
        .finally(() => pendingAcks.delete(ack));
      pendingAcks.add(ack);
    });
    const captureStart = performance.now();
    collecting = true;
    await cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: 65, maxWidth: 1000, maxHeight: 700, everyNthFrame: 1,
    });
    screencastStarted = true;
    async function click(selector) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box, 'Clickable element must have bounds');
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      return performance.now();
    }
    await click('#name');
    await cdp.send('Input.insertText', { text: 'Free Agent' });
    const textAck = performance.now();
    await page.waitForFunction(() => document.querySelector('#name').value === 'Free Agent');
    const textAckToObservedMs = performance.now() - textAck;
    const clickAck = await click('#apply');
    await page.waitForFunction(() => document.title === 'Applied: Free Agent' &&
      document.querySelector('#result').textContent === 'Applied: Free Agent');
    const clickAckToObservedMs = performance.now() - clickAck;
    await page.waitForFunction(() => window.mediaState.playResolved || window.mediaState.error, { timeout: 5000 });
    const media = await page.evaluate(() => ({
      ...window.mediaState,
      audioState: window.fixtureAudio?.state,
      videoPaused: document.querySelector('#video').paused,
      videoReadyState: document.querySelector('#video').readyState,
      videoTime: document.querySelector('#video').currentTime,
      videoTracks: document.querySelector('#video').srcObject?.getVideoTracks().length,
    }));
    assert.equal(media.error, null);
    assert.equal(media.playResolved, true);
    assert.equal(media.audioState, 'running');
    assert.equal(media.videoPaused, false);
    assert.ok(media.videoReadyState >= 2);
    assert.equal(media.videoTracks, 1);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 900, y: 500, deltaX: 0, deltaY: 500,
    });
    await page.waitForFunction(() => window.scrollY > 0);
    const outcome = await page.evaluate(() => ({
      title: document.title, text: document.querySelector('#result').textContent,
      input: document.querySelector('#name').value, scrollY: window.scrollY,
    }));
    await delay(Math.max(0, 2000 - (performance.now() - captureStart)));
    const captureEnd = performance.now();
    collecting = false;
    await cdp.send('Page.stopScreencast');
    screencastStarted = false;
    await delay(300);
    await Promise.all([...pendingAcks]);
    const afterDrain = totalFrames;
    const stopWatchStart = performance.now();
    await delay(800);
    const postDrainFrames = totalFrames - afterDrain;
    assert.equal(postDrainFrames, 0, 'Frames must stop after drain');
    assert.equal(ackErrors.length, 0, 'All screencast frame acknowledgments must succeed');
    const distinctFrames = new Set(frames.map(frame => frame.hash)).size;
    assert.ok(distinctFrames >= 3, 'Need at least three distinct real frames');
    assert.ok(frames.every(frame => frame.jpeg), 'Frames must be JPEGs');
    const captureMs = captureEnd - captureStart;
    metrics = {
      browser: browserVersion.product, protocol: browserVersion.protocolVersion,
      fixture: 'https://fixture.test/ (context.route HTML)',
      launch: { channel: 'chrome', headless: true, chromiumSandbox: true },
      screencast: { format: 'jpeg', quality: 65, maxWidth: 1000, maxHeight: 700,
        captureMs, frames: frames.length, distinctFrames,
        meanJpegBytes: frames.reduce((sum, frame) => sum + frame.bytes, 0) / frames.length,
        framesPerSecond: frames.length * 1000 / captureMs,
        sampleSha256: [...new Set(frames.map(frame => frame.hash))].slice(0, 3),
        ackErrors, postStopDrainMs: 300, postDrainObservationMs: performance.now() - stopWatchStart,
        postDrainFrames },
      input: { textAckToObservedMs, clickAckToObservedMs,
        timingDefinition: 'CDP command response to successful DOM observation (includes observation round-trip)',
        ...outcome },
      media: { ...media, cdpFramesCarryAudio: false, audioTransmissionTested: false,
        note: 'CDP screencast frames do NOT carry audio; no audio transmission was tested.' },
    };
    await page.evaluate(async () => {
      window.fixtureOscillator.stop();
      await window.fixtureAudio.close();
      document.querySelector('#video').srcObject.getTracks().forEach(track => track.stop());
    });
  } finally {
    try {
      if (cdp && screencastStarted) await cdp.send('Page.stopScreencast');
    } finally {
      try {
        await Promise.all([...pendingAcks]);
        if (cdp) await cdp.detach();
      } finally {
        try { if (context) await context.close(); }
        finally { if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      }
    }
  }
  console.log('VERIFIED: ' + JSON.stringify({ ...metrics, cleanup: 'CDP detached; context closed; temporary profile removed' }, null, 2));
}

main().catch(error => {
  console.error('BLOCKER: Actual Chrome/CDP proof failed. ' + (error.stack || error));
  process.exitCode = 1;
});
