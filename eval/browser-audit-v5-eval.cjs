'use strict';
const {app,BrowserWindow,session,webContents}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createStaticServer}=require('../desktop/server');
const {createBrowserManager}=require('../desktop/browser-manager');
const assets=require('../desktop/browser-filter-assets');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'fa-audit-v5-'));app.setPath('userData',data);
const checks=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,name){for(let n=0;n<120;n++){if(await fn()){checks.push(name);console.log('PASS:',name);return}await wait(70)}throw Error('Timeout: '+name)}
let win,server,manager;
app.whenReady().then(async()=>{
 // Add controlled rules only to this temporary profile. The shipped bundle is untouched.
 const bundle=structuredClone(assets.load(data)),rules=bundle.files.find(f=>f.name==='ublock-origin/filters.txt');
 rules.text+='\nfixture.test##+js(set, fixtureAdFlag, false)\nfixture.test##.fixture-ad\n';
 rules.sha256=crypto.createHash('sha256').update(rules.text).digest('hex');assets.save(data,bundle);
 server=createStaticServer(path.join(__dirname,'..'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 win=new BrowserWindow({show:true,width:1200,height:800,webPreferences:{preload:path.join(__dirname,'../desktop/browser-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',event=>{if(event.level==='error')console.log('HOST ERROR:',event.message)});
 manager=createBrowserManager(win,origin,data);
 const s=session.fromPartition('persist:free-agent-browser');
 s.protocol.handle('https',()=>new Response(`<!doctype html><title>Audit V5 fixture</title>
 <style>body{margin:0;background:#15212f;color:white;font:22px sans-serif}video{display:block;width:80vw;height:60vh;background:#000}button,input{font:20px sans-serif}</style>
 <script>window.fixtureAdFlag=true;window.inlineFlag=window.fixtureAdFlag;</script>
 <video id="video" controls></video><button id="full" onclick="document.querySelector('video').requestFullscreen()">Fullscreen</button><input id="text"><div class="fixture-ad">advertisement</div>
 <script>setTimeout(()=>{const e=document.createElement('div');e.className='fixture-ad';e.id='dynamic-ad';document.body.append(e)},100)</script>`,{headers:{'content-type':'text/html','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"}}));
 await win.loadURL(origin);
 const host=source=>win.webContents.executeJavaScript(source,true);
 const cmd=(name,p={})=>host(`window.freeAgentBrowser.invoke(${JSON.stringify(name)},${JSON.stringify(p)})`);
 await host("document.querySelector('#btnBrowser').click()");await cmd('create',{url:'https://fixture.test/video'});
 await until(()=>manager.state().tabs[0]?.title==='Audit V5 fixture','fixture loaded');
 const wc=webContents.getAllWebContents().find(w=>w.session===s&&w.getURL().includes('fixture.test'));
 wc.on('console-message',event=>console.log('PAGE:',event.message));
 const js=source=>wc.executeJavaScript(source,true);
 const initial=await js('({inline:window.inlineFlag,flag:window.fixtureAdFlag,node:typeof require,bridge:typeof freeAgentBrowser})');console.log('SCRIPTLET PROBE:',JSON.stringify(initial),manager.state().controls.blocker);
 assert.equal(initial.inline,false,'trusted upstream scriptlet runs before page inline script even with CSP');assert.equal(initial.node,'undefined');assert.equal(initial.bridge,'undefined');
 checks.push('document-start scriptlet under restrictive CSP; no internal bridge/Node');
 await until(()=>js("!!document.querySelector('#dynamic-ad') && getComputedStyle(document.querySelector('#dynamic-ad')).display==='none'"),'dynamic cosmetics applied');
 const reload=()=>wc.loadURL('https://fixture.test/video');
 await cmd('blocker-set',{enabled:false});await reload();await until(()=>js('window.inlineFlag===true'),'global disable removes scriptlet after reload');
 await cmd('blocker-set',{enabled:true});await cmd('blocker-set',{origin:'https://fixture.test',enabled:false});await reload();await until(()=>js('window.inlineFlag===true'),'site exception removes scriptlet after reload');
 await cmd('blocker-set',{origin:'https://fixture.test',enabled:true});await reload();await until(()=>js('window.inlineFlag===false'),'reenable restores early scriptlet');
 win.show(); win.focus();
 console.log('CHILDREN:',win.contentView.children.length,win.isVisible(),win.isMinimized());
 console.log('LAYOUT PROBE:',await host(`JSON.stringify({body:document.body.className,rect:document.querySelector('#browserViewport').getBoundingClientRect(),dialogs:[...document.querySelectorAll('dialog[open]')].map(e=>e.id),state:window.FreeAgentBrowser?.state()})`));
 await until(()=>win.contentView.children.length===1,'view attached before fullscreen');
 let detachments=0;const originalRemove=win.contentView.removeChildView.bind(win.contentView);win.contentView.removeChildView=view=>{detachments++;return originalRemove(view)};
 const normal=win.getBounds();
 await js("document.querySelector('#full').click()");
 await until(()=>manager.state().presentation.active&&win.isFullScreen(),'player button enters native fullscreen');
 await until(async()=>{const b=win.contentView.children[0]?.getBounds();const [w,h]=win.getContentSize();return b?.x===0&&b?.y===0&&b?.width===w&&b?.height===h&&await host("getComputedStyle(document.querySelector('#topbar')).display==='none'")},'video covers full window and hides all app chrome');
 const settledDetachments=detachments;await wait(1500);assert.equal(detachments,settledDetachments,'fullscreen does not repeatedly detach native surface');checks.push('fullscreen surface remains attached without flicker');
 wc.sendInputEvent({type:'keyDown',modifiers:[],keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',modifiers:[],keyCode:'Escape'});
 await until(()=>!manager.state().presentation.active&&!win.isFullScreen(),'Escape restores native window');
 await until(()=>win.getBounds().width===normal.width&&win.getBounds().height===normal.height,'previous window dimensions restored');
 for(let i=0;i<3;i++){
  wc.sendInputEvent({type:'keyDown',modifiers:[],keyCode:'F11'});wc.sendInputEvent({type:'keyUp',modifiers:[],keyCode:'F11'});
  await until(()=>manager.state().presentation.active&&win.isFullScreen(),'F11 enter '+i);
  wc.sendInputEvent({type:'keyDown',modifiers:[],keyCode:i===1?'Escape':'F11'});wc.sendInputEvent({type:'keyUp',modifiers:[],keyCode:i===1?'Escape':'F11'});
  await until(()=>!manager.state().presentation.active&&!win.isFullScreen(),'F11/Escape restore '+i);
 }
 await js("document.querySelector('#text').focus()");wc.sendInputEvent({type:'keyDown',modifiers:[],keyCode:'F'});wc.sendInputEvent({type:'keyUp',modifiers:[],keyCode:'F'});await wait(150);assert.equal(manager.state().presentation.active,false);checks.push('F does not fullscreen while typing');
 await js("document.activeElement.blur();window.fEvents=[];window.addEventListener('keydown',e=>fEvents.push({key:e.key,prevented:e.defaultPrevented,active:navigator.userActivation.isActive}),true)");win.show();win.focus();wc.focus();await wait(150);
 wc.sendInputEvent({type:'mouseDown',x:20,y:450,button:'left',clickCount:1});wc.sendInputEvent({type:'mouseUp',x:20,y:450,button:'left',clickCount:1});await wait(150);
 wc.sendInputEvent({type:'keyDown',modifiers:[],keyCode:'f'});wc.sendInputEvent({type:'char',modifiers:[],keyCode:'f'});wc.sendInputEvent({type:'keyUp',modifiers:[],keyCode:'f'});
 await wait(200);console.log('F PROBE:',await js('({events:fEvents,full:document.fullscreenElement?.id,focus:document.hasFocus(),activeElement:document.activeElement?.outerHTML.slice(0,150),lastF:window[Symbol.for("free-agent.browser.last-f")],rect:document.querySelector("video").getBoundingClientRect().toJSON()})'));
 await until(()=>manager.state().presentation.active,'F fallback fullscreens generic visible video');
 await cmd('fullscreen',{enabled:false});await until(()=>!manager.state().presentation.active,'fullscreen command restores layout');
 if(process.env.FA_TEST_OUTPUT){fs.mkdirSync(process.env.FA_TEST_OUTPUT,{recursive:true});fs.writeFileSync(path.join(process.env.FA_TEST_OUTPUT,'FreeAgent-V5-native.json'),JSON.stringify({checks,electron:process.versions.electron,profile:data},null,2));fs.writeFileSync(path.join(process.env.FA_TEST_OUTPUT,'FreeAgent-V5-native.png'),(await win.webContents.capturePage()).toPNG())}
 console.log('VERIFIED:',JSON.stringify({checks,electron:process.versions.electron}));
}).catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>{manager?.dispose();win?.destroy();server?.close();app.exit(process.exitCode||0)});
