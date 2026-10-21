// JavaScript, eval/browser-electron-eval.cjs, Electron 44; native fixture integration.
'use strict';
const { app, BrowserWindow, session, webContents, dialog } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStaticServer } = require('../desktop/server');
const { createBrowserManager } = require('../desktop/browser-manager');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const restoreArg = process.argv.find(arg => arg.startsWith('--restore-data='));
const data = restoreArg ? restoreArg.slice('--restore-data='.length) : fs.mkdtempSync(path.join(os.tmpdir(), 'opencode', 'fa-browser-'));
app.setPath('userData', data);
let server, win, manager;
const checks = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(predicate, description) {
  for (let i = 0; i < 80; i++) { if (await predicate()) { checks.push(description); console.log('PASS:', description); return; } await wait(75); }
  throw new Error('Timeout: ' + description);
}
app.whenReady().then(async () => {
  server = createStaticServer(path.join(__dirname, '..'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  win = new BrowserWindow({ show: true, width: 1200, height: 800, webPreferences: {
    preload: path.join(__dirname, '../desktop/browser-preload.js'), sandbox: true,
    nodeIntegration: false, contextIsolation: true, backgroundThrottling: false
  } });
  manager = createBrowserManager(win, origin, data);
  const browsing = session.fromPartition('persist:free-agent-browser');
  // Deterministic HTTPS fixtures exercise actual Chromium views, not real websites.
  browsing.protocol.handle('https', request => request.url.endsWith('/offline') ? Response.error() : new Response(`<!doctype html><title>${new URL(request.url).pathname}</title>
    <a href="https://fixture.test/next" id="next">next</a><a href="https://fixture.test/popup" target="_blank" id="popup">popup</a>
    <script>${restoreArg ? '' : "localStorage.setItem('fixture','retained');document.cookie='fixture=retained; Max-Age=3600; SameSite=Lax; Secure';"}</script>`,
    { headers: { 'content-type': 'text/html' } }));
  await win.loadURL(origin + '/index.html');
  if (restoreArg) {
    await eventually(() => manager.state().tabs.length === 1 && manager.state().tabs[0].title === '/second', 'saved tab restored in second Electron process');
    const restored = webContents.getAllWebContents().find(wc => wc.session === browsing && wc.getURL().includes('fixture.test'));
    assert.equal(await restored.executeJavaScript(`localStorage.getItem('fixture')`), 'retained');
    assert.ok((await browsing.cookies.get({ url: 'https://fixture.test/' })).some(item => item.name === 'fixture'));
    console.log('VERIFIED-RESTART: tabs, localStorage and persistent cookie restored in fresh Electron process.');
    return;
  }
  const js = source => win.webContents.executeJavaScript(source);
  const command = (name, payload = {}) => js(`window.freeAgentBrowser.invoke(${JSON.stringify(name)},${JSON.stringify(payload)})`);
  assert.equal(await js(`document.querySelector('.top-right').firstElementChild.id`), 'btnBrowser');
  checks.push('globe position');
  await js(`document.getElementById('btnBrowser').click()`);
  await command('create', { url: 'https://fixture.test/first' });
  await eventually(() => manager.state().tabs[0]?.title === '/first', 'native navigation fixture loaded');
  await eventually(() => win.contentView.children.length > 0, 'native view attached inside drawer');
  const first = manager.state().activeId;
  const external = webContents.getAllWebContents().find(wc => wc.session === browsing && wc.getURL().includes('/first'));
  assert.ok(external);
  const preferences = external.getLastWebPreferences();
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.ok(!preferences.preload);
  assert.notEqual(external.session, win.webContents.session);
  assert.equal(await external.executeJavaScript(`typeof window.freeAgentBrowser + ':' + typeof require`), 'undefined:undefined');
  checks.push('sandbox, no preload/Node/bridge, separate session');
  console.log('PASS: sandbox probe');
  const notificationPromise = external.executeJavaScript(`Notification.requestPermission()`, true);
  await eventually(() => manager.state().controls.pending.some(p => p.resources.includes('notifications')), 'notification permission is explicitly requested');
  await eventually(() => win.contentView.children.length === 0, 'native view suspended during permission prompt');
  const notificationRequest = manager.state().controls.pending.find(p => p.resources.includes('notifications'));
  await command('permission-answer', { id: notificationRequest.id, decision: 'block' });
  assert.equal(await notificationPromise, 'denied');
  assert.equal(await external.executeJavaScript(`Notification.requestPermission()`, true), 'denied');
  assert.equal(manager.state().controls.pending.length, 0);
  checks.push('notification denial is persisted without a second prompt');
  let savedDownload = '';
  browsing.once('will-download', (_, item) => {
    savedDownload = path.join(data, 'fixture-export.txt');
    item.setSavePath(savedDownload); // test only: bypass human OS picker
  });
  await external.executeJavaScript(`(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['fixture-download'],{type:'text/plain'}));a.download='fixture-export.txt';document.body.append(a);a.click();})()`, true);
  await eventually(() => manager.state().downloads.some(item => item.state === 'completed'), 'blob download completes and reports progress');
  assert.equal(fs.readFileSync(savedDownload, 'utf8'), 'fixture-download');
  await command('navigate', { value: 'https://fixture.test/offline' });
  await eventually(() => !!manager.state().tabs[0]?.error, 'network failure reported');
  await command('navigate', { value: 'https://fixture.test/first' });
  await eventually(() => manager.state().tabs[0]?.title === '/first' && !manager.state().tabs[0].loading, 'recover after network failure');
  await command('navigate', { value: 'https://fixture.test/second' });
  await eventually(() => manager.state().tabs[0]?.title === '/second' && manager.state().tabs[0]?.canGoBack && !manager.state().tabs[0]?.loading, 'navigation history');
  await command('back');
  await eventually(() => manager.state().tabs[0]?.url.endsWith('/first') && !manager.state().tabs[0]?.loading, 'back');
  await command('forward');
  await eventually(() => manager.state().tabs[0]?.url.endsWith('/second') && !manager.state().tabs[0]?.loading, 'forward');
  await command('reload');
  await eventually(() => !manager.state().tabs[0]?.loading, 'reload completed');
  await command('stop'); checks.push('reload/stop commands');
  await external.executeJavaScript(`document.getElementById('popup').click()`);
  await eventually(() => manager.state().tabs.length === 2, 'target blank creates native tab');
  const second = manager.state().activeId;
  await Promise.all(Array.from({ length: 20 }, (_, index) => command('activate', { id: index % 2 ? first : second })));
  assert.equal(manager.state().tabs.length, 2);
  assert.equal(manager.state().activeId, first);
  checks.push('20 rapid tab switches retain two tabs');
  await command('activate', { id: first });
  await js(`document.getElementById('browserCollapse').click()`);
  await eventually(() => win.contentView.children.length === 0, 'collapse detaches view');
  assert.equal(external.isDestroyed(), false); checks.push('collapse retains page');
  await js(`document.getElementById('btnBrowser').click()`);
  await eventually(() => win.contentView.children.length > 0, 'reopen reattaches view');
  const geometry = await js(`(()=>{const r=document.getElementById('browserResize').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+25),width:document.getElementById('browserDrawer').getBoundingClientRect().width};})()`);
  const dragTarget = await js(`document.elementFromPoint(${geometry.x},${geometry.y})?.id`);
  assert.equal(dragTarget, 'browserResize', 'divider must be directly reachable by the mouse');
  win.focus(); win.webContents.focus(); await wait(100);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: geometry.x, y: geometry.y });
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: geometry.x, y: geometry.y });
  await wait(60);
  win.webContents.sendInputEvent({ type: 'mouseMove', modifiers: ['leftbuttondown'], x: geometry.x - 80, y: geometry.y });
  await wait(60);
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: geometry.x - 80, y: geometry.y });
  await wait(200);
  await eventually(async () => (await js(`document.getElementById('browserDrawer').getBoundingClientRect().width`)) > geometry.width + 50, 'manual drag resizes drawer');
  await js(`document.getElementById('btnSettings').click()`);
  await eventually(() => win.contentView.children.length === 0, 'settings hide native view');
  await js(`document.getElementById('settingsModal').hidden = true`);
  await eventually(() => win.contentView.children.length > 0, 'closing settings restores view');
  await js(`document.getElementById('browserExpand').click()`);
  await wait(300);
  assert.equal(await js(`document.getElementById('browserDrawer').classList.contains('browser-expanded')`), true);
  await js(`document.getElementById('browserExpand').click()`); checks.push('expand/restore');
  win.setSize(1050, 720);
  await eventually(() => win.contentView.children.length > 0 && win.contentView.children[0].getBounds().width > 0, 'window resize native bounds');
  await assert.rejects(command('navigate', { value: 'http://127.0.0.1:47811/' }));
  await assert.rejects(command('navigate', { value: 'file:///C:/Windows/' }));
  await assert.rejects(manager.command({ sender: external, senderFrame: external.mainFrame }, 'state'));
  checks.push('private/protocol/foreign IPC rejected');
  await command('close', { id: second });
  assert.equal(manager.state().tabs.length, 1); checks.push('tab close');
  await browsing.cookies.flushStore();
  const cookies = await browsing.cookies.get({ url: 'https://fixture.test/' });
  assert.ok(cookies.some(item => item.name === 'fixture')); checks.push('persistent partition cookie');
  manager.dispose(); manager = null;
  await eventually(() => external.isDestroyed(), 'dispose closes external contents');
  const saved = JSON.parse(fs.readFileSync(path.join(data, 'browser-tabs.json'), 'utf8'));
  assert.equal(saved.urls.length, 1); checks.push('tab state written');
  manager = createBrowserManager(win, origin, data);
  await eventually(() => manager.state().tabs.length === 1 && !manager.state().tabs[0].loading, 'manager restores saved tab');
  assert.ok((await browsing.cookies.get({ url: 'https://fixture.test/' })).some(item => item.name === 'fixture'));
  checks.push('session retained across manager recreation');
  const webWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
  try {
    await webWindow.loadURL(origin + '/index.html');
    assert.equal(await webWindow.webContents.executeJavaScript(`typeof window.freeAgentBrowser`), 'undefined');
    await webWindow.webContents.executeJavaScript(`document.getElementById('btnBrowser').click()`);
    await eventually(async () => !(await webWindow.webContents.executeJavaScript(`document.getElementById('browserFallback').hidden`)), 'unavailable web service diagnostic after capability probe');
    assert.ok((await webWindow.webContents.executeJavaScript(`document.getElementById('browserFallbackLink').href`)).startsWith('https://www.google.com/'));
    checks.push('web fallback without preload');
  } finally { webWindow.destroy(); }
  if (process.env.FA_BROWSER_LIVE === '1') {
    browsing.protocol.unhandle('https');
    await command('navigate', { value: 'https://example.com/' });
    await eventually(() => manager.state().tabs[0]?.title === 'Example Domain', 'LIVE public HTTPS via pinned proxy');
  }
  const metrics = app.getAppMetrics();
  console.log('VERIFIED: ' + JSON.stringify({ electron: process.versions.electron, checks, data,
    snapshot: { processes: metrics.length, workingSetKB: metrics.reduce((sum, item) => sum + item.memory.workingSetSize, 0) } }));
}).catch(error => { console.error('FAILED:', error.stack); process.exitCode = 1; }).finally(async () => {
  if (manager) manager.dispose();
  if (win && !win.isDestroyed()) win.destroy();
  if (server) server.close();
  app.exit(process.exitCode || 0);
});
setTimeout(() => { console.error('FAILED: native integration timeout'); app.exit(1); }, 45000).unref();
