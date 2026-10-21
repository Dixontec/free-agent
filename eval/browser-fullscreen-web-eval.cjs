'use strict';
const {chromium}=require('playwright-core');
const {createStaticServer}=require('../desktop/server');
const {startBrowserService}=require('../web/browser-service.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
async function until(fn,name){const end=Date.now()+25000;while(Date.now()<end){if(await fn()){checks.push(name);console.log('PASS:',name);return}await wait(100)}throw Error('Timeout: '+name)}
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'fa-fullscreen-web-'));
 const server=createStaticServer(path.join(__dirname,'..'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 let service,browser,page;
 try{
  service=await startBrowserService({port:0,origins:[origin],profileDir:profile,fixtureDirectory:path.join(__dirname,'av-fixtures')});
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  await context.addInitScript(({port})=>{
   const f=window.fetch.bind(window);window.fetch=(url,init)=>f(typeof url==='string'?url.replace('http://127.0.0.1:47812/',`http://127.0.0.1:${port}/`):url,init);
   const WS=window.WebSocket;window.WebSocket=class extends WS{constructor(url,p){super(String(url).replace('ws://127.0.0.1:47812/',`ws://127.0.0.1:${port}/`),p)}};
   localStorage.setItem('nexus:bg',JSON.stringify({mode:'matrix-center',blur:4}));
  },{port:service.port});
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.FreeAgentBrowser?.state().connected);
  await page.locator('#btnBrowser').click();await page.locator('#browserAddress').fill('https://fixture.test/fullscreen.html');await page.locator('#browserAddress').press('Enter');
  await until(()=>service.state().tabs.some(t=>t.title==='Fullscreen fixture'),'web source loaded');
  const video=page.locator('.browser-web-video');await until(()=>video.evaluate(v=>v.readyState>=2),'web video ready');
  const matrix=await page.evaluate(()=>({active:window.__matrixBg?.active,running:window.__matrixBg?.running}));assert.equal(matrix.running,true);checks.push('Matrix continues in actual browser workspace');
  await page.locator('#browserFullscreen').click();
  await until(()=>page.evaluate(()=>!!document.fullscreenElement&&document.body.classList.contains('browser-immersive')),'web fullscreen button enters outer fullscreen');
  assert.equal(await page.locator('#topbar').isVisible(),false);assert.equal(await page.locator('.browser-heading').isVisible(),false);
  await page.keyboard.press('Escape');await until(()=>page.evaluate(()=>!document.body.classList.contains('browser-immersive')),'web Escape restores app chrome');
  await page.locator('#browserAddress').click();
  await page.keyboard.press('F11');await until(()=>page.evaluate(()=>document.body.classList.contains('browser-immersive')),'web F11 enters');
  await page.keyboard.press('F11');await until(()=>page.evaluate(()=>!document.body.classList.contains('browser-immersive')),'web F11 restores');
  await wait(600);
  const click=await video.evaluate((v,vp)=>{const r=v.getBoundingClientRect(),scale=Math.min(r.width/v.videoWidth,r.height/v.videoHeight);return{x:r.x+(r.width-v.videoWidth*scale)/2+60/vp.width*v.videoWidth*scale,y:r.y+(r.height-v.videoHeight*scale)/2+40/vp.height*v.videoHeight*scale}},service.state().viewport);
  await page.mouse.click(click.x,click.y);
  await until(()=>service.state().presentation?.active,'source player button enters HTML fullscreen');
  await until(()=>page.evaluate(()=>document.body.classList.contains('browser-immersive')),'source fullscreen expands web workspace');
  await page.keyboard.press('Escape');await until(()=>!service.state().presentation?.active,'web Escape exits source fullscreen');
  assert.deepEqual(errors,[]);
  if(process.env.FA_TEST_OUTPUT){await fs.writeFile(path.join(process.env.FA_TEST_OUTPUT,'FreeAgent-V5-web.json'),JSON.stringify({checks,matrix},null,2));await page.screenshot({path:path.join(process.env.FA_TEST_OUTPUT,'FreeAgent-V5-web.png')})}
  console.log('VERIFIED:',JSON.stringify({checks,matrix}));
 }finally{await browser?.close();await service?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
