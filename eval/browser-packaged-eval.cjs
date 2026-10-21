'use strict';
// Drive the trusted BrowserWindow explicitly: restored WebContentsView guests
// may appear first in Playwright's target inventory and have no preload.
const {_electron}=require('playwright-core');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
(async()=>{
 const exe=path.resolve(process.argv[2]);const profile=await fs.mkdtemp(path.join(os.tmpdir(),'fa-packaged-'));
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const origin=`http://127.0.0.1:${port}`;const env={...process.env,FA_DEV_PROFILE:profile,FA_APP_PORT:String(port)};delete env.ELECTRON_RUN_AS_NODE;
 let app;
 const js=source=>app.evaluate(({BrowserWindow},[origin,source])=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith(origin));if(!w)throw Error('Host not ready');return w.webContents.executeJavaScript(source,true)},[origin,source]);
 const invoke=(cmd,p={})=>js(`window.freeAgentBrowser.invoke(${JSON.stringify(cmd)},${JSON.stringify(p)})`);
 async function until(source,label){const deadline=Date.now()+15000;while(Date.now()<deadline){try{if(await js(source))return}catch{}await new Promise(r=>setTimeout(r,60))}throw Error('Timeout: '+label)}
 async function launch(){app=await _electron.launch({executablePath:exe,env,args:process.env.FA_TEST_SCALE?['--force-device-scale-factor='+process.env.FA_TEST_SCALE]:[],timeout:45000});await until('!!window.FreeAgentBrowser?.state().controls?.blocker?.available','packaged main window and blocker')}
 try{
  await launch();assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
  const versions=await app.evaluate(()=>process.versions);const scale=await js('devicePixelRatio');if(process.env.FA_TEST_SCALE)assert.ok(Math.abs(scale-Number(process.env.FA_TEST_SCALE))<.02);
  await js('document.querySelector("#btnBrowser").click()');await invoke('create');await until('document.querySelector("#browserEmpty").hidden===false','native home');
  if(process.env.FA_TEST_OUTPUT){const png=await app.evaluate(async({BrowserWindow},origin)=>(await BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith(origin)).capturePage()).toPNG().toString('base64'),origin);await fs.writeFile(path.join(process.env.FA_TEST_OUTPUT,`FreeAgent-Electron-home${process.env.FA_TEST_SCALE?'-'+process.env.FA_TEST_SCALE:''}.png`),Buffer.from(png,'base64'))}
  await app.evaluate(({session})=>session.fromPartition('persist:free-agent-browser').protocol.handle('https',request=>new Response(request.url.includes('doubleclick')?'window.adLoaded=true;':'<!doctype html><title>Packaged browser OK</title><label>Nome <input aria-label="Nome"></label><button onclick="document.querySelector(\'p\').textContent=\'Confirmado\'">Confirmar</button><p></p><script src="https://googleads.g.doubleclick.net/pagead/id"></script>',{headers:{'content-type':request.url.includes('doubleclick')?'text/javascript':'text/html'}})));
  await invoke('navigate',{value:'https://fixture.test/'});await until('window.FreeAgentBrowser.state().tabs.some(t=>t.title==="Packaged browser OK")','packaged external page');
  await invoke('permission-set',{origin:'https://fixture.test',resource:'ai',decision:'always'});
  let o=await js('window.FreeAgentBrowser.observe()');
  let r=await invoke('agent-action',{observation:o.observation,action:'fill',element:o.elements.find(e=>e.name==='Nome').id,text:'Teste empacotado'});assert.equal(r.verified,true);o=r.observation;
  r=await invoke('agent-action',{observation:o.observation,action:'click',element:o.elements.find(e=>e.name==='Confirmar').id,expectedText:'Confirmado'});assert.equal(r.verified,true);
  const isolated=await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL()==='https://fixture.test/').executeJavaScript('({node:typeof require,bridge:typeof freeAgentBrowser,ad:window.adLoaded===true})'));
  assert.deepEqual(isolated,{node:'undefined',bridge:'undefined',ad:false});assert.equal((await fetch(origin+'/index.html')).status,200);
  assert.equal(await js('document.querySelector("#browserVolume")===null'),true);
  await invoke('fullscreen',{enabled:true});await until('document.body.classList.contains("browser-immersive")','packaged fullscreen');
  assert.equal(await app.evaluate(({BrowserWindow},origin)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith(origin)).isFullScreen(),origin),true);
  await invoke('fullscreen',{enabled:false});await until('!document.body.classList.contains("browser-immersive")','packaged fullscreen restored');
  await invoke('blocker-set',{enabled:false});await app.close();app=null;await launch();
  const remembered=await js('window.FreeAgentBrowser.state().controls');assert.equal(remembered.blocker.enabled,false);assert.equal(remembered.permissions['https://fixture.test'].ai,'always');
  const report={packaged:true,scale,exe:path.basename(exe),versions:{electron:versions.electron,chrome:versions.chrome,node:versions.node},checks:['isolated packaged process and trusted host window','native home and tabs','bundled blocker blocks actual request','observed fill and verified click','external page has no Node or internal bridge','blocker and AI choices survive independent packaged process restart']};
  if(process.env.FA_TEST_OUTPUT)await fs.writeFile(path.join(process.env.FA_TEST_OUTPUT,`FreeAgent-packaged-tests${process.env.FA_TEST_SCALE?'-'+process.env.FA_TEST_SCALE:''}.json`),JSON.stringify(report,null,2));console.log('VERIFIED: '+JSON.stringify(report));
 }finally{await app?.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
