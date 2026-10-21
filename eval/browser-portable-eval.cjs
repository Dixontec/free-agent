'use strict';
const {spawn}=require('node:child_process'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
(async()=>{
 const exe=path.resolve(process.argv[2]);const profile=await fs.mkdtemp(path.join(os.tmpdir(),'fa-portable-smoke-'));
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const env={...process.env,FA_DEV_PROFILE:profile,FA_APP_PORT:String(port)};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(exe,[],{env,windowsHide:true,stdio:'ignore'});let exited=false;child.on('exit',()=>{exited=true});
 try{
  const started=Date.now();let ok=false;
  while(Date.now()-started<45000){
   if(exited)throw Error('Portable launcher exited before server startup');
   try{const response=await fetch(`http://127.0.0.1:${port}/index.html`,{signal:AbortSignal.timeout(600)});if(response.ok){assert.match(await response.text(),/browserDrawer/);ok=true;break}}catch{}
   await new Promise(r=>setTimeout(r,200));
  }
  assert.equal(ok,true,'Portable server startup');
  const report={launcher:path.basename(exe),isolatedProfile:true,serverStarted:true,elapsedMs:Date.now()-started,scope:'portable extraction/launch and packaged HTTP assets; native UI tested separately in extracted packaged executable'};
  if(process.env.FA_TEST_OUTPUT)await fs.writeFile(path.join(process.env.FA_TEST_OUTPUT,'FreeAgent-portable-tests.json'),JSON.stringify(report,null,2));
  console.log('VERIFIED: '+JSON.stringify(report));
 }finally{
  if(!exited)await new Promise(r=>{const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('exit',r);killer.on('error',r)});
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
