'use strict';
const {app,BrowserWindow,webContents,session}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),{createBrowserManager}=require('../desktop/browser-manager');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'fa-youtube-v6-'));app.setPath('userData',data);
const output=process.env.FA_TEST_OUTPUT||data,wait=ms=>new Promise(r=>setTimeout(r,ms));
const report={url:'https://www.youtube.com/watch?v=A9TikdsD5eg',source:'https://www.youtube.com/watch?v=A9TikdsD5eg',profile:'isolated; anonymous',snapshots:[],status:'incomplete',limit:'One anonymous playback cannot prove universal ad blocking. No ads skipped by the test.'};
let win,server,manager,wc;
app.whenReady().then(async()=>{
 server=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Free Agent — teste isolado YouTube</title><body style="background:#14141b;color:white">Teste isolado. Sem acesso ao perfil pessoal.</body>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 win=new BrowserWindow({show:false,width:1080,height:760,title:'Free Agent — teste YouTube (perfil separado)',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 manager=createBrowserManager(win,origin,data);await win.loadURL(origin+'/index.html');
 const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};const cmd=(name,p={})=>manager.command(event,name,p);
 await cmd('create',{url:report.url});win.showInactive();await cmd('layout',{visible:true,x:0,y:0,width:1060,height:710});win.hide();
 const s=session.fromPartition('persist:free-agent-browser');
 wc=webContents.getAllWebContents().find(w=>w.session===s);
 const js=source=>wc.executeJavaScript(source,true);
 let ready=false;
 for(let n=0;n<45;n++){
  await wait(1000);
  if(wc.isLoadingMainFrame())continue;
  const result=await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^(Reject all|Rejeitar tudo|Recusar tudo)$/i.test(b.innerText.trim()));if(b)b.click();return {video:!!document.querySelector('video'),text:document.body.innerText.slice(0,1800)}})()`);
  if(result.video){ready=true;break}
  if(/confirm.*not a bot|confirmar.*robô|Video unavailable|Vídeo indisponível/i.test(result.text)){report.status='site-limited';report.reason=result.text.slice(0,1000);return}
 }
 if(!ready){report.status='site-limited';report.reason='No video element available within 45 seconds.';return}
 await js("const v=document.querySelector('video');v.muted=true;void v.play().catch(()=>{})");
 const start=Date.now();
 while(Date.now()-start<185000){
  const sample=await js(`(()=>{const v=document.querySelector('video'),p=document.querySelector('#movie_player');return {url:location.href,title:document.title,time:v?.currentTime||0,duration:Number.isFinite(v?.duration)?v.duration:null,paused:v?.paused,ready:v?.readyState,videoError:v?.error?.code||null,playerAd:!!p?.classList.contains('ad-showing'),errorText:document.querySelector('.ytp-error-content-wrap')?.innerText?.slice(0,600)||''}})()`);
  sample.elapsedMs=Date.now()-start;report.snapshots.push(sample);console.log('YOUTUBE:',JSON.stringify(sample));
  if(sample.errorText){report.status='site-limited';report.reason=sample.errorText;break}
  if(sample.paused&&!sample.videoError)await js("void document.querySelector('video')?.play().catch(()=>{})");
  if(report.snapshots.length===1){try{fs.writeFileSync(path.join(output,'FreeAgent-V6-youtube.png'),(await wc.capturePage()).toPNG())}catch(e){report.screenshotError=e.message}}
  await wait(5000);
 }
 const first=report.snapshots[0],last=report.snapshots.at(-1);
 report.progressSeconds=last.time-first.time;report.wallSeconds=last.elapsedMs/1000;
 report.adsObserved=report.snapshots.filter(s=>s.playerAd).length;
 if(report.status!=='site-limited')report.status=report.wallSeconds>=180&&report.progressSeconds>=160?'playback-tested':'playback-incomplete';
 report.blocker=manager.state().controls.blocker;
}).catch(e=>{report.status='test-error';report.reason=e.message;console.error(e.stack);process.exitCode=1}).finally(async()=>{
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'FreeAgent-V6-youtube.json'),JSON.stringify(report,null,2));console.log('YOUTUBE_RESULT:',JSON.stringify({status:report.status,progressSeconds:report.progressSeconds,wallSeconds:report.wallSeconds,adsObserved:report.adsObserved,reason:report.reason}));
 manager?.dispose();win?.destroy();server?.close();app.exit(process.exitCode||0);
});
