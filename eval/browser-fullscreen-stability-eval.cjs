'use strict';
// Match the production host preferences: a fully covering WebContentsView can
// occlude the host renderer on Windows. Observe actual attachment stability.
const {app,BrowserWindow,session,webContents,ipcMain}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createStaticServer}=require('../desktop/server');
const {createBrowserManager}=require('../desktop/browser-manager');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'fa-fullscreen-stability-')));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let n=0;n<100;n++){if(await fn())return;await wait(70)}throw Error('Timeout: '+label)}
let win,server,manager;const report={cycles:[],layouts:[],visibility:[]};
app.whenReady().then(async()=>{
 server=createStaticServer(path.join(__dirname,'..'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 win=new BrowserWindow({show:true,width:1440,height:920,webPreferences:{preload:path.join(__dirname,'../desktop/browser-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const handle=ipcMain.handle.bind(ipcMain);
 ipcMain.handle=(channel,listener)=>handle(channel,async(event,command,payload)=>{if(command==='layout')report.layouts.push({visible:payload.visible,at:Date.now()});return listener(event,command,payload)});
 manager=createBrowserManager(win,origin,app.getPath('userData'));
 ipcMain.handle=handle;
 const s=session.fromPartition('persist:free-agent-browser');
 s.protocol.handle('https',()=>new Response('<!doctype html><title>Fullscreen stability fixture</title><body style="background:#214;color:white;font:24px sans-serif">Stable native browser surface<video controls style="width:70vw;height:60vh"></video>',{headers:{'content-type':'text/html'}}));
 await win.loadURL(origin);
 win.show();win.focus();
 const host=source=>win.webContents.executeJavaScript(source,true);
 await host("document.querySelector('#btnBrowser').click();window.__visibility=[];document.addEventListener('visibilitychange',()=>__visibility.push({state:document.visibilityState,at:Date.now()}))");
 await host("window.freeAgentBrowser.invoke('create',{url:'https://fixture.test/fullscreen'})");
 await until(()=>win.contentView.children.length===1,'native view attached');
 await until(()=>manager.state().tabs.some(t=>t.title==='Fullscreen stability fixture'),'fixture loaded');
 const wc=webContents.getAllWebContents().find(w=>w.session===s&&w.getURL().includes('fixture.test'));
 let detachments=0;const remove=win.contentView.removeChildView.bind(win.contentView);win.contentView.removeChildView=v=>{detachments++;return remove(v)};
 const key=k=>{wc.sendInputEvent({type:'keyDown',keyCode:k});wc.sendInputEvent({type:'keyUp',keyCode:k})};
 for(let i=0;i<3;i++){
  if(i===0)await host("document.querySelector('#browserFullscreen').click()");else key('F11');
  await until(()=>manager.state().presentation.active&&win.isFullScreen(),'enter fullscreen');
  await wait(800);const before=detachments;
  // Reproduce the Windows occlusion notification independently of the machine's
  // window stacking. The source view is still visible, covering its host.
  await host("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))");
  await wait(400);
  await host("delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))");
  await wait(2100);
  const cycle={index:i,detachments:detachments-before,attached:win.contentView.children.length,fullscreen:win.isFullScreen()};report.cycles.push(cycle);
  console.log('CYCLE:',JSON.stringify(cycle));
  assert.equal(cycle.detachments,0,'settled fullscreen must not detach/reparent the native page');
  assert.equal(cycle.attached,1,'native surface stays present');
  key(i===1?'F11':'Escape');await until(()=>!manager.state().presentation.active&&!win.isFullScreen(),'restore window');
  await until(()=>win.contentView.children.length===1,'restored surface');await wait(200);
 }
 win.minimize();await until(()=>win.contentView.children.length===0,'minimized window releases native surface');
 win.restore();win.show();win.focus();await until(()=>win.contentView.children.length===1,'restoring window reattaches surface');
 console.log('PASS: minimize and restore still manage the native surface');
 report.visibility=await host('window.__visibility');
 console.log('VERIFIED: fullscreen button, F11 and Escape remain stable across three sustained cycles');
}).catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{
 if(win&&!win.isDestroyed())report.visibility=await win.webContents.executeJavaScript('window.__visibility || []').catch(()=>[]);
 console.log('REPORT:',JSON.stringify(report));
 if(process.env.FA_TEST_REPORT)fs.writeFileSync(process.env.FA_TEST_REPORT,JSON.stringify(report,null,2));
 manager?.dispose();win?.destroy();server?.close();app.exit(process.exitCode||0);
});
