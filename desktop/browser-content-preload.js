'use strict';
// Runs only in owned browser sessions, in Electron's isolated preload world.
// No IPC object, host API or Node capability is exposed to page scripts.
const {ipcRenderer,contextBridge,webFrame}=require('electron');
if (/^https?:$/.test(location.protocol)) {
  // Native player shortcuts remain in charge. Supply F only when the page did
  // not handle it, never while typing into an editable element.
  contextBridge.executeInMainWorld({func:()=>{
    window.addEventListener('keydown',event=>{
      if(event.__freeAgentNativeRecovery)return;
      if(event.key.toLowerCase()!=='f'||event.ctrlKey||event.altKey||event.metaKey||event.repeat)return;
      // A harmless delivery marker lets the native host recover a key dropped
      // by Chromium after an HTML/native fullscreen transition. No API exposed.
      if(event.isTrusted) window[Symbol.for('free-agent.browser.last-f')] = Date.now();
      const editable=node=>node?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
      if(editable(event.target)||editable(document.activeElement))return;
      const before=document.fullscreenElement;
      setTimeout(()=>{
        if(document.fullscreenElement!==before)return;
        // Chromium's native video controls may consume F even when their own
        // fullscreen command is unavailable. Other site handlers keep priority.
        if(event.defaultPrevented&&document.activeElement?.tagName!=='VIDEO'){
          if(event.isTrusted)window[Symbol.for('free-agent.browser.handled-f')]=Date.now();
          return;
        }
        if(before){void document.exitFullscreen().catch(()=>{});return}
        const videos=[...document.querySelectorAll('video')].map(v=>({v,r:v.getBoundingClientRect()})).filter(({r})=>r.width>80&&r.height>50&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth).sort((a,b)=>(!a.v.paused?-1:0)-(!b.v.paused?-1:0)||b.r.width*b.r.height-a.r.width*a.r.height);
        const video=videos[0]?.v;if(!video)return;
        const player=video.closest('#movie_player,.html5-video-player')||video;
        void player.requestFullscreen().catch(()=>{});
      },0);
    },true);
  }});
  const seen=new Set();let enabled=false;
  function apply(rules){
    enabled=rules?.active===true;if(!enabled)return;
    if(rules.styles&&!seen.has(rules.styles)){seen.add(rules.styles);webFrame.insertCSS(rules.styles,{cssOrigin:'user'});}
    for(const source of rules.scripts||[])if(!seen.has(source)){
      seen.add(source);
      // The function is generated only from verified upstream filter resources.
      // It executes in the ordinary page world, with no preload bindings.
      try{contextBridge.executeInMainWorld({func:new Function(source)})}catch{}
    }
  }
  try{apply(ipcRenderer.sendSync('fa-browser:adblock-rules'))}catch{}
  let timer;const classes=new Set(),ids=new Set(),hrefs=new Set();
  function collect(node){if(node.nodeType!==1)return;for(const c of [...node.classList].slice(0,12))if(c.length<=100)classes.add(c);if(node.id?.length<=100)ids.add(node.id);const href=node.getAttribute('href');if(href&&href.length<=300)hrefs.add(href);}
  const observer=new MutationObserver(records=>{
    if(!enabled)return;
    for(const record of records){collect(record.target);for(const node of [...record.addedNodes].slice(0,40)){collect(node);if(node.querySelectorAll)for(const child of [...node.querySelectorAll('[class],[id],[href]')].slice(0,60))collect(child)}}
    if(timer||!(classes.size||ids.size||hrefs.size))return;
    timer=setTimeout(()=>{timer=null;const payload={classes:[...classes].slice(0,150),ids:[...ids].slice(0,150),hrefs:[...hrefs].slice(0,100)};classes.clear();ids.clear();hrefs.clear();ipcRenderer.invoke('fa-browser:adblock-dom',payload).then(apply).catch(()=>{})},250);
  });
  observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','id','href']});
  addEventListener('pagehide',()=>{clearTimeout(timer);observer.disconnect()},{once:true});
}
