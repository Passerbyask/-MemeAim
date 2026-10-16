module.exports = async function smoke(window) {
  const report = await window.webContents.executeJavaScript(`(async()=>{
    const check=(value,message)=>{if(!value)throw new Error(message);};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    await wait(700);
    check(document.getElementById('fatal').hidden,'WebGL scene failed');
    check(document.querySelector('#arena canvas'),'3D canvas missing');
    check(typeof window.require==='undefined'&&typeof window.process==='undefined','Renderer has Node access');
    const manifest=await (await fetch('sounds/manifest.json')).json();
    check(manifest.hit.length&&manifest.miss.length,'Sounds missing');
    const audio=new Audio(manifest.hit[0].url);
    await new Promise((resolve,reject)=>{audio.onloadeddata=resolve;audio.onerror=()=>reject(new Error('Audio decode failed'));audio.load();setTimeout(()=>reject(new Error('Audio timeout')),10000);});
    const {memeClips,screenClips,MixedScreenEffects,particleKinds}=await import('./meme-effects.mjs');
    const urls=[...new Set([...Object.values(memeClips).flat(),...screenClips].map(c=>c.url))];
    for(const url of urls){
      const video=document.createElement('video');video.muted=true;
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Video timeout: '+url)),10000);video.onloadeddata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error('Video decode failed: '+url+' code='+video.error?.code+' '+video.error?.message));};video.src=url;video.load();});
      check(video.videoWidth>0,'Video dimensions missing');video.removeAttribute('src');video.load();
    }
    const fx=new MixedScreenEffects(document.getElementById('arena'));
    for(const kind of particleKinds){fx.trigger(0,true,'particle:'+kind);fx.update(500);check(!fx.particle.canvas.hidden,'Particle failed');}
    fx.setEnabled(false);check(fx.particle.canvas.hidden&&fx.video.canvas.hidden,'Effects did not stop');
    fx.video.canvas.remove();fx.particle.canvas.remove();
    const control=document.getElementById('control');control.value='cursor';control.dispatchEvent(new Event('change'));
    const modes=['gridshot','tracking','flick'];
    for(const mode of modes){
      document.querySelector('[data-mode="'+mode+'"]').click();document.getElementById('start').click();
      document.querySelector('#overlay-actions button').click();await wait(80);
      check(document.getElementById('overlay').hidden,'Training failed: '+mode);
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));
      check(!document.getElementById('overlay').hidden,'Pause failed: '+mode);
      const buttons=[...document.querySelectorAll('#overlay-actions button')];buttons.find(b=>b.textContent==='返回训练场').click();
    }
    // Virtual standard controller exercises the real frame loop and DOM flow.
    let observedShots=0;const shotObserver=new MutationObserver(()=>{if(document.getElementById('feedback').textContent)observedShots++;});shotObserver.observe(document.getElementById('feedback'),{childList:true,characterData:true,subtree:true});
    const descriptors=[Object.getOwnPropertyDescriptor(navigator,'getGamepads'),Object.getOwnPropertyDescriptor(document,'hasFocus'),Object.getOwnPropertyDescriptor(document,'hidden')];
    const virtual={connected:true,mapping:'standard',index:0,id:'MemeAim simulated controller',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
    const vibrations=[];let vibrationStops=0;virtual.vibrationActuator={effects:['dual-rumble'],playEffect:async(_type,params)=>{vibrations.push(params);},reset:async()=>{vibrationStops++;}};
    let pads=[virtual],pollCount=0;const gamepadErrors=[];window.addEventListener('error',e=>gamepadErrors.push(e.message));
    const until=async(test,message)=>{for(let n=0;n<80;n++){if(test())return;await wait(25);}throw new Error(message);};
    const press=async(index)=>{let before=pollCount;virtual.buttons[index]={pressed:true,value:1};await until(()=>pollCount>before,'Controller press was not sampled');await wait(80);before=pollCount;virtual.buttons[index]={pressed:false,value:0};await until(()=>pollCount>before,'Controller release was not sampled');await wait(40);};
    try{
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{pollCount++;return pads;}});
      Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
      Object.defineProperty(document,'hidden',{configurable:true,value:false});
      await until(()=>document.getElementById('gamepad-status').textContent.includes('已连接'),'Controller not detected');
      const beforeMode=document.querySelector('.mode-card.selected').dataset.mode;await press(5);check(document.querySelector('.mode-card.selected').dataset.mode!==beforeMode,'Controller mode selection failed: '+beforeMode+' -> '+document.querySelector('.mode-card.selected').dataset.mode+' polls='+pollCount+' hidden='+document.hidden+' focus='+document.hasFocus()+' errors='+JSON.stringify(gamepadErrors));
      await press(0);check(document.getElementById('control').value==='gamepad','Controller did not select input mode');
      await press(0);check(document.getElementById('overlay').hidden,'Controller did not enter training');
      check(!document.getElementById('reticle').hidden,'Controller crosshair missing');
      virtual.axes[2]=.5;await wait(100);virtual.axes[2]=0;
      const shotsBefore=observedShots;await press(7);await wait(500);check(observedShots>shotsBefore,'Controller trigger did not shoot');
      check(vibrations.length>0,'Controller vibration missing');
      const stopsBefore=vibrationStops;await press(9);check(!document.getElementById('overlay').hidden,'Controller pause failed');check(vibrationStops>stopsBefore,'Pause did not stop vibration');
      const timer=document.getElementById('timer').textContent;await wait(150);check(document.getElementById('timer').textContent===timer,'Paused controller timer advanced');
      await press(0);check(document.getElementById('overlay').hidden,'Controller resume failed');
      pads=[];await until(()=>!document.getElementById('overlay').hidden,'Disconnect did not pause');
      check(document.getElementById('overlay-body').textContent.includes('手柄'),'Disconnect reason missing');
      pads=[virtual];virtual.buttons[7]={pressed:true,value:1};const reconnectPoll=pollCount;await until(()=>pollCount>reconnectPoll,'Reconnect was not sampled');
      check(!document.getElementById('overlay').hidden,'Reconnect resumed without confirmation');
      virtual.buttons[7]={pressed:false,value:0};const releasePoll=pollCount;await until(()=>pollCount>releasePoll,'Reconnect release was not sampled');await press(0);
      check(document.getElementById('overlay').hidden,'Reconnect recovery failed');
      await press(1);await press(1);check(!document.body.classList.contains('playing'),'Controller return home failed');
    }finally{
      shotObserver.disconnect();
      for(const [i,[object,key]] of [[navigator,'getGamepads'],[document,'hasFocus'],[document,'hidden']].entries()){
        if(descriptors[i])Object.defineProperty(object,key,descriptors[i]);else delete object[key];
      }
    }
    localStorage.setItem('desktop-smoke','persisted');
    return {videoCount:urls.length,hitSounds:manifest.hit.length,missSounds:manifest.miss.length,modes,particleCount:particleKinds.length,gamepadSimulation:true,vibrationSimulation:true};
  })()`,true);
  await window.loadURL('memeaim://app/');
  const persisted=await window.webContents.executeJavaScript(`localStorage.getItem('desktop-smoke')==='persisted'`);
  if(!persisted)throw new Error('Local storage did not survive reload');
  return {...report,persistence:true};
};
