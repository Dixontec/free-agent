// JavaScript, eval/browser-av-eval.cjs, real Free Agent web + AV worker.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium } = require('playwright-core');
const { createStaticServer } = require('../desktop/server');
const { startBrowserService } = require('../web/browser-service.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
async function eventually(predicate, name, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await predicate()) { checks.push(name); console.log('PASS:', name); return; } await wait(100); }
  throw new Error('Timeout: ' + name);
}
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode', 'fa-av-eval-'));
  const server = createStaticServer(path.join(__dirname, '..'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let probeRequests = 0;
  const probe = http.createServer((_, res) => { probeRequests++; res.end('private'); });
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  let service, browser, page;
  const options = { port: 0, origins: [origin], profileDir: profile, fixtureDirectory: path.join(__dirname, 'av-fixtures') };
  try {
    service = await startBrowserService(options);
    browser = await chromium.launch({ channel: 'chrome', headless: process.env.FA_TEST_HEADED !== '1', chromiumSandbox: true });
    const deviceScaleFactor = Number(process.env.FA_TEST_SCALE || 1);
    if (![1, 1.25, 1.5, 2].includes(deviceScaleFactor)) throw Error('Invalid FA_TEST_SCALE.');
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor, acceptDownloads: true });
    await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await context.addInitScript(({ browserPort }) => {
      // Test-only address routing permits isolation without stopping a user's service.
      const originalFetch=window.fetch.bind(window);
      window.fetch=(url,init)=>originalFetch(typeof url==='string'?url.replace('http://127.0.0.1:47812/',`http://127.0.0.1:${browserPort}/`):url,init);
      const WS=window.WebSocket;
      window.__avRpcErrors=[];window.__avMouse=[];
      window.WebSocket=class extends WS{
        constructor(url,protocols){super(String(url).replace('ws://127.0.0.1:47812/',`ws://127.0.0.1:${browserPort}/`),protocols);this.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.error)window.__avRpcErrors.push(m.error)}catch{}})}
        send(data){try{const m=JSON.parse(data);if(m.command==='input'&&m.payload.kind==='mouse')window.__avMouse.push(m.payload)}catch{}return super.send(data)}
      };
      const Original = window.RTCPeerConnection;
      window.__avPeers = [];
      window.RTCPeerConnection = class extends Original { constructor(...args) { super(...args); window.__avPeers.push(this); } };
      localStorage.setItem('nexus:bg', JSON.stringify({ mode: 'matrix-center', blur: 4 }));
      localStorage.setItem('free-agent-browser-volume','0.2');
    }, { browserPort: service.port });
    page = await context.newPage();
    const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('browserDiagnostic').textContent.length > 0);
    await page.locator('#btnBrowser').click();
    const privateProbe = `http://127.0.0.1:${probe.address().port}/probe`;
    await page.locator('#browserAddress').fill('https://fixture.test/?probe=' + encodeURIComponent(privateProbe));
    await page.locator('#browserAddress').press('Enter');
    const video = page.locator('.browser-web-video');
    const current = () => service.state().tabs.find(t => t.id === service.state().activeId);
    await eventually(() => current()?.title === 'AV demo ready', 'source fixture is a real browser page');
    await eventually(async () => await video.evaluate(v => v.readyState >= 2 && v.videoWidth > 0), 'WebRTC video reaches unchanged production drawer');
    async function remoteClick(x, y) {
      const viewport = service.state().viewport;
      const point = await video.evaluate((v, p) => {
        const r = v.getBoundingClientRect(), scale = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
        return { x: (r.width - v.videoWidth * scale) / 2 + p.x / p.viewport.width * v.videoWidth * scale,
          y: (r.height - v.videoHeight * scale) / 2 + p.y / p.viewport.height * v.videoHeight * scale };
      }, { x, y, viewport });
      const rect = await video.boundingBox();
      await page.mouse.click(rect.x + point.x, rect.y + point.y);
    }
    const interactionStarted = Date.now();
    await remoteClick(48, 32);
    await eventually(() => current()?.title === 'AV demo playing', 'controlled VP8/Opus video player starts through real remote click');
    const interactionLatencyMs = Date.now() - interactionStarted;
    await page.locator('#browserAudio').click();
    await eventually(async () => !(await video.evaluate(v => v.muted)), 'user gesture enables received tab audio');
    assert.equal(await page.locator('#browserVolume').count(),0);
    assert.equal(await video.evaluate(v=>v.volume),1);
    checks.push('receiver remains at full volume without redundant slider');
    await page.evaluate(() => {
      const v=document.querySelector('.browser-web-video'), ac=new AudioContext(), analyser=ac.createAnalyser();
      analyser.fftSize=1024; ac.createMediaStreamSource(v.srcObject).connect(analyser);
      window.__avMeasure={ac,analyser};
    });
    // Gesture resumes the analysis context as well; no autoplay policy disabled.
    await page.locator('#browserAudio').click(); await page.locator('#browserAudio').click();
    await page.evaluate(() => window.__avMeasure.ac.resume());
    await wait(2000); // allow the live encoder/congestion controller to settle
    const usage=[];
    await service.metrics();
    const sampler = setInterval(() => { void service.metrics().then(sample => usage.push(sample)).catch(() => {}); }, 750);
    let measurement;
    try {
      measurement = await page.evaluate(async () => {
        const video=document.querySelector('.browser-web-video'), pc=window.__avPeers.findLast(p=>p.connectionState==='connected');
        if(!pc)throw Error('Missing connected RTC peer');
        const {analyser}=window.__avMeasure, values=new Float32Array(analyser.fftSize), pixels=document.createElement('canvas');pixels.width=pixels.height=1;
        const ctx=pixels.getContext('2d',{willReadFrequently:true}), audioEdges=[],videoEdges=[];
        let running=true,frames=0,firstPresented=null,lastPresented=null,lastAudio=false,lastVideo=false,lastPixel=-Infinity,rmsMax=0;
        const before=await pc.getStats(), start=performance.now();
        function vf(now,metadata){if(!running)return;frames++;if(firstPresented===null)firstPresented=metadata.presentedFrames-1;lastPresented=metadata.presentedFrames;if(now-lastPixel>85){lastPixel=now;ctx.drawImage(video,video.videoWidth*.5,video.videoHeight*.583,2,2,0,0,1,1);const p=ctx.getImageData(0,0,1,1).data,on=p[0]>180&&p[1]>180&&p[2]>180;if(on&&!lastVideo)videoEdges.push(now);lastVideo=on}video.requestVideoFrameCallback(vf)}video.requestVideoFrameCallback(vf);
        function af(){if(!running)return;analyser.getFloatTimeDomainData(values);let sum=0;for(const v of values)sum+=v*v;const rms=Math.sqrt(sum/values.length),on=rms>.003;rmsMax=Math.max(rmsMax,rms);if(on&&!lastAudio)audioEdges.push(performance.now());lastAudio=on;requestAnimationFrame(af)}af();
        await new Promise(r=>setTimeout(r,4500));running=false;const duration=performance.now()-start,after=await pc.getStats();
        const sum=(stats,kind,key)=>{let n=0;stats.forEach(s=>{if(s.type==='inbound-rtp'&&s.kind===kind)n+=s[key]||0});return n};
        const sync=videoEdges.map(t=>audioEdges.map(a=>a-t).sort((a,b)=>Math.abs(a)-Math.abs(b))[0]).filter(n=>Number.isFinite(n)&&Math.abs(n)<250);
        return {durationMs:duration,width:video.videoWidth,height:video.videoHeight,displayFrames:Math.max(0,(lastPresented??0)-(firstPresented??0)),displayFps:Math.max(0,(lastPresented??0)-(firstPresented??0))*1000/duration,callbackCount:frames,callbackFps:frames*1000/duration,presentationMethod:'delta of requestVideoFrameCallback metadata.presentedFrames; callbacks counted separately',
          decodedFrames:sum(after,'video','framesDecoded')-sum(before,'video','framesDecoded'),
          audioSamples:sum(after,'audio','totalSamplesReceived')-sum(before,'audio','totalSamplesReceived'),
          audioEnergy:sum(after,'audio','totalAudioEnergy')-sum(before,'audio','totalAudioEnergy'),rmsMax,
          sync:{pairs:sync.length,audioMinusVideoMeanMs:sync.length?sync.reduce((a,b)=>a+b,0)/sync.length:null,method:'nearest 500ms decoded pulse edges; approximate, pixel sampling at most every85ms'}};
      });
    } finally { clearInterval(sampler); }
    // Check the performance floor after functional scenarios so a slow host
    // does not prevent authorization/security regressions from being exercised.
    assert.ok(measurement.displayFrames > 1 && measurement.decodedFrames > 1, JSON.stringify(measurement));
    assert.ok(measurement.audioSamples > 0 && measurement.audioEnergy > 0 && measurement.rmsMax > .003, JSON.stringify(measurement));
    console.log('MEASURED:',JSON.stringify(measurement));
    checks.push('continuous video and decoded audio in full Free Agent UI');
    await remoteClick(165,32); await page.keyboard.type('V3'); await page.keyboard.insertText(' á');
    await eventually(() => current()?.title === 'typed:V3 á', 'Unicode keyboard interaction survives audiovisual streaming');
    await remoteClick(285,32);
    await eventually(() => current()?.title === 'SW private blocked', 'Service Worker registered and private network fetch denied');
    assert.equal(probeRequests,0);
    await remoteClick(365,32);
    await eventually(() => service.state().downloads.some(d=>d.state==='awaiting-authorization'), 'download awaits explicit user authorization');
    const record=service.state().downloads.find(d=>d.state==='awaiting-authorization');
    assert.equal((await fetch(`http://127.0.0.1:${service.port}/download/${record.id}`,{headers:{Origin:origin}})).status,401);
    await wait(800); // small buffered downloads must still require authorization
    assert.equal(service.state().downloads.find(d=>d.id===record.id)?.state,'awaiting-authorization');
    assert.equal((await fetch(`http://127.0.0.1:${service.port}/download/${record.id}`,{headers:{Origin:origin,Authorization:`Bearer ${service.token}`}})).status,404);
    await page.getByRole('button',{name:'Permitir',exact:true}).click();
    await eventually(()=>service.state().downloads.some(d=>d.id===record.id&&d.state==='completed'),'approved download completes in controlled staging');
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Salvar',exact:true}).click();
    const file=await downloaded;assert.match(await fs.readFile(await file.path(),'utf8'),/Free Agent authorized/);
    checks.push('authorized file saved through real web UI; unauthenticated read denied');
    await page.locator('#browserExpand').click();
    await eventually(async()=>service.state().viewport.width>1000&&await video.evaluate(v=>v.readyState>=2&&!v.paused),'expand resizes the live media');
    await page.locator('#browserExpand').click();
    const musicTabId=current().id;
    async function audioContinues(label) {
      const result=await page.evaluate(async()=>{
        const pc=window.__avPeers.findLast(p=>p.connectionState==='connected'),v=document.querySelector('.browser-web-video');
        const energy=stats=>{let n=0;stats.forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='audio')n+=s.totalAudioEnergy||0});return n};
        const before=energy(await pc.getStats());await new Promise(r=>setTimeout(r,1300));
        return {energy:energy(await pc.getStats())-before,muted:v.muted,paused:v.paused};
      });
      assert.ok(result.energy>0&&!result.muted&&!result.paused,label+': '+JSON.stringify(result));checks.push(label);
    }
    await page.locator('#browserCreate').click();
    await eventually(()=>service.state().tabs.length===2&&service.state().tabs.find(t=>t.id===service.state().activeId)?.url==='about:blank','new tab opens without resetting audio');
    assert.equal(service.state().audioTabId,musicTabId);await audioContinues('decoded audio continues on new blank tab');
    await page.locator('#browserAddress').fill('https://fixture.test/second.html');await page.locator('#browserAddress').press('Enter');
    await eventually(()=>current()?.title==='Second AV tab'&&service.state().videoTabId===current().id,'video capture switches to another site');
    assert.equal(service.state().audioTabId,musicTabId);await audioContinues('original tab audio continues while viewing another site');
    await page.locator('#browserCollapse').click();await wait(400);
    const metricsHidden=await service.metrics();
    assert.ok(metricsHidden[0]?.capture?.streaming);await audioContinues('collapse preserves authorized background audio');
    if(process.env.FA_TEST_HEADED==='1') {
      const cdp=await context.newCDPSession(page),{windowId}=await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}});
      await eventually(async()=> (await cdp.send('Browser.getWindowBounds',{windowId})).bounds.windowState==='minimized','outer Chrome window reports minimized');
      await audioContinues('decoded audio continues with Windows Chrome minimized');
      await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});await page.bringToFront();await cdp.detach();
    }
    const otherPage=await context.newPage();await otherPage.goto('about:blank');await otherPage.bringToFront();
    await audioContinues('audio continues while another outer browser tab is foreground');await otherPage.close();await page.bringToFront();
    await page.locator('#btnBrowser').click();await eventually(async()=>await video.evaluate(v=>v.readyState>=2&&!v.paused),'reopen retains audiovisual session');
    await page.getByRole('tab').first().click();await eventually(()=>service.state().activeId===musicTabId,'return to original audio tab');
    await page.getByRole('tab').nth(1).click();await page.locator('#browserSelectAudio').click();
    await eventually(()=>service.state().audioTabId===current().id,'explicit audio source switches to selected tab');
    await page.getByRole('tab').first().click();await page.locator('#browserSelectAudio').click();
    await eventually(()=>service.state().audioTabId===musicTabId,'explicit audio source restored');await audioContinues('audio replacement resumes original music without duplicate peer');
    await page.locator('#browserAudio').click();await page.locator('#browserCollapse').click();await wait(500);
    assert.ok(!(await service.metrics())[0]?.capture?.streaming);checks.push('muting then collapsing stops capture');
    await page.locator('#btnBrowser').click();await eventually(()=>video.evaluate(v=>v.readyState>=2),'muted session reopens');assert.equal(await video.evaluate(v=>v.muted),true);
    await page.locator('#browserAddress').fill('https://fixture.test/sw-proof');await page.locator('#browserAddress').press('Enter');
    await eventually(()=>current()?.title==='SW cache persisted','Service Worker cached navigation works');
    assert.deepEqual(pageErrors,[]);
    const report={checks,scale:deviceScaleFactor,measurement,interactionLatencyMs,latencyMethod:'pointer dispatch to source title confirmation,100ms polling; includes automation overhead; not glass-to-glass',performanceFloorMet:measurement.displayFps>=20,resources:{samples:usage.length,scope:'AV Electron worker processes; excludes receiving Chrome, working sets may share pages',capture:usage.at(-1)?.[0]?.capture?.video,
      meanCpuPercentSum:usage.length?usage.reduce((a,s)=>a+s.reduce((b,m)=>b+(m.cpu?.percentCPUUsage||0),0),0)/usage.length:null,
      peakWorkingSetMiB:usage.length?Math.max(...usage.map(s=>s.reduce((a,m)=>a+(m.memory?.workingSetSize||0),0)/1024)):null},profile};
    console.log('FUNCTIONAL_RESULTS: '+JSON.stringify(report));
    if(process.env.FA_TEST_OUTPUT)await fs.writeFile(path.join(process.env.FA_TEST_OUTPUT,`FreeAgent-V6-av-${deviceScaleFactor}${process.env.FA_TEST_HEADED==='1'?'-headed':''}.json`),JSON.stringify(report,null,2));
    assert.ok(report.performanceFloorMet, 'Functional checks passed, but measured presentation was below the 20fps test floor: '+measurement.displayFps);
    console.log('VERIFIED: '+JSON.stringify(report));
  }catch(error){console.error('AV-DIAGNOSTIC',JSON.stringify({state:service?.state(),debug:service?.debugState(),capture:service?(await service.metrics().catch(()=>[]))[0]?.capture:null,ui:page?await page.evaluate(()=>({error:document.querySelector('#browserError')?.textContent,overlay:document.querySelector('.browser-web-overlay')?.textContent,video:{ready:document.querySelector('.browser-web-video')?.readyState,paused:document.querySelector('.browser-web-video')?.paused},rpcErrors:window.__avRpcErrors,peers:window.__avPeers?.map(p=>p.connectionState)})).catch(()=>null):null}));throw error;}
  finally{await browser?.close();await service?.close();await new Promise(r=>{server.closeAllConnections();server.close(r)});await new Promise(r=>probe.close(r));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
