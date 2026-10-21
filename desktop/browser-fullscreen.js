'use strict';
// Own the native window transition without changing the saved split layout.
function createBrowserFullscreen(win, changed, getActive) {
  let page = false, owner = null, previous = false, active = false;
  let nativeVideo = null, cleanupVideo = null, generation = 0, disposed = false;
  const state = () => ({ active, kind: owner || nativeVideo ? 'video' : page ? 'page' : null });
  function sync() {
    const next = page || !!owner || !!nativeVideo;
    if (next && !active) previous = win.isFullScreen();
    active = next;
    if (!win.isDestroyed() && win.isFullScreen() !== (active || previous)) win.setFullScreen(active || previous);
    changed();
  }
  async function exit() {
    const wc = owner;
    generation++; cleanupVideo?.(); cleanupVideo = null; nativeVideo = null;
    page = false; owner = null; sync();
    if (wc && !wc.isDestroyed()) await wc.executeJavaScript('document.fullscreenElement ? document.exitFullscreen() : undefined').catch(() => {});
  }
  function set(enabled) { if (enabled) { page = true; sync(); } else void exit(); }
  async function recoverVideo(wc, epoch) {
    if (disposed || generation !== epoch || active || wc.isDestroyed() || wc !== getActive()) return;
    const found = await wc.executeJavaScript(`(() => {
      if(document.fullscreenElement || document.activeElement?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return false;
      const videos=[...document.querySelectorAll('video')].map(v=>({v,r:v.getBoundingClientRect()})).filter(({r})=>r.width>80&&r.height>50&&r.bottom>0&&r.top<innerHeight).sort((a,b)=>b.r.width*b.r.height-a.r.width*a.r.height);
      const video=videos[0]?.v;if(!video)return false;
      (video.closest('#movie_player,.html5-video-player')||video).setAttribute('data-fa-immersive-player','');return true;
    })()`).catch(()=>false);
    if (!found) return;
    if (disposed || generation !== epoch || active) {
      if(!wc.isDestroyed())void wc.executeJavaScript("document.querySelectorAll('[data-fa-immersive-player]').forEach(e=>e.removeAttribute('data-fa-immersive-player'))").catch(()=>{});
      return;
    }
    // Chromium can leave an HTML fullscreen promise pending after repeated
    // Windows transitions. Present the player without moving/reloading its DOM.
    const css = await wc.insertCSS(`html,body{overflow:hidden!important}body *{visibility:hidden!important}
      [data-fa-immersive-player],[data-fa-immersive-player] *{visibility:visible!important}
      [data-fa-immersive-player]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;z-index:2147483647!important;background:black!important}
      [data-fa-immersive-player] video{width:100%!important;height:100%!important;object-fit:contain!important}`,{cssOrigin:'user'});
    const cleanup = () => {if(!wc.isDestroyed()){void wc.removeInsertedCSS(css).catch(()=>{});void wc.executeJavaScript("document.querySelectorAll('[data-fa-immersive-player]').forEach(e=>e.removeAttribute('data-fa-immersive-player'))").catch(()=>{})}};
    if(disposed || generation!==epoch || active){cleanup();return}
    cleanupVideo=cleanup;nativeVideo=wc;sync();
  }
  function track(wc) {
    let keyTimer;
    wc.on('enter-html-full-screen', () => {
      if (wc !== getActive()) { void wc.executeJavaScript('document.exitFullscreen()').catch(() => {}); return; }
      owner = wc; sync();
    });
    wc.on('leave-html-full-screen', () => { if (owner === wc) { owner = null; if(nativeVideo===wc){cleanupVideo?.();cleanupVideo=null;nativeVideo=null} sync(); } });
    wc.on('did-start-navigation', (_e, _url, inPlace, main) => { if (main && !inPlace && (owner === wc || nativeVideo===wc)) void exit(); });
    wc.on('destroyed', () => { clearTimeout(keyTimer); if (owner === wc || nativeVideo === wc) { cleanupVideo=null;nativeVideo=null;owner = null; page = false; sync(); } });
    wc.on('render-process-gone', () => { if (wc === getActive() && active) void exit(); });
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isAutoRepeat) return;
      if (input.key === 'F11') { event.preventDefault(); set(!active); }
      if (input.key === 'Escape' && active) { event.preventDefault(); void exit(); }
      if (input.key.toLowerCase()==='f' && nativeVideo===wc && !input.control && !input.meta && !input.alt) {event.preventDefault();void exit();return}
      if (input.key.toLowerCase() === 'f' && !input.control && !input.meta && !input.alt) {
        clearTimeout(keyTimer);
        const requested = Date.now();
        keyTimer = setTimeout(() => {
          if (wc.isDestroyed() || wc !== getActive()) return;
          // WebContentsView can receive before-input-event but drop its DOM key
          // after exiting fullscreen. Recover only a key not seen by the page;
          // ordinary website handlers and typing retain their original event.
          void wc.executeJavaScript(`(() => {
            if (document.activeElement?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
            if ((window[Symbol.for('free-agent.browser.last-f')] || 0) >= ${requested}) {
              if ((window[Symbol.for('free-agent.browser.handled-f')] || 0) >= ${requested}) return;
              return {video:true};
            }
            const before = document.fullscreenElement;
            const event = new KeyboardEvent('keydown', {key:'f',code:'KeyF',bubbles:true,cancelable:true});
            Object.defineProperty(event,'__freeAgentNativeRecovery',{value:true});
            document.dispatchEvent(event);
            if (event.defaultPrevented || document.fullscreenElement !== before) return {handled:event.defaultPrevented,changed:document.fullscreenElement!==before};
            if (before) { void document.exitFullscreen().catch(()=>{}); return; }
            const videos = [...document.querySelectorAll('video')].map(v=>({v,r:v.getBoundingClientRect()}))
              .filter(({r})=>r.width>80&&r.height>50&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth)
              .sort((a,b)=>(!a.v.paused?-1:0)-(!b.v.paused?-1:0)||b.r.width*b.r.height-a.r.width*a.r.height);
            const v = videos[0]?.v;
            if (v) {void (v.closest('#movie_player,.html5-video-player') || v).requestFullscreen().catch(()=>{});return {video:true};}
            return {video:false};
          })()`, true).then(result=>{if(result?.video){const epoch=generation;const timer=setTimeout(()=>void recoverVideo(wc,epoch).catch(()=>{}),200);timer.unref()}}).catch(() => {});
        }, 120);
        keyTimer.unref();
      }
    });
  }
  return { state, set, exit, track, dispose() { disposed=true;generation++;cleanupVideo?.();cleanupVideo=null;nativeVideo=null;if (active && !win.isDestroyed()) win.setFullScreen(previous); page = false; owner = null; active = false; } };
}
module.exports = { createBrowserFullscreen };
