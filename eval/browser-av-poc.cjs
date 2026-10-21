// FA002V3: isolated audiovisual feasibility proof; never a production transport.
'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!process.versions.electron) {
  (async () => {
    const parent = path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode');
    await fs.access(parent);
    const profile = await fs.mkdtemp(path.join(parent, 'fa002v3-av-'));
    const env = { ...process.env, FA_AV_PROFILE: profile };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = require('node:child_process').spawn(require('electron'), [__filename], {
      env, stdio: 'inherit', windowsHide: true
    });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(signal ? 1 : code));
    });
    try { await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
    catch (error) { console.error('Temporary profile cleanup:', error.message); }
    process.exitCode = code ?? 1;
  })().catch(error => { console.error('BLOCKER:', error.stack); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, session } = require('electron');
  const { chromium } = require('playwright-core');
  const { createStaticServer } = require('../desktop/server');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.setPath('userData', process.env.FA_AV_PROFILE);
  let remote, sender, browser, server, remoteSession;
  let stage = 'startup';
  const fixture = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#173b83;color:white}input,button{position:absolute;left:20px;width:180px;height:36px;box-sizing:border-box}input{top:80px}button{top:130px}canvas{position:absolute;top:200px}
    </style><input id="text"><button id="toggle">Toggle</button><canvas id="c" width="640" height="160"></canvas>
    <script>
    window.changed=false;toggle.onclick=()=>{window.changed=!window.changed;document.body.style.background=window.changed?'rgb(20,180,60)':'#173b83'};
    const pulse=document.createElement('div');pulse.style='position:absolute;left:0;top:0;width:64px;height:64px;background:black';document.body.append(pulse);
    window.startTone=async()=>{window.ac=new AudioContext();await ac.resume();const osc=ac.createOscillator(),gain=ac.createGain();osc.frequency.value=660;gain.gain.value=0;osc.connect(gain).connect(ac.destination);osc.start();
    window.osc=osc;window.gain=gain;window.epoch=ac.currentTime+0.15;
    for(let i=0;i<120;i++){const t=epoch+i*.6;gain.gain.setValueAtTime(.035,t);gain.gain.setValueAtTime(0,t+.15)};return {state:ac.state,sampleRate:ac.sampleRate}};
    window.animationFrames=0;let prev=-1;function frame(){const t=performance.now(),n=Math.floor(t/ (1000/30));if(n!==prev){prev=n;window.animationFrames++;const x=c.getContext('2d');x.fillStyle='#112233';x.fillRect(0,0,640,160);x.fillStyle='orange';x.fillRect((n*7)%600,20,40,100);x.fillStyle='white';x.fillText(String(n),10,145);const phase=window.ac?ac.currentTime-window.epoch:-1;pulse.style.background=phase>=0&&phase%.6<.15?'white':'black'}requestAnimationFrame(frame)}requestAnimationFrame(frame);
    </script>`;
  const watchdog = setTimeout(() => { console.error('BLOCKER: watchdog timeout at', stage); app.exit(1); }, 80000);
  app.on('window-all-closed', () => {});
  async function cleanup() {
    if (browser) {
      for (const context of browser.contexts()) for (const page of context.pages()) {
        await page.evaluate(async () => { window.poc?.pc.close(); window.poc?.stream.getTracks().forEach(t => t.stop()); await window.poc?.ac.close(); }).catch(() => {});
      }
      await browser.close().catch(() => {});
    }
    if (sender && !sender.isDestroyed()) await sender.webContents.executeJavaScript('window.pc?.close();window.stream?.getTracks().forEach(t=>t.stop())').catch(() => {});
    if (remote && !remote.isDestroyed()) await remote.webContents.executeJavaScript('window.osc?.stop();window.ac?.close()').catch(() => {});
    for (const win of [sender, remote]) if (win && !win.isDestroyed()) win.destroy();
    if (remoteSession) remoteSession.protocol.unhandle('https');
    if (server) await new Promise(resolve => server.close(resolve));
    clearTimeout(watchdog);
  }
  app.whenReady().then(async () => {
    try {
      assert.equal(process.platform, 'win32', 'This proof targets Windows');
      stage = 'sandboxed hidden normal fixture';
      remoteSession = session.fromPartition('fa-av-remote');
      remoteSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      remoteSession.setPermissionCheckHandler(() => false);
      await remoteSession.protocol.handle('https', request => new Response(
        request.url === 'https://av-fixture.test/' ? fixture : 'Not found',
        { status: request.url === 'https://av-fixture.test/' ? 200 : 404, headers: { 'content-type': 'text/html' } }
      ));
      const senderSession = session.fromPartition('fa-av-sender');
      const prefs = { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false };
      remote = new BrowserWindow({ show: false, useContentSize: true, width: 640, height: 400, webPreferences: { ...prefs, session: remoteSession } });
      sender = new BrowserWindow({ show: false, webPreferences: { ...prefs, session: senderSession } });
      let captureRequests = 0;
      senderSession.setPermissionCheckHandler((wc, permission) => { console.log('SENDER-PERMISSION-CHECK', permission); return wc === sender?.webContents && ['display-capture', 'media'].includes(permission); });
      senderSession.setPermissionRequestHandler((wc, permission, callback) => { console.log('SENDER-PERMISSION-REQUEST', permission); callback(wc === sender?.webContents && ['display-capture', 'media'].includes(permission)); });
      senderSession.setDisplayMediaRequestHandler((request, callback) => {
        captureRequests++;
        console.log('CAPTURE-REQUEST', JSON.stringify({ same: request.frame === sender.webContents.mainFrame, video: request.videoRequested, audio: request.audioRequested }));
        if (request.frame !== sender.webContents.mainFrame || !request.videoRequested || !request.audioRequested) return callback({});
        callback({ video: remote.webContents.mainFrame, audio: remote.webContents.mainFrame, enableLocalEcho: false });
      });
      await remote.loadURL('https://av-fixture.test/');
      await sender.loadFile(path.join(__dirname, 'browser-av-sender.html'));
      console.log('SOURCE', JSON.stringify(await remote.webContents.executeJavaScript('startTone()', true)));
      stage = 'WebFrameMain getDisplayMedia video+audio';
      const offer = await sender.webContents.executeJavaScript(`(async()=>{
        try { window.stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:640,max:640},height:{ideal:400,max:400},frameRate:{ideal:30,max:30}},audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}); }
        catch(e) { return {failure:{name:e.name,message:e.message,stack:e.stack}}; }
        window.pc=new RTCPeerConnection({iceServers:[]});
        for(const t of stream.getTracks()){
          if(t.kind==='video')t.contentHint='motion';
          const s=pc.addTrack(t,stream);
          if(t.kind==='video'){
            const p=s.getParameters();p.encodings=p.encodings?.length?p.encodings:[{}];p.encodings[0].maxFramerate=30;p.encodings[0].maxBitrate=2000000;await s.setParameters(p);
            const tr=pc.getTransceivers().find(tr=>tr.sender===s),codecs=RTCRtpSender.getCapabilities('video').codecs;
            tr.setCodecPreferences([...codecs.filter(c=>c.mimeType==='video/VP8'),...codecs.filter(c=>c.mimeType!=='video/VP8')]);
          }
        }
        window.senderStats=async()=>{const out={time:performance.now(),framesEncoded:0,framesSent:0,totalEncodeTime:0};(await pc.getStats()).forEach(s=>{if(s.type==='outbound-rtp'&&s.kind==='video'){for(const k of ['framesEncoded','framesSent','totalEncodeTime'])out[k]+=s[k]||0;out.qualityLimitationReason=s.qualityLimitationReason;out.frameWidth=s.frameWidth;out.frameHeight=s.frameHeight;out.framesPerSecond=s.framesPerSecond}if(s.type==='media-source'&&s.kind==='video')out.source={frames:s.frames,framesPerSecond:s.framesPerSecond,width:s.width,height:s.height};if(s.type==='codec'&&s.mimeType==='video/VP8')out.vp8Available=true});return out};
        await pc.setLocalDescription(await pc.createOffer());
        if(pc.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('sender ICE timeout')),10000);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);resolve()}})});
        return {description:pc.localDescription.toJSON(),tracks:stream.getTracks().map(t=>({kind:t.kind,state:t.readyState,settings:t.getSettings()}))};
      })()`, true);
      console.log('CAPTURE', JSON.stringify({ captureRequests, tracks: offer.tracks?.map(t => ({ kind: t.kind, state: t.state, frameRate: t.settings.frameRate, width:t.settings.width,height:t.settings.height,sampleRate: t.settings.sampleRate,echoCancellation:t.settings.echoCancellation,noiseSuppression:t.settings.noiseSuppression,autoGainControl:t.settings.autoGainControl })), failure: offer.failure }));
      assert.ok(!offer.failure, JSON.stringify(offer.failure));
      assert.deepEqual(offer.tracks.map(t => t.kind).sort(), ['audio', 'video']);
      stage = 'conventional sandboxed Chrome receiver';
      server = createStaticServer(path.join(__dirname, '..'));
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const headless = process.env.FA_AV_HEADED !== '1';
      browser = await chromium.launch({ channel: 'chrome', headless, chromiumSandbox: true });
      const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
      await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
      await page.bringToFront();
      const answer = await page.evaluate(async description => {
        const viewport = document.querySelector('#browserViewport');
        if (!viewport) throw Error('Missing production #browserViewport');
        for(let p=viewport;p;p=p.parentElement){
          if(p.parentElement)for(const sibling of p.parentElement.children)if(sibling!==p&&!['SCRIPT','STYLE','LINK','HEAD'].includes(sibling.tagName))sibling.style.setProperty('display','none','important');
          p.hidden=false;p.inert=false;for(const [k,v] of Object.entries({display:'block',visibility:'visible',transform:'none',opacity:'1',filter:'none','backdrop-filter':'none','box-shadow':'none',animation:'none',transition:'none',contain:'none','content-visibility':'visible'}))p.style.setProperty(k,v,'important');
        }
        viewport.style.cssText+=';position:fixed;inset:60px 0 0 0;z-index:2147483646;background:black';
        const video = document.createElement('video');video.style='width:640px;height:400px;object-fit:fill';video.playsInline=true;viewport.append(video);
        const button=document.createElement('button');button.textContent='Authorize proof audio';button.id='av-proof-play';button.style='position:fixed;top:0;left:0;z-index:2147483647';document.body.append(button);
        const pc=new RTCPeerConnection({iceServers:[]}),stream=new MediaStream();video.srcObject=stream;
        const ac=new AudioContext(),analyser=ac.createAnalyser();analyser.fftSize=1024;
        pc.ontrack=e=>{stream.addTrack(e.track);if(e.track.kind==='audio')ac.createMediaStreamSource(new MediaStream([e.track])).connect(analyser)};
        button.onclick=async()=>{await ac.resume();await video.play();button.dataset.started='true'};
        window.poc={pc,stream,video,ac,analyser};
        await pc.setRemoteDescription(description);await pc.setLocalDescription(await pc.createAnswer());
        if(pc.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('receiver ICE timeout')),10000);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);resolve()}})});
        return pc.localDescription.toJSON();
      }, offer.description);
      await sender.webContents.executeJavaScript(`pc.setRemoteDescription(${JSON.stringify(answer)})`);
      await page.locator('#av-proof-play').click();
      await page.waitForFunction(() => document.querySelector('#av-proof-play').dataset.started === 'true');
      await page.waitForFunction(() => window.poc.video.readyState >= 2);
      stage = 'native mouse/keyboard and decoded color proof';
      remote.webContents.sendInputEvent({ type: 'mouseDown', x: 70, y: 95, button: 'left', clickCount: 1 });
      remote.webContents.sendInputEvent({ type: 'mouseUp', x: 70, y: 95, button: 'left', clickCount: 1 });
      for (const key of 'FA002V3') {
        remote.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
        remote.webContents.sendInputEvent({ type: 'char', keyCode: key });
        remote.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
      }
      remote.webContents.sendInputEvent({ type: 'mouseDown', x: 70, y: 145, button: 'left', clickCount: 1 });
      remote.webContents.sendInputEvent({ type: 'mouseUp', x: 70, y: 145, button: 'left', clickCount: 1 });
      await delay(300);
      const input = await remote.webContents.executeJavaScript('({text:text.value,changed:window.changed,background:getComputedStyle(document.body).backgroundColor})');
      assert.equal(input.text, 'FA002V3');assert.equal(input.changed, true);
      await page.waitForFunction(() => { const c=document.createElement('canvas');c.width=640;c.height=400;const x=c.getContext('2d');x.drawImage(poc.video,0,0,640,400);const p=x.getImageData(600,100,1,1).data;return p[1]>120&&p[0]<70&&p[2]<100 });
      stage = 'four second audiovisual measurement';
      await delay(1500);
      const sourceBefore = await remote.webContents.executeJavaScript('({time:performance.now(),frames:animationFrames,width:innerWidth,height:innerHeight})');
      const senderBefore = await sender.webContents.executeJavaScript('senderStats()');
      const metricSamples = [];
      const sample = () => metricSamples.push({ time: Date.now(), processes: app.getAppMetrics().map(m => ({ pid:m.pid,type:m.type,cpuPercent:m.cpu.percentCPUUsage,workingSetKiB:m.memory.workingSetSize,privateKiB:m.memory.privateBytes })) });
      sample();const timer=setInterval(sample,500);
      let measured;
      try { measured = await page.evaluate(async () => {
        const {pc,video,ac,analyser}=poc,c=document.createElement('canvas');c.width=1;c.height=1;const x=c.getContext('2d',{willReadFrequently:true});
        async function stats(){const out={energy:0,samples:0,framesDecoded:0,framesReceived:0,framesDropped:0,totalDecodeTime:0,jitterBufferDelay:0,jitterBufferEmittedCount:0};(await pc.getStats()).forEach(s=>{if(s.type==='inbound-rtp'&&(s.kind==='audio'||s.mediaType==='audio')){out.energy+=s.totalAudioEnergy||0;out.samples+=s.totalSamplesReceived||0}if(s.type==='inbound-rtp'&&s.kind==='video'){for(const k of ['framesDecoded','framesReceived','framesDropped','totalDecodeTime','jitterBufferDelay','jitterBufferEmittedCount'])out[k]+=s[k]||0;out.decoderImplementation=s.decoderImplementation;out.frameWidth=s.frameWidth;out.frameHeight=s.frameHeight}});return out}
        const before=await stats(),start=performance.now(),frames=[],audio=[],vEdges=[],aEdges=[],readbackMs=[],values=new Float32Array(analyser.fftSize);let active=true,vOn=false,aOn=false,lastReadback=-Infinity;
        function vf(now,m){if(!active)return;video.requestVideoFrameCallback(vf);frames.push({time:now,late:Math.max(0,now-m.expectedDisplayTime),mediaTime:m.mediaTime,presented:m.presentedFrames});if(now-lastReadback<65)return;lastReadback=now;const t=performance.now();x.drawImage(video,20,20,1,1,0,0,1,1);const p=x.getImageData(0,0,1,1).data;readbackMs.push(performance.now()-t);const on=p[0]>180&&p[1]>180&&p[2]>180;if(on&&!vOn)vEdges.push(now);vOn=on;}
        video.requestVideoFrameCallback(vf);
        function af(){if(!active)return;analyser.getFloatTimeDomainData(values);const rms=Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length),t=performance.now();audio.push({time:t,rms});const on=rms>.003;if(on&&!aOn)aEdges.push(t);aOn=on;requestAnimationFrame(af)}af();
        await new Promise(r=>setTimeout(r,4000));active=false;const durationMs=performance.now()-start,after=await stats();
        poc.measurementDiagnostics={pixelReadbackSamples:readbackMs.length,pixelReadbackMeanMs:readbackMs.reduce((s,v)=>s+v,0)/Math.max(1,readbackMs.length),pixelReadbackMaxMs:Math.max(0,...readbackMs),maxCallbackGapMs:Math.max(0,...frames.slice(1).map((f,i)=>f.time-frames[i].time)),measurementPresentation:'test-only ancestor effects removed and siblings hidden; not production UI performance',pulseSampling:'at most once per 65ms; periodic nearest-edge heuristic, not calibrated end-to-end AV latency'};
        const offsets=vEdges.map(t=>aEdges.map(a=>a-t).sort((a,b)=>Math.abs(a)-Math.abs(b))[0]).filter(t=>Number.isFinite(t)&&Math.abs(t)<250);
        return {durationMs,frames:frames.length,uniqueMediaTimes:new Set(frames.map(f=>f.mediaTime)).size,fps:frames.length*1000/durationMs,windowFps:[0,1,2,3].map(i=>frames.filter(f=>f.time-start>=i*1000&&f.time-start<(i+1)*1000).length),meanLateMs:frames.reduce((s,f)=>s+f.late,0)/Math.max(1,frames.length),totalAudioEnergyDelta:after.energy-before.energy,audioSamplesReceivedDelta:after.samples-before.samples,framesDecodedDelta:after.framesDecoded-before.framesDecoded,receiverStats:{before,after},visibility:document.visibilityState,hasFocus:document.hasFocus(),presentedFramesSpan:frames.length?frames.at(-1).presented-frames[0].presented+1:0,rmsSamples:audio.length,rmsMax:Math.max(...audio.map(a=>a.rms)),rmsMean:audio.reduce((s,a)=>s+a.rms,0)/audio.length,audioContextState:ac.state,audioContextSampleRate:ac.sampleRate,videoPulseEdges:vEdges.length,audioPulseEdges:aEdges.length,avSync:offsets.length>=3?{method:'nearest rising edge, decoded white pixel vs analyser RMS; main-thread polling, not hardware latency',pairs:offsets.length,audioMinusVideoMeanMs:offsets.reduce((s,v)=>s+v,0)/offsets.length,offsetsMs:offsets}:{measurable:false,reason:'Insufficient matched decoded pulse edges'}};
      }); } finally { clearInterval(timer);sample(); }
      measured.diagnostics = await page.evaluate(() => poc.measurementDiagnostics);
      const sourceAfter = await remote.webContents.executeJavaScript('({time:performance.now(),frames:animationFrames})');
      const senderAfter = await sender.webContents.executeJavaScript('senderStats()');
      const pipeline = {sourceBefore,sourceAfter,sourceAnimationFps:(sourceAfter.frames-sourceBefore.frames)*1000/(sourceAfter.time-sourceBefore.time),senderBefore,senderAfter,encodedFps:(senderAfter.framesEncoded-senderBefore.framesEncoded)*1000/(senderAfter.time-senderBefore.time),decodedFps:measured.framesDecodedDelta*1000/measured.durationMs};
      const usage = { scope:'Electron app.getAppMetrics only; excludes host Chrome; working sets may double-count shared memory',samples:metricSamples.length,meanCpuPercentSum:metricSamples.reduce((s,m)=>s+m.processes.reduce((n,p)=>n+p.cpuPercent,0),0)/metricSamples.length,peakWorkingSetSumMiB:Math.max(...metricSamples.map(m=>m.processes.reduce((s,p)=>s+p.workingSetKiB,0)/1024)) };
      console.log('MEASURED',JSON.stringify({electron:process.versions.electron,chrome:browser.version(),headless,input,...measured,pipeline,usage}));
      assert.ok(measured.fps>=20&&measured.uniqueMediaTimes>=80,'Continuous video below 20fps');
      assert.ok(measured.windowFps.every(fps=>fps>=20),'Video below 20fps in a one-second window');
      assert.ok(measured.totalAudioEnergyDelta>0&&measured.audioSamplesReceivedDelta>0&&measured.rmsMax>.003,'Actual decoded audio not observed');
      assert.ok(measured.avSync.pairs>=3,'AV pulse sync not measurable');
      await cleanup();
      console.log('VERIFIED:',JSON.stringify({check:'actual hidden normal WebFrameMain AV to sandboxed Chrome in Free Agent viewport + native input',fps:measured.fps,windowFps:measured.windowFps,audioSamplesReceivedDelta:measured.audioSamplesReceivedDelta,avSync:measured.avSync}));
      app.exit(0);
    } catch(error) {
      console.error('BLOCKER:',stage,error.stack);
      await cleanup().catch(e=>console.error('Cleanup:',e.message));app.exit(1);
    }
  }).catch(error=>{console.error('BLOCKER:',error.stack);app.exit(1)});
}
