// JavaScript, eval/browser-web-eval.cjs, Node/Chrome; real web UI + remote Chromium.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright-core');
const { createStaticServer } = require('../desktop/server');
const { startBrowserService } = require('../web/browser-service.cjs');
const { navigation } = require('../desktop/browser-policy');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
async function eventually(predicate, name, duration = 12000) {
  const start = Date.now();
  while (Date.now() - start < duration) {
    if (await predicate()) { checks.push(name); console.log('PASS:', name); return; }
    await delay(100);
  }
  throw new Error('Timeout: ' + name);
}
const fixture = `<!doctype html><meta charset="utf-8"><title>fixture</title>
<style>body{margin:0;height:2600px;background:#192330;color:white}input{position:absolute;left:20px;top:40px;width:300px;height:36px}button{position:absolute;left:20px;top:95px;width:180px;height:35px}a{position:absolute;left:20px;top:150px;color:white}canvas{position:absolute;top:200px;left:20px}</style>
<input id="text" oninput="document.title='typed:'+this.value"><button onclick="document.title='clicked:'+document.getElementById('text').value">Aplicar</button>
<a href="https://fixture.test/next" target="_blank">Nova aba</a><canvas width="120" height="100" id="animation"></canvas>
<script>localStorage.setItem('fixture','saved');document.cookie='fixture=saved;Max-Age=3600;Secure;SameSite=Lax';let n=0;setInterval(()=>{const c=animation.getContext('2d');c.fillStyle='hsl('+n++*30+',80%,50%)';c.fillRect(0,0,120,100);},100);let sy=0;onscroll=()=>{sy=scrollY;document.title='scroll:'+sy};</script>`;

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode', 'fa-web-test-'));
  const server = createStaticServer(path.join(__dirname, '..'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let service, browser, remotePage, restoring = false;
  const options = { engine: 'jpeg', port: 47812, origins: [origin], profileDir: profile,
    fixture: route => {
      remotePage = route.request().frame().page();
      const body = restoring ? fixture.replace("localStorage.setItem('fixture','saved');document.cookie='fixture=saved;Max-Age=3600;Secure;SameSite=Lax';", '') : fixture;
      return route.request().url().endsWith('/failure') ? route.abort('failed') : route.fulfill({ contentType: 'text/html', body });
    } };
  try {
    service = await startBrowserService(options);
    assert.equal((await fetch('http://127.0.0.1:47812/bootstrap')).status, 403);
    assert.equal((await fetch('http://127.0.0.1:47812/bootstrap', { headers: { Origin: 'https://evil.invalid' } })).status, 403);
    const badHost = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: 47812, path: '/bootstrap', headers: { Origin: origin, Host: 'evil.invalid' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(badHost, 403);
    checks.push('bootstrap rejects missing/foreign Origin and Host');
    assert.equal(navigation('youtube.com'), 'https://youtube.com/');
    assert.ok(navigation('youtube').includes('q=youtube'));
    assert.ok(navigation('yt').includes('q=yt'));
    checks.push('youtube.com vs youtube vs yt routing');
    browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      window.__webFrames = [];
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', event => {
            try { const f = JSON.parse(event.data); if (f.type === 'frame') window.__webFrames.push({ width: f.width, height: f.height, bytes: f.data.length * .75, transit: Date.now() - f.sentAt, time: performance.now() }); } catch {}
          });
        }
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('#btnBrowser').click();
    await page.locator('#browserAddress').fill('https://fixture.test/form');
    await page.locator('#browserAddress').press('Enter');
    await eventually(() => service.state().tabs.some(tab => tab.url.includes('/form')), 'actual remote page loaded from web drawer');
    await eventually(async () => (await page.evaluate(() => window.__webFrames.length)) >= 3, 'three or more live JPEG frames reach web canvas');
    const canvas = page.locator('.browser-web-canvas');
    async function point(x, y) {
      return page.evaluate(({ x, y }) => {
        const c = document.querySelector('.browser-web-canvas').getBoundingClientRect();
        const f = window.__webFrames.at(-1), scale = Math.min(c.width / f.width, c.height / f.height);
        return { x: (c.width - f.width * scale) / 2 + x * scale, y: (c.height - f.height * scale) / 2 + y * scale };
      }, { x, y });
    }
    const start = performance.now();
    await canvas.click({ position: await point(100, 60) });
    await page.keyboard.type('Free Agent');
    await page.keyboard.insertText(' á');
    await eventually(() => service.state().tabs.some(tab => tab.title === 'typed:Free Agent á'), 'mouse, keyboard and Unicode insertText reach remote form');
    const observedInputMs = performance.now() - start;
    await canvas.click({ position: await point(100, 110) });
    await eventually(() => service.state().tabs.some(tab => tab.title === 'clicked:Free Agent á'), 'remote form button receives click');
    await canvas.click({ position: await point(80, 155) });
    await eventually(() => service.state().tabs.length === 2 && service.state().tabs.every(t => t.url.startsWith('https://fixture.test/') && !t.loading), 'remote target blank creates independent loaded tab');
    const firstId = service.state().tabs[0].id;
    await page.locator('#browserTabs [role=tab]').first().click();
    await eventually(async () => (await canvas.getAttribute('data-frame-tab')) === firstId, 'switch displays the selected tab frame before input');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 350, box.y + 250);
    await page.mouse.wheel(0, 420);
    await eventually(() => service.state().tabs.some(tab => /^scroll:[1-9]/.test(tab.title)), 'real wheel input scrolls remote document');
    await page.locator('#browserExpand').click();
    await eventually(async () => (await page.evaluate(() => window.__webFrames.at(-1)?.width)) > 1000, 'expanded viewport produces correctly sized frames');
    await page.locator('#browserExpand').click();
    await page.locator('#browserCollapse').click();
    await delay(500);
    const frozen = await page.evaluate(() => window.__webFrames.length);
    await delay(900);
    assert.equal(await page.evaluate(() => window.__webFrames.length), frozen);
    assert.equal(service.state().tabs.length, 2);
    checks.push('collapse stops frame transmission without closing tabs');
    await page.locator('#btnBrowser').click();
    await eventually(async () => (await page.evaluate(() => window.__webFrames.length)) > frozen, 'reopen resumes interactive capture');
    const frameMetrics = await page.evaluate(() => {
      const f = window.__webFrames;
      return { frames: f.length, jpegMeanBytes: Math.round(f.reduce((n, x) => n + x.bytes, 0) / f.length),
        transitMeanMs: Math.round(f.reduce((n, x) => n + x.transit, 0) / f.length * 100) / 100 };
    });
    await service.close(); service = null;
    await eventually(async () => (await page.locator('#browserDiagnostic').textContent()).includes('desconectado'), 'service loss produces visible disconnected diagnostic');
    restoring = true;
    service = await startBrowserService(options);
    await page.locator('#browserRetry').click();
    await eventually(() => service.state().tabs.length >= 2, 'reconnect restores saved tabs from persistent profile');
    try {
      await eventually(async () => (await page.evaluate(() => window.__webFrames.length)) > frameMetrics.frames, 'reconnect resumes live surface');
    } catch (error) {
      console.log('RECONNECT-DIAGNOSTIC', JSON.stringify({ debug: service.debugState(), state: service.state(), ui: await page.locator('#browserDiagnostic').textContent(), error: await page.locator('#browserError').textContent(), frames: await page.evaluate(() => window.__webFrames.length), viewport: await page.locator('#browserViewport').boundingBox() }));
      throw error;
    }
    assert.equal(await remotePage.evaluate(() => localStorage.getItem('fixture')), 'saved');
    assert.ok((await remotePage.context().cookies('https://fixture.test/')).some(cookie => cookie.name === 'fixture' && cookie.value === 'saved'));
    checks.push('web profile restores localStorage and persistent cookie');
    await page.locator('#browserTabs .browser-tab-close').last().click();
    await eventually(() => service.state().tabs.length === 1, 'closing one web tab preserves the remaining tab');
    await remotePage.context().close();
    await eventually(() => !service.state().connected, 'unexpected Chromium closure is diagnosed');
    await page.locator('#browserCreate').click();
    await eventually(() => service.state().connected && service.state().tabs.length >= 2, 'create restarts Chromium and recovers saved tabs');
    assert.equal(service.state().capabilities.audio, false);
    assert.equal(await page.locator('#browserMediaNotice').isVisible(), true);
    checks.push('audio limitation explicitly disclosed');
    assert.deepEqual(errors, []);
    console.log('VERIFIED: ' + JSON.stringify({ checks, observedInputMs: Math.round(observedInputMs), frameMetrics,
      hostNodeMemory: process.memoryUsage().rss, note: 'Fixture-backed actual Chromium. Input latency includes typing, state polling and UI. No audio stream.' }));
  } finally {
    await browser?.close(); await service?.close();
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
