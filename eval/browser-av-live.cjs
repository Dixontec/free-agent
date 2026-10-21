'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright-core');
const { createStaticServer } = require('../desktop/server');
const { startBrowserService } = require('../web/browser-service.cjs');
const TEMP = 'C:\\Users\\ndavi\\AppData\\Local\\Temp\\opencode';
const wait = ms => new Promise(r => setTimeout(r, ms));
const report = { sites: [], errors: [], limits: 'Somente duas fontes públicas; sem teste de DRM, login ou compatibilidade universal. Frames RTP sozinhos não provam reprodução da mídia: exigir também transições visuais e energia de áudio.' };
let browser, service, server, page, output, profile, closing;
async function until(fn, label, timeout = 14000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await fn()) return; await wait(150); }
  throw Error('Timeout: ' + label);
}
async function cleanup() {
  if (closing) return closing;
  closing = (async () => {
    await browser?.close().catch(() => {});
    await service?.close().catch(() => {});
    if (server) await new Promise(r => { server.closeAllConnections(); server.close(r); });
    if (profile) await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(e => report.errors.push('profile cleanup: ' + e.message));
  })();
  return closing;
}
(async () => {
  await fs.access(TEMP);
  output = await fs.mkdtemp(path.join(TEMP, 'fa-av-live-'));
  profile = await fs.mkdtemp(path.join(TEMP, 'fa-av-live-profile-'));
  const deadline = setTimeout(() => { report.errors.push('Limite de runtime: 110s'); void cleanup(); }, 110000);
  try {
    server = createStaticServer(path.join(__dirname, '..'));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    service = await startBrowserService({ port: 0, origins: [origin], profileDir: profile });
    report.capabilities = service.state().capabilities;
    assert.ok(report.capabilities?.audio && report.capabilities?.transport === 'webrtc', 'Default production worker must expose audio/webrtc');
    browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ port }) => {
      const fetchOriginal = window.fetch.bind(window);
      window.fetch = (url, init) => fetchOriginal(typeof url === 'string' ? url.replace('http://127.0.0.1:47812/', `http://127.0.0.1:${port}/`) : url, init);
      const WS = window.WebSocket;
      window.WebSocket = class extends WS { constructor(url, protocols) { super(String(url).replace('ws://127.0.0.1:47812/', `ws://127.0.0.1:${port}/`), protocols); } };
      const PC = window.RTCPeerConnection;
      window.__livePeers = [];
      window.RTCPeerConnection = class extends PC { constructor(...args) { super(...args); window.__livePeers.push(this); } };
    }, { port: service.port });
    page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('#browserDiagnostic')?.textContent.length > 0);
    await page.locator('#btnBrowser').click();
    const video = page.locator('.browser-web-video');
    const current = () => { const s = service.state(); return s.tabs.find(t => t.id === s.activeId); };
    async function navigate(url) {
      await page.locator('#browserAddress').fill(url);
      await page.locator('#browserAddress').press('Enter');
      await until(() => current()?.url?.startsWith(url), 'source URL');
      await until(() => video.evaluate(v => v.readyState >= 2 && v.videoWidth > 0), 'native RTC video');
    }
    async function measure(ms = 4500) {
      return page.evaluate(async ms => {
        const v = document.querySelector('.browser-web-video');
        const pc = window.__livePeers.findLast(p => p.connectionState === 'connected');
        if (!pc) throw Error('No connected receiver peer');
        const sum = (stats, kind, key) => { let n = 0; stats.forEach(s => { if (s.type === 'inbound-rtp' && (s.kind || s.mediaType) === kind) n += s[key] || 0; }); return n; };
        const before = await pc.getStats(), start = performance.now();
        const c = document.createElement('canvas'); c.width = 48; c.height = 27;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        let previous, transitions = 0, maxMeanDifference = 0, displayFrames = 0, active = true;
        const callback = () => { if (!active) return; displayFrames++; v.requestVideoFrameCallback(callback); };
        v.requestVideoFrameCallback(callback);
        for (let elapsed = 0; elapsed < ms; elapsed += 250) {
          ctx.drawImage(v, 0, 0, 48, 27);
          const pixels = ctx.getImageData(0, 0, 48, 27).data;
          if (previous) { let delta = 0; for (let i = 0; i < pixels.length; i++) if (i % 4 !== 3) delta += Math.abs(pixels[i] - previous[i]);
            const mean = delta / (48 * 27 * 3); maxMeanDifference = Math.max(maxMeanDifference, mean); if (mean > 1) transitions++; }
          previous = pixels; await new Promise(r => setTimeout(r, 250));
        }
        active = false;
        const after = await pc.getStats(), durationMs = performance.now() - start;
        const delta = (kind, key) => sum(after, kind, key) - sum(before, kind, key);
        return { durationMs, encodedWidth: v.videoWidth, encodedHeight: v.videoHeight, displayFrames, displayFps: displayFrames * 1000 / durationMs,
          framesReceived: delta('video', 'framesReceived'), framesDecoded: delta('video', 'framesDecoded'), audioSamples: delta('audio', 'totalSamplesReceived'),
          audioEnergy: delta('audio', 'totalAudioEnergy'), transitions, maxMeanDifference, receiverMuted: v.muted, receiverVolume: v.volume };
      }, ms);
    }
    async function screenshot(name) { const p = path.join(output, name + '.png'); await page.screenshot({ path: p }); return p; }
    const youtube = { requestedURL: 'https://www.youtube.com/', status: 'failed' };
    report.sites.push(youtube);
    try {
      await navigate(youtube.requestedURL); await wait(6500);
      Object.assign(youtube, { source: current(), measurement: await measure(2000), screenshot: await screenshot('youtube-home') });
      youtube.status = youtube.measurement.framesDecoded > 0 && /youtube/i.test(youtube.source.title) ? 'RTC delivered; screenshot requires visual inspection' : 'failed';
    } catch (e) { youtube.error = e.message; youtube.source = current(); youtube.screenshot = await screenshot('youtube-failure'); }
    const demo = { requestedURL: 'https://media.w3.org/2010/05/sintel/trailer.mp4', status: 'failed' };
    report.sites.push(demo);
    try {
      const response = await fetch(demo.requestedURL, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(10000) });
      demo.availability = { status: response.status, url: response.url, contentType: response.headers.get('content-type'), contentRange: response.headers.get('content-range') };
      await response.body?.cancel();
      assert.ok(response.ok && /video\//i.test(demo.availability.contentType || ''), 'Public demo availability validation failed');
      await navigate(demo.requestedURL); await wait(3000);
      const viewport = service.state().viewport;
      const point = await video.evaluate((v, viewport) => {
        const r = v.getBoundingClientRect(), scale = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
        const logical = { x: viewport.width / 2, y: viewport.height / 2 };
        return { x: r.x + (r.width - v.videoWidth * scale) / 2 + logical.x / viewport.width * v.videoWidth * scale,
          y: r.y + (r.height - v.videoHeight * scale) / 2 + logical.y / viewport.height * v.videoHeight * scale, logical };
      }, viewport);
      demo.pointerMapping = { viewport, point };
      const surface = page.locator('.browser-web-surface');
      const box = await surface.boundingBox();
      assert.ok(box, 'Production pointer surface missing');
      await surface.click({ position: { x: point.x - box.x, y: point.y - box.y } });
      const audio = page.locator('#browserAudio');
      demo.audioButtonBefore = await audio.textContent();
      await audio.click();
      await wait(1500);
      demo.measurement = await measure();
      demo.screenshots = [await screenshot('demo-video')];
      if (!(demo.measurement.audioEnergy > 0 && demo.measurement.transitions >= 3)) {
        // The source has focus from the real pointer click; Space is forwarded by the normal UI.
        await page.keyboard.press('Space'); await wait(1000);
        demo.retryMeasurement = await measure();
        demo.screenshots.push(await screenshot('demo-video-space'));
      }
      const m = demo.retryMeasurement || demo.measurement;
      demo.source = current();
      demo.status = m.framesReceived > 0 && m.framesDecoded > 0 && m.transitions >= 3 && m.audioEnergy > 0 && !m.receiverMuted ? 'passed: moving source plus received audio energy' : 'failed: source playback not proven';
    } catch (e) { demo.error = e.message; demo.source = current(); demo.screenshot = await screenshot('demo-failure'); }
    report.workerMetrics = await service.metrics();
    report.uiError = await page.locator('#browserError').textContent();
    report.logicalViewport = service.state().viewport;
  } catch (e) { report.errors.push(e.message); }
  finally {
    await cleanup(); clearTimeout(deadline);
    report.artifacts = output;
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (report.sites.length === 2 && report.sites.every(s => s.status.startsWith('passed') || s.status.startsWith('RTC delivered')) && !report.errors.length) console.log('VERIFIED: live production AV measurements captured; inspect host screenshots for site visibility.');
    else { console.log('INCOMPLETE: see per-site blockers; no universal compatibility claim.'); process.exitCode = 1; }
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
