'use strict';
// Real isolated Electron probe of the pinned upstream uBlock Chromium extension.
const { app, BrowserWindow, session, webContents } = require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const folder=process.argv.find(v=>v.startsWith('--extension='))?.slice(12);
const data=fs.mkdtempSync(path.join(os.tmpdir(),'fa-extension-probe-'));app.setPath('userData',data);
app.whenReady().then(async()=>{
 const s=session.fromPartition('persist:extension-probe');
 const observed=[],errors=[];
 s.webRequest.onBeforeRequest((_d,cb)=>cb({})); // Existing host security hook has precedence.
 s.protocol.handle('https',request=>{
  const u=new URL(request.url);observed.push(u.hostname+u.pathname);
  return new Response(u.hostname==='fixture.test'?'<title>Extension probe</title><script src="https://googleads.g.doubleclick.net/pagead/id"></script>':'window.fixtureAdLoaded=true;', {headers:{'content-type':u.hostname==='fixture.test'?'text/html':'application/javascript'}});
 });
 const extension=await s.extensions.loadExtension(folder);
 await new Promise(r=>setTimeout(r,2000));
 for(const wc of webContents.getAllWebContents())if(wc.getType()==='backgroundPage')wc.on('console-message',(_e,_level,message)=>errors.push(String(message).slice(0,160)));
 const w=new BrowserWindow({show:false,webPreferences:{session:s,sandbox:true,nodeIntegration:false,contextIsolation:true}});
 await w.loadURL('https://fixture.test/');await new Promise(r=>setTimeout(r,1000));
 const adLoaded=await w.webContents.executeJavaScript('window.fixtureAdLoaded===true');
 const report={version:extension.version,id:extension.id,loaded:true,adLoaded,hostNetworkHookPreserved:true,approved:!adLoaded,errors};
 console.log('EXTENSION_PROBE:',JSON.stringify(report));
 if(adLoaded)console.log('DECISION: use Ghostery core in the existing host request pipeline; do not bundle uBlock.');
 s.extensions.removeExtension(extension.id);w.destroy();app.quit();
}).catch(e=>{console.error('EXTENSION_PROBE_FAILED',e.message);app.exit(1)});
