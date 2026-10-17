const fs=require('node:fs');
module.exports=async function smoke(window){
  const report=await window.webContents.executeJavaScript(`(async()=>{
    const check=(ok,message)=>{if(!ok)throw new Error(message);};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn,message)=>{for(let n=0;n<240;n++){if(fn())return;await wait(25);}throw new Error(message);};
    await until(()=>window.__AIMLAB__,'DPSK did not boot');
    const {Store,Game,UI,MemeFX}=window.__AIMLAB__;
    check(typeof window.require==='undefined'&&typeof window.process==='undefined','Node exposed to renderer');
    check(document.getElementById('game-canvas')?.getContext('2d'),'Game canvas missing');
    check(document.querySelectorAll('#mode-grid .mode-card').length===6,'Six mode cards missing');
    check(Store.settings.audio.enabled===false,'Default audio must be muted');
    const assets=window.__MEME_ASSETS__,entries=Object.entries(assets||{});
    check(entries.length===125,'Embedded assets incomplete: '+entries.length);
    let audioCount=0,videoCount=0,imageCount=0;
    for(const [name,url] of entries){
      if(name.endsWith('.svg')){
        const img=new Image();img.src=url;await img.decode();check(img.naturalWidth>0,'Emoji decode failed: '+name);imageCount++;continue;
      }
      const video=/\\.(mp4|webm)$/.test(name),audio=/\\.(mp3|wav|ogg)$/.test(name);if(!video&&!audio)continue;
      const media=document.createElement(video?'video':'audio');media.muted=true;media.preload='auto';
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Media timeout: '+name)),10000);media.onloadeddata=()=>{clearTimeout(timer);resolve();};media.onerror=()=>{clearTimeout(timer);reject(new Error('Media decode failed: '+name+' code='+media.error?.code));};media.src=url;media.load();});
      if(video){check(media.videoWidth>0,'Video dimensions missing: '+name);videoCount++;}else audioCount++;
      media.removeAttribute('src');media.load();
    }
    const cat=MemeFX.getCatalog();check(cat.floating.length===18&&cat.screens.length===22&&cat.emojis.length===44,'Meme catalog incomplete');
    UI.openSettings('meme');check(!document.getElementById('settings-modal').classList.contains('hidden'),'Settings did not open');UI.closeSettings();
    const modes=['gridshot','spidershot','motion','flick','tracking','precision'];
    for(const mode of modes){
      document.querySelector('.mode-card[data-mode="'+mode+'"]').click();
      check(document.getElementById('screen-game').classList.contains('active'),'Mode did not start: '+mode);
      window.__AIMLAB_TEST__.skipCountdown();await until(()=>Game.getPhase()==='playing','Countdown failed: '+mode);
      if(mode!=='tracking'){
        const before=Game.debug();Game.debug().shootTarget(0);const hit=Game.debug();check(hit.hits>before.hits&&hit.score>before.score,'Hit did not score: '+mode);
        Game.debug().shootAt(0,0);check(Game.debug().misses>hit.misses&&Game.debug().combo===1,'Miss did not clear combo: '+mode);
      }else{
        const target=Game.debug().targets[0];check(target,'Tracking target missing');Game.debug().setAim(target.x,target.y);Game.debug().advance(.1);check(Game.debug().score>0,'Tracking did not score');
      }
      document.getElementById('hud-pause').click();check(Game.getPhase()==='paused','Pause failed: '+mode);
      const time=Game.debug().elapsed;await wait(80);check(Game.debug().elapsed===time,'Paused timer advanced');
      document.getElementById('pause-resume').click();check(Game.getPhase()==='playing','Resume failed: '+mode);
      window.__AIMLAB_TEST__.endNow();await until(()=>document.getElementById('screen-results').classList.contains('active'),'Results failed: '+mode);
      check(Store.records.history.some(r=>r.modeId===mode),'Record not saved: '+mode);
      document.getElementById('results-menu').click();check(document.getElementById('screen-menu').classList.contains('active'),'Return menu failed');check(document.getElementById('pause-overlay').classList.contains('hidden'),'Pause overlay remained visible');
    }
    // Exercise actual Canvas/video layers, not only media decoding.
    MemeFX.previewFloating(cat.floating[0].id);await until(()=>MemeFX.debug().floatActive,'Floating effect did not appear');MemeFX.clear();
    const screenVideo=cat.screens.find(s=>s.kind==='video');MemeFX.previewScreen(screenVideo.id);await until(()=>MemeFX.debug().screenActive,'Screen video did not appear');MemeFX.clear();
    check(!MemeFX.debug().floatActive&&!MemeFX.debug().screenActive,'Effects did not clear');
    check(Store.settings.audio.enabled===false,'Training unexpectedly enabled sound');
    Store.updateSettings({sensitivity:1.3});localStorage.setItem('desktop-dpsk-smoke','persisted');
    return {modes,audioCount,videoCount,imageCount,embeddedAssets:entries.length,defaultMuted:true,settings:true,effects:true,records:Store.records.history.length};
  })()`,true);
  if(process.env.MEMEAIM_DPSK_SCREENSHOT){
    await window.webContents.executeJavaScript(`new Promise(r=>setTimeout(r,500))`);
    fs.writeFileSync(process.env.MEMEAIM_DPSK_SCREENSHOT,(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`window.__AIMLAB__.Game.start('gridshot');window.__AIMLAB_TEST__.skipCountdown();new Promise(r=>setTimeout(r,200))`);
    fs.writeFileSync(process.env.MEMEAIM_DPSK_SCREENSHOT.replace(/\.png$/,'-game.png'),(await window.webContents.capturePage()).toPNG());
  }
  await window.loadURL('memeaim://app/?test=1');
  const persisted=await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let n=0;const poll=()=>{if(window.__AIMLAB__)resolve(localStorage.getItem('desktop-dpsk-smoke')==='persisted'&&window.__AIMLAB__.Store.settings.sensitivity===1.3&&window.__AIMLAB__.Store.records.history.length===6);else if(n++<100)setTimeout(poll,25);else reject(new Error('Reload failed'));};poll();})`);
  if(!persisted)throw new Error('DPSK settings or records did not survive reload');
  await window.loadURL('memeaim://app/');
  const normal=await window.webContents.executeJavaScript(`document.querySelectorAll('#mode-grid .mode-card').length===6&&typeof window.__AIMLAB__==='undefined'&&document.getElementById('screen-menu').classList.contains('active')`);
  if(!normal)throw new Error('Normal app boot failed');
  return {...report,persistence:true,normalBoot:true};
};
