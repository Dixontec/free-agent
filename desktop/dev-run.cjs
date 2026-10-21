'use strict';
// Own child processes only. Frontend uses SSE reload; backend changes restart the child.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),mode=process.argv[2]||'web';
if(!['web','electron'].includes(mode))throw Error('Use dev-run.cjs web|electron');
const env={...process.env,FA_DEV:'1',FA_APP_PORT:process.env.FA_APP_PORT||'47821',FA_BROWSER_PORT:process.env.FA_BROWSER_PORT||'47822'};
delete env.ELECTRON_RUN_AS_NODE;
if(mode==='electron')env.FA_DEV_PROFILE=path.join(process.env.LOCALAPPDATA||os.tmpdir(),'FreeAgent','development-electron');
else env.FA_BROWSER_PROFILE=path.join(process.env.LOCALAPPDATA||os.tmpdir(),'FreeAgent','development-web');
let child,restarting=false,stopping=false,timer;
function start(){
 child=spawn(mode==='electron'?require('electron'):process.execPath,[mode==='electron'?root:path.join(root,'web/start-local.cjs')],{cwd:root,env,windowsHide:mode!=='electron',stdio:['pipe','inherit','inherit']});
 child.on('error',e=>console.error('Falha de desenvolvimento:',e.message));
 child.on('exit',()=>{if(!stopping&&!restarting)console.log('Processo encerrado; altere um arquivo do backend para reiniciar.');});
 console.log(`Desenvolvimento ${mode}; frontend http://127.0.0.1:${env.FA_APP_PORT}`);
}
async function stopChild(){
 const target=child;if(!target||target.exitCode!==null)return;
 const exited=new Promise(r=>target.once('exit',r));
 if(mode==='web'){try{target.stdin.write('shutdown\n')}catch{}}else target.kill('SIGTERM');
 let done=false;exited.then(()=>{done=true});await Promise.race([exited,new Promise(r=>setTimeout(r,3500))]);
 if(!done){if(process.platform==='win32')await new Promise(r=>{const kill=spawn('taskkill',['/PID',String(target.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.once('exit',r);kill.once('error',r)});else target.kill('SIGKILL');}
}
async function restart(){if(stopping||restarting)return;restarting=true;try{await stopChild();if(!stopping)start()}finally{restarting=false}}
const watchers=['desktop','web'].map(dir=>fs.watch(path.join(root,dir),(_event,file)=>{if(!file||! /\.(js|cjs|html)$/.test(String(file)))return;clearTimeout(timer);timer=setTimeout(()=>void restart(),300)}));
async function stop(){if(stopping)return;stopping=true;clearTimeout(timer);for(const watcher of watchers)watcher.close();await stopChild();process.exit(0)}
process.on('SIGINT',stop);process.on('SIGTERM',stop);start();
