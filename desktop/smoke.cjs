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
    const until=async(test,message)=>{for(let n=0;n<200;n++){if(test())return;await wait(25);}throw new Error(message);};
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

      document.querySelector('[data-tab="controller"]').click();
      virtual.axes=[.2,-.4,.03,.04];virtual.buttons[6]={value:.4,pressed:false};
      await until(()=>document.getElementById('lab-values').textContent.includes('0.200'),'Lab axes not sampled');
      await until(()=>document.getElementById('lab-lt-value').textContent==='0.400','Lab trigger not sampled');
      check(document.querySelectorAll('#lab-buttons .lab-button').length===17,'Lab buttons missing');
      const zone=document.getElementById('lab-deadzone');zone.value='.2';zone.dispatchEvent(new Event('input'));
      check(document.getElementById('gamepadDeadzone').value==='0.2','Lab deadzone not shared with training');
      virtual.axes=[.03,0,.04,0];virtual.buttons[6]={value:0,pressed:false};document.getElementById('lab-center').click();
      await until(()=>!document.getElementById('lab-apply').disabled,'Lab drift measurement did not complete');
      check(document.getElementById('lab-drift').textContent.includes('3.0%'),'Lab drift reading missing');
      document.getElementById('lab-apply').click();check(Number(document.getElementById('gamepadDeadzone').value)<=.07,'Suggested deadzone did not apply');
      const labRumbles=vibrations.length;document.getElementById('lab-rumble').click();await until(()=>vibrations.length>labRumbles,'Lab rumble failed');
      virtual.mapping='';await until(()=>document.getElementById('lab-status').textContent.includes('原始布局'),'Non-standard lab input missing');virtual.mapping='standard';
      check(typeof window.motionBridge?.connect==='function','Desktop motion bridge missing');

      // Simulated USB reports test the public HID UI without claiming hardware validation.
      const hidDescriptor=Object.getOwnPropertyDescriptor(navigator,'hid');
      const device=new EventTarget();Object.assign(device,{productName:'Simulated DualSense',opened:false,open:async()=>{device.opened=true;},close:async()=>{device.opened=false;},receiveFeatureReport:async()=>new DataView(new ArrayBuffer(41))});
      let motionTimer;
      try{
        const hid=new EventTarget();hid.requestDevice=async({filters})=>{check(filters.some(f=>f.vendorId===0x054c&&f.productId===0x0ce6),'DualSense filter missing');return [device];};
        Object.defineProperty(navigator,'hid',{configurable:true,value:hid});
        document.getElementById('gyro-hid').click();await until(()=>device.opened,'HID did not open');
        let rawY=66;
        const emit=()=>{const data=new DataView(new ArrayBuffer(63));data.setInt16(15,49,true);data.setInt16(17,rawY,true);const event=new Event('inputreport');Object.defineProperties(event,{reportId:{value:1},data:{value:data}});device.dispatchEvent(event);};
        motionTimer=setInterval(emit,20);emit();
        await until(()=>document.getElementById('gyro-values').textContent.includes('4.02'),'Motion values missing');
        document.getElementById('gyro-calibrate').click();await until(()=>document.getElementById('gyro-status').textContent.includes('校准完成'),'HID stationary calibration failed');
        const enabled=document.getElementById('gyro-enabled');enabled.checked=true;enabled.dispatchEvent(new Event('change'));
        check(JSON.parse(localStorage.getItem('memeaim-3d-v1')).settings.gyroEnabled,'Gyro setting not saved');
        rawY=394;await until(()=>document.getElementById('gyro-values').textContent.includes('20.00'),'Calibrated motion did not subtract bias');
        clearInterval(motionTimer);await until(()=>document.getElementById('gyro-values').textContent.includes('—'),'Stale motion values not cleared');
        document.getElementById('gyro-disconnect').click();await until(()=>!device.opened,'HID did not close');
        enabled.checked=false;enabled.dispatchEvent(new Event('change'));
      }finally{clearInterval(motionTimer);if(hidDescriptor)Object.defineProperty(navigator,'hid',hidDescriptor);else delete navigator.hid;}
      document.querySelector('[data-tab="training"]').click();
    }finally{
      shotObserver.disconnect();
      for(const [i,[object,key]] of [[navigator,'getGamepads'],[document,'hasFocus'],[document,'hidden']].entries()){
        if(descriptors[i])Object.defineProperty(object,key,descriptors[i]);else delete object[key];
      }
    }
    localStorage.setItem('desktop-smoke','persisted');
    return {videoCount:urls.length,hitSounds:manifest.hit.length,missSounds:manifest.miss.length,modes,particleCount:particleKinds.length,gamepadSimulation:true,vibrationSimulation:true,controllerLabSimulation:true,gyroHidSimulation:true,desktopMotionBridge:true};
  })()`,true);
  if(process.env.MEMEAIM_LAB_SCREENSHOT){
    await window.webContents.executeJavaScript(`document.querySelector('[data-tab="controller"]').click();new Promise(r=>setTimeout(r,100))`);
    require('node:fs').writeFileSync(process.env.MEMEAIM_LAB_SCREENSHOT,(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`document.getElementById('gyro-source').scrollIntoView();new Promise(r=>setTimeout(r,100))`);
    require('node:fs').writeFileSync(process.env.MEMEAIM_LAB_SCREENSHOT.replace(/\.png$/,'-gyro.png'),(await window.webContents.capturePage()).toPNG());
  }
  await window.loadURL('memeaim://app/');
  const persisted=await window.webContents.executeJavaScript(`localStorage.getItem('desktop-smoke')==='persisted'`);
  if(!persisted)throw new Error('Local storage did not survive reload');
  return {...report,persistence:true};
};
