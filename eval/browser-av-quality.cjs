// Bounded quality probe: production service, production drawer, real VP8/Opus fixture.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { createStaticServer } = require('../desktop/server');
const { startBrowserService } = require('../web/browser-service.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const label = process.argv[2] || 'current';
async function main() {
  const started = Date.now();
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode', 'fa-av-quality-'));
  const server = createStaticServer(path.join(__dirname, '..'));
  let service, browser, page, stage = 'startup';
  const watchdog = setTimeout(() => { console.error('FAIL: quality probe exceeded 85 seconds'); void cleanup().finally(() => { process.exitCode = 1; }); }, 85000);
  async function cleanup() {
    clearTimeout(watchdog);
    await browser?.close(); await service?.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    service = await startBrowserService({ port: 0, origins: [origin], profileDir: profile, fixtureDirectory: path.join(__dirname, 'av-fixtures') });
    browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await context.addInitScript(({ port }) => {
      const fetchOriginal = window.fetch.bind(window);
      window.fetch = (url, init) => fetchOriginal(typeof url === 'string' ? url.replace('http://127.0.0.1:47812/', `http://127.0.0.1:${port}/`) : url, init);
      const WS = window.WebSocket;
      window.WebSocket = class extends WS { constructor(url, protocols) { super(String(url).replace('ws://127.0.0.1:47812/', `ws://127.0.0.1:${port}/`), protocols); } };
      const PC = window.RTCPeerConnection;
      window.__qualityPeers = [];
      window.RTCPeerConnection = class extends PC { constructor(...args) { super(...args); window.__qualityPeers.push(this); } };
      localStorage.setItem('nexus:bg', JSON.stringify({ mode: 'matrix-center', blur: 4 }));
    }, { port: service.port });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    stage = 'adapter readiness';
    await page.waitForFunction(() => document.getElementById('browserDiagnostic').textContent.length > 0);
    await page.locator('#btnBrowser').click();
    await page.locator('#browserAddress').fill('https://fixture.test/');
    await page.locator('#browserAddress').press('Enter');
    const video = page.locator('.browser-web-video');
    await video.waitFor();
    stage = 'first decoded frame';
    await page.waitForFunction(() => document.querySelector('.browser-web-video')?.readyState >= 2);
    const viewport = service.state().viewport;
    assert.ok(viewport.width >= 600, 'production drawer must provide readable logical width');
    const point = await video.evaluate((v, viewport) => {
      const r = v.getBoundingClientRect(), scale = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
      return { x: r.x + (r.width - v.videoWidth * scale) / 2 + 48 / viewport.width * v.videoWidth * scale,
        y: r.y + (r.height - v.videoHeight * scale) / 2 + 32 / viewport.height * v.videoHeight * scale };
    }, viewport);
    await page.mouse.click(point.x, point.y);
    stage = 'source demo playback';
    await page.waitForFunction(() => [...document.querySelectorAll('.browser-tab')].some(t => t.textContent.includes('AV demo playing')));
    await page.locator('#browserAudio').click();
    await wait(1500);
    const samples = [];
    async function sample() {
      const metrics = await service.metrics(), capture = metrics[0]?.capture;
      // Explicit allowlist: track device IDs and all network/SDP data stay private.
      const tracks = capture?.tracks.map(t => ({ kind: t.kind, muted: t.muted, enabled: t.enabled,
        settings: Object.fromEntries(['width', 'height', 'frameRate', 'resizeMode', 'sampleRate', 'channelCount'].filter(k => t.settings?.[k] !== undefined).map(k => [k, t.settings[k]])) }));
      const receiver = await page.evaluate(async () => {
        const pc = window.__qualityPeers.findLast(p => p.connectionState === 'connected');
        const out = { video: {}, audio: {} };
        if (!pc) throw Error('No connected receiver');
        (await pc.getStats()).forEach(s => {
          if (s.type === 'inbound-rtp' && s.kind === 'video') for (const k of ['frameWidth', 'frameHeight', 'framesDecoded', 'framesDropped', 'totalDecodeTime', 'framesPerSecond', 'bytesReceived']) out.video[k] = s[k];
          if (s.type === 'inbound-rtp' && s.kind === 'audio') for (const k of ['totalSamplesReceived', 'totalAudioEnergy']) out.audio[k] = s[k];
        });
        return out;
      });
      return { time: Date.now(), capture: { tracks, video: capture?.video }, receiver,
        cpuPercentSum: metrics.reduce((sum, m) => sum + (m.cpu?.percentCPUUsage || 0), 0) };
    }
    samples.push(await sample());
    for (let i = 0; i < 3; i++) { await wait(2500); samples.push(await sample()); }
    const first = samples[0], last = samples.at(-1), seconds = (last.time - first.time) / 1000;
    const decodedFps = (last.receiver.video.framesDecoded - first.receiver.video.framesDecoded) / seconds;
    const encodedFrames = last.capture.video.framesEncoded - first.capture.video.framesEncoded;
    const result = { label, presentation: 'unchanged production UI, matrix-center background, 1440x1000 Chrome viewport',
      viewport, samples, decodedFps, encodedFps: encodedFrames / seconds,
      encodeMsPerFrame: (last.capture.video.encodeTime - first.capture.video.encodeTime) * 1000 / encodedFrames,
      audioSamplesDelta: last.receiver.audio.totalSamplesReceived - first.receiver.audio.totalSamplesReceived,
      audioEnergyDelta: last.receiver.audio.totalAudioEnergy - first.receiver.audio.totalAudioEnergy,
      readableTarget: decodedFps >= 20 && samples.slice(1).every(s => s.receiver.video.frameWidth >= 600), elapsedMs: Date.now() - started };
    console.log('MEASURED: ' + JSON.stringify(result));
    console.log(result.readableTarget ? 'VERIFIED: >=600 decoded pixels wide and >=20fps in production UI' : 'RESULT: readable-resolution target not met; see capture vs encoder measurements');
  } catch (error) {
    console.error('QUALITY-DIAGNOSTIC:', JSON.stringify({ stage, state: service?.state(), ui: page ? await page.locator('.browser-web-overlay').textContent().catch(() => '') : '' }));
    throw error;
  } finally { await cleanup(); }
}
main().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
