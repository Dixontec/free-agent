'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createStaticServer}=require('../desktop/server');
(async()=>{
 const vm=require('node:vm');let deliver,resolveInitial,webCalls=0;
 const window={freeAgentBrowser:{invoke:()=>new Promise(resolve=>{resolveInitial=resolve}),onState:callback=>{deliver=callback;return()=>{deliver=null}}}};
 vm.runInNewContext(await fs.readFile(path.join(__dirname,'../js/browser-adapter.js'),'utf8'),{window,fetch:()=>{webCalls++;throw Error('unexpected fallback')}});
 const adapter=await window.FreeAgentBrowserAdapters.create();assert.equal(adapter.engine,'native');
 const states=[];const unsubscribe=adapter.onState(s=>states.push(s));
 deliver({tabs:[],controls:{newest:true}});resolveInitial({tabs:[],controls:{newest:false}});await Promise.resolve();await Promise.resolve();
 assert.equal(states.length,1);assert.equal(states[0].controls.newest,true);assert.equal(webCalls,0);unsubscribe();
 console.log('VERIFIED: delayed native handshake keeps native engine and cannot overwrite a newer state event.');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fa-live-reload-'));await fs.mkdir(path.join(root,'js'));await fs.writeFile(path.join(root,'index.html'),'<body>development</body>');
 const server=createStaticServer(root,{liveReload:true,browserPort:47822});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;let request;
 try{
  assert.match(await (await fetch(base)).text(),/EventSource/);assert.equal((await(await fetch(base+'/browser-config.json')).json()).browserPort,47822);
  const message=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('SSE timeout')),4000);
   request=http.get(base+'/__dev_events',res=>{res.on('data',chunk=>{if(String(chunk).includes('data: reload')){clearTimeout(timer);resolve()}})});request.on('error',reject);
  });
  await new Promise(r=>setTimeout(r,200));await fs.writeFile(path.join(root,'js/example.js'),'// changed');await message;
  console.log('VERIFIED: development HTML injection, configured browser port and real filesystem-to-SSE reload.');
 }finally{request?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
