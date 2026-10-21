'use strict';
const assert = require('node:assert/strict'), fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright-core'),{createStaticServer}=require('../desktop/server'),{startBrowserService}=require('../web/browser-service.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const output=process.env.FA_TEST_OUTPUT;
const report={checks:[],scales:[],cycles:0};
async function until(fn,label,timeout=25000){const t=Date.now();while(Date.now()-t<timeout){if(await fn()){console.log('PASS:',label);report.checks.push(label);return}await wait(100)}throw Error('Timeout: '+label)}
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'fa-workspace-'));
 const server=createStaticServer(path.join(__dirname,'..'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 let service,browser,context,page;const pageErrors=[];
 try{
  service=await startBrowserService({port:0,origins:[origin],profileDir:profile,fixtureDirectory:path.join(__dirname,'av-fixtures')});
  browser=await chromium.launch({channel:'chrome',headless:true});
  async function open(scale){
   await context?.close();await wait(150);
   context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:scale});
   await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
   await context.addInitScript(({port})=>{
    const f=window.fetch.bind(window);window.fetch=(url,init)=>f(typeof url==='string'?url.replace('http://127.0.0.1:47812/',`http://127.0.0.1:${port}/`):url,init);
    const WS=window.WebSocket;let socket,seq=0;const pending=new Map();
    window.__testRpc=(command,payload={})=>new Promise((resolve,reject)=>{const id='test-'+ ++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('RPC timeout '+command))},18000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,command,payload}))});
    window.WebSocket=class extends WS{constructor(url,protocols){super(String(url).replace('ws://127.0.0.1:47812/',`ws://127.0.0.1:${port}/`),protocols);socket=this;this.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.result)}})}};
   },{port:service.port});
   page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>{pageErrors.push(e.message);console.error('PAGE ERROR',e.message)});
   await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.FreeAgentBrowser&&window.FreeAgentBrowser.state().connected);
   await page.locator('#btnBrowser').click();
  }
  const rpc=(cmd,p={})=>page.evaluate(([cmd,p])=>window.__testRpc(cmd,p),[cmd,p]);
  for(const scale of [1,1.25,1.5,2]){
   await open(scale);
   if(!service.state().activeId)await rpc('create',{url:'https://fixture.test/workspace.html'});
   await until(()=>service.state().tabs.some(t=>t.title==='Browser workspace fixture'),'fixture loaded '+scale);
   await until(()=>page.locator('.browser-web-video').evaluate(v=>v.readyState>=2&&v.videoWidth>0),'media ready '+scale);
   await wait(500);
   const sample=await page.locator('.browser-web-video').evaluate(v=>{const r=v.getBoundingClientRect();return {dpr:devicePixelRatio,sourceWidth:v.videoWidth,sourceHeight:v.videoHeight,cssWidth:r.width,cssHeight:r.height}});
   const vp=service.state().viewport;sample.logical=vp;
   assert.ok(sample.sourceWidth >= (vp.width*scale)-12,JSON.stringify(sample));
   assert.ok(sample.sourceHeight >= (vp.height*scale)-12,JSON.stringify(sample));report.scales.push(sample);
   await rpc('permission-set',{origin:'https://fixture.test',resource:'ai',decision:'always'});
   const observation=await page.evaluate(()=>window.FreeAgentBrowser.observe());assert.ok(observation.text.includes('Uma página real'));
   const input=observation.elements.find(e=>e.name==='Nome');assert.ok(input);
   const fill=await page.evaluate(p=>window.FreeAgentBrowser.action(p),{observation:observation.observation,action:'fill',element:input.id,text:'João — escala '+scale});assert.equal(fill.verified,true);
   const button=fill.observation.elements.find(e=>e.name==='Confirmar');assert.ok(button);
   const clicked=await page.evaluate(p=>window.FreeAgentBrowser.action(p),{observation:fill.observation.observation,action:'click',element:button.id,expectedText:'Confirmado: João — escala '+scale});assert.equal(clicked.verified,true);
   assert.ok(clicked.observation.text.includes('Confirmado: João'));
   async function remoteClick(bounds){
    await until(()=>page.locator('.browser-web-video').evaluate(v=>v.readyState>=2&&v.videoWidth>0),'manual surface ready '+scale);
    const vp=service.state().viewport;
    const point=await page.locator('.browser-web-video').evaluate((v,p)=>{const r=v.getBoundingClientRect(),scale=Math.min(r.width/v.videoWidth,r.height/v.videoHeight);return {x:r.x+(r.width-v.videoWidth*scale)/2+p.x/p.vp.width*v.videoWidth*scale,y:r.y+(r.height-v.videoHeight*scale)/2+p.y/p.vp.height*v.videoHeight*scale}},{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,vp});
    assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y),JSON.stringify({point,bounds,vp}));await page.mouse.click(point.x,point.y);
   }
   const inputBounds=clicked.observation.elements.find(e=>e.name==='Nome').bounds;
   await remoteClick(inputBounds);await page.keyboard.press('Control+A');await page.keyboard.type('Manual '+scale);
   await remoteClick(clicked.observation.elements.find(e=>e.name==='Confirmar').bounds);
   await until(async()=>{const obs=await page.evaluate(()=>window.FreeAgentBrowser.observe());return obs.text.includes('Confirmado: Manual '+scale)},'manual pointer/keyboard alignment '+scale);
   await assert.rejects(()=>rpc('agent-action',{observation:observation.observation,action:'click',element:button.id}),/observa|página/i);
   await rpc('navigate',{value:'https://fixture.test/workspace.html'});
   if(output){await fs.mkdir(output,{recursive:true});await until(()=>page.locator('.browser-web-video').evaluate(v=>v.readyState>=2&&!!v.srcObject),'screenshot ready '+scale);await wait(200);await page.screenshot({path:path.join(output,`FreeAgent-web-${scale*100}.png`)});}
  }
  console.log('PASS: physical pixels and verified input at 100/125/150/200%');
  // Use one receiver/profile for the reconnect soak; no user processes are touched.
  await open(1);
  await until(()=>page.locator('.browser-web-video').evaluate(v=>v.readyState>=2),'soak initial frame');
  for(let i=0;i<20;i++){
   await page.locator('#browserCollapse').click();await wait(270);
   assert.equal((await service.metrics())[0]?.capture?.streaming,false);
   await page.locator('#btnBrowser').click();
   await until(()=>page.locator('.browser-web-video').evaluate(v=>v.readyState>=2&&!!v.srcObject),'reconnect '+(i+1));
   if(i%5===0){await page.locator('#browserMediaRetry').click();await until(()=>page.locator('.browser-web-video').evaluate(v=>v.readyState>=2),'manual retry '+(i+1));}
   report.cycles++;
  }
  await rpc('permission-set',{origin:'https://fixture.test',resource:'ai',decision:'block'});
  await assert.rejects(()=>page.evaluate(()=>window.FreeAgentBrowser.observe()),/Autorize/);
  assert.equal(service.state().controls.pending.length,0);
  report.checks.push('AI revocation blocks observation without a new prompt');
  await until(()=>page.locator('.browser-web-video').evaluate(v=>v.readyState>=2&&v.videoWidth>0),'selection surface ready');
  const sourceRect=await page.locator('.browser-web-video').boundingBox();
  await page.mouse.click(sourceRect.x+60,sourceRect.y+65);await page.keyboard.press('Control+A');
  await page.locator('#browserSelection').click();
  await until(()=>page.locator('#input').inputValue().then(v=>v.includes('Citação de página')),'selection attached to current chat');
  assert.match(await page.locator('#input').inputValue(),/Citação de página/);assert.match(await page.locator('#input').inputValue(),/Texto nítido/);
  report.checks.push('real text selection attached to current chat for review');
  // Start page and shortcut editor exercise production controls.
  await rpc('create');await until(()=>page.locator('#browserEmpty').isVisible(),'new tab home');
  for(let i=0;i<5;i++){
   await page.getByRole('button',{name:'Adicionar atalho',exact:true}).click();
   await page.locator('#browserShortcutDialog input').nth(0).fill('Atalho '+i);
   await page.locator('#browserShortcutDialog input').nth(1).fill('fixture.test/workspace.html');
   await page.locator('#browserShortcutDialog').getByRole('button',{name:'Salvar',exact:true}).click();
   await until(()=>page.locator('#browserShortcutDialog').isVisible().then(v=>!v),'shortcut saved '+(i+1));
   await until(()=>page.locator('.browser-shortcut-main').count().then(n=>n===Math.min(i+2,5)),'shortcut '+(i+1));
  }
  assert.equal(await page.getByRole('button',{name:'Adicionar atalho',exact:true}).count(),0);
  await page.reload();await page.waitForFunction(()=>window.FreeAgentBrowser);
  await page.locator('#btnBrowser').click();assert.equal(await page.locator('.browser-shortcut-main').count(),5);
  await page.getByRole('button',{name:'Atalho 0',exact:true}).click();await until(()=>service.state().tabs.find(t=>t.id===service.state().activeId)?.url==='https://fixture.test/workspace.html','shortcut click opens site');
  for(const [value,url]of [['yt','https://www.google.com/search?q=yt'],['YouTube','https://www.google.com/search?q=YouTube'],['como editar vídeos','https://www.google.com/search?q=como%20editar%20v%C3%ADdeos'],['youtube.com','https://youtube.com/']])assert.equal((await rpc('normalize',{value})).url,url);
  report.checks.push('five persistent shortcuts, one add button, search/domain separation');
  assert.deepEqual(pageErrors,[],'frontend must not have unhandled JavaScript errors');
  if(output)await fs.writeFile(path.join(output,'FreeAgent-workspace-tests.json'),JSON.stringify(report,null,2));
  console.log('VERIFIED:',JSON.stringify(report));
 }catch(e){console.error('STATE',JSON.stringify(service?.state()));throw e}
 finally{await browser?.close();await service?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
