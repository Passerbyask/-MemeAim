import * as THREE from './vendor/three.module.js';
import {defaults,modes,sanitizeSettings,configKey,Session} from './core.mjs';
import {HeldWeapon} from './weapon.js';
import {MemeEffects,MixedScreenEffects} from './meme-effects.mjs';
import {GamepadInput,stickVector,lookDelta} from './gamepad.mjs';
import {ControllerLab} from './controller-lab.mjs';
import {GyroState,GyroConnection} from './gyro.mjs';

const $=id=>document.getElementById(id);
const STORAGE='memeaim-3d-v1';
let saved={};
try{saved=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{};}catch{}
let settings=sanitizeSettings(saved.settings), mode='gridshot';
let history=Array.isArray(saved.history)?saved.history.filter(r=>r&&modes[r.mode]&&Number.isFinite(r.score)&&r.settings&&typeof r.date==='string').slice(0,50):[];
let bests=saved.bests&&typeof saved.bests==='object'?saved.bests:{};
let disabled=Array.isArray(saved.disabled)?saved.disabled.filter(x=>typeof x==='string'):[];
let state='preview',session=null,targets=[],particles=[],elapsedPreview=0,lastFrame=performance.now(),feedbackUntil=0;
let manifest={hit:[],miss:[]},activeAudio=[],audioContext,toastTimeout;
let scene,camera,renderer,raycaster,geometry,targetMaterial,ringGeometry,ringMaterial;
let weapon;
const memes=new MemeEffects($('arena'),toast);
const screenEffects=new MixedScreenEffects($('arena'));
const gamepadInput=new GamepadInput();
const gyroState=new GyroState(),gyroConnection=new GyroConnection(gyroState);
const lab=new ControllerLab($('controller-panel'),{settings:()=>settings,onDeadzone:value=>{settings.gamepadDeadzone=value;settingChanged();},toast});
let lastGyroPaint=-Infinity;
let gamepadState={connected:false},gamepadMessage='',overlayIndex=0;
let activeSynth=[];
let inputMode=settings.control,playBounds={x:5.2,y:2.45},cursorPoint=new THREE.Vector2();
const numericFields=['duration','sensitivity','gamepadSensitivity','gamepadDeadzone','radius','count','speed','lifetime','volume'];
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,5000);}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({settings,history,bests,disabled}));}catch{toast('浏览器无法保存数据，本次仍可正常训练。');}}
function bestScore(){const best=bests[configKey(mode,settings)];return Number.isFinite(best)?best:null;}
function syncSettings(){
  for(const key of numericFields)$(key).value=settings[key];
  for(const key of ['control','crosshair'])$(key).value=settings[key];
  $('duration-out').textContent=settings.duration+' s';$('sensitivity-out').textContent=settings.sensitivity.toFixed(1)+'×';
  $('gamepadSensitivity-out').textContent=settings.gamepadSensitivity.toFixed(1)+'×';$('gamepadDeadzone-out').textContent=Math.round(settings.gamepadDeadzone*100)+'%';
  $('lab-deadzone').value=settings.gamepadDeadzone;$('lab-deadzone-value').textContent=Math.round(settings.gamepadDeadzone*100)+'%';
  $('gyro-enabled').checked=settings.gyroEnabled;$('gyro-sensitivity').value=settings.gyroSensitivity;$('gyro-sensitivity-value').textContent=settings.gyroSensitivity.toFixed(1)+'×';
  $('gyro-activation').value=settings.gyroActivation;$('gyro-yaw-axis').value=settings.gyroYawAxis;$('gyro-invert-x').checked=settings.gyroInvertX;$('gyro-invert-y').checked=settings.gyroInvertY;
  $('gamepad-options').hidden=settings.control!=='gamepad';$('gamepadVibration').checked=settings.gamepadVibration;
  $('radius-out').textContent=Math.round(settings.radius*100)+' cm';$('count-out').textContent=mode==='flick'?'1 个':settings.count+' 个';
  $('speed-out').textContent=settings.speed.toFixed(2)+' m/s';$('lifetime-out').textContent=settings.lifetime.toFixed(1)+' s';$('volume-out').textContent=Math.round(settings.volume*100)+'%';
  $('count').disabled=mode==='flick';$('speed-field').hidden=mode!=='tracking';$('lifetime-field').hidden=mode!=='flick';
  $('sound-enabled').checked=settings.sound;$('mute').textContent=settings.sound?'♫':'♪';$('mute').setAttribute('aria-pressed',String(!settings.sound));
  $('effects-enabled').checked=settings.effects;memes.setEnabled(settings.effects);screenEffects.setEnabled(settings.effects);
  document.documentElement.style.setProperty('--crosshair',settings.color);
  document.querySelectorAll('.reticle').forEach(el=>el.className='reticle '+settings.crosshair);
  document.querySelectorAll('[data-color]').forEach(el=>{el.classList.toggle('selected',el.dataset.color===settings.color);el.setAttribute('aria-pressed',String(el.dataset.color===settings.color));});
  $('personal-best').textContent=bestScore()??'—';$('arena-mode').textContent=modes[mode].label;
}
function settingChanged(){persist();syncSettings();if(state==='preview'&&scene)populate(true);}
for(const key of numericFields)$(key).addEventListener('input',e=>{settings[key]=Number(e.target.value);settingChanged();});
for(const key of ['control','crosshair'])$(key).addEventListener('change',e=>{settings[key]=e.target.value;settingChanged();});
$('sound-enabled').addEventListener('change',e=>{settings.sound=e.target.checked;settingChanged();if(!settings.sound)stopAudio();});
$('lab-deadzone').addEventListener('input',e=>{settings.gamepadDeadzone=Number(e.target.value);settingChanged();});
for(const [id,key] of [['gyro-enabled','gyroEnabled'],['gyro-invert-x','gyroInvertX'],['gyro-invert-y','gyroInvertY']])$(id).addEventListener('change',e=>{settings[key]=e.target.checked;settingChanged();});
for(const [id,key] of [['gyro-activation','gyroActivation'],['gyro-yaw-axis','gyroYawAxis']])$(id).addEventListener('change',e=>{settings[key]=e.target.value;settingChanged();});
$('gyro-sensitivity').addEventListener('input',e=>{settings.gyroSensitivity=Number(e.target.value);settingChanged();});
async function connectMotion(connect){
  $('gyro-hid').disabled=true;$('gyro-dsu').disabled=true;$('gyro-disconnect').disabled=true;
  try{await connect();}catch(error){toast(error.message||'运动来源连接失败，请检查设备。');}
  finally{$('gyro-hid').disabled=false;$('gyro-dsu').disabled=!window.motionBridge;$('gyro-disconnect').disabled=false;}
}
$('gyro-hid').addEventListener('click',()=>connectMotion(()=>gyroConnection.connectHid()));
$('gyro-dsu').disabled=!window.motionBridge;
$('gyro-dsu').addEventListener('click',()=>connectMotion(()=>gyroConnection.connectDsu(Number($('dsu-port').value),Number($('dsu-slot').value))));
$('gyro-disconnect').addEventListener('click',()=>gyroConnection.disconnect());
$('gyro-calibrate').addEventListener('click',()=>{if(gyroState.fresh(performance.now()))gyroState.calibrate(performance.now());else toast('请先连接并确认收到运动数据。');});
$('gamepadVibration').addEventListener('change',e=>{settings.gamepadVibration=e.target.checked;settingChanged();if(!settings.gamepadVibration)gamepadInput.stopRumble();});
$('effects-enabled').addEventListener('change',e=>{settings.effects=e.target.checked;settingChanged();});
for(const group of ['hit','miss'])$('preview-'+group).addEventListener('click',()=>{unlockAudio();const clip=memes.trigger(group,performance.now(),true);if(clip?.kind==='blast')boom();else playRandom(group);});
$('preview-screen').addEventListener('click',()=>{unlockAudio();screenEffects.trigger(performance.now(),true);boom();});
$('preview-dragon').addEventListener('click',()=>{unlockAudio();memes.trigger('hit',performance.now(),true,'effects/chinese-dragon.mp4');boom();});
document.querySelectorAll('[data-color]').forEach(el=>el.addEventListener('click',()=>{settings.color=el.dataset.color;settingChanged();}));
$('reset').addEventListener('click',()=>{settings={...defaults};settingChanged();toast('训练设置已恢复默认，历史成绩已保留。');});
document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>{
  mode=el.dataset.mode;document.querySelectorAll('[data-mode]').forEach(card=>{card.classList.toggle('selected',card===el);card.setAttribute('aria-pressed',String(card===el));});
  syncSettings();populate(true);
}));
document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{
  const tab=el.dataset.tab;if(state==='running'&&tab!=='training')pause();if(tab!=='controller')lab.stop();document.querySelectorAll('.page-panel').forEach(panel=>panel.hidden=panel.id!==tab+'-panel');
  document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
  if(tab==='records')renderRecords();if(tab==='training')resize();
}));

function initScene(){
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x17212b);
  $('scene').appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','立体靶球画面');
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(state==='running')pause();toast('3D 显示连接中断，请刷新页面重新进入。');});
  scene=new THREE.Scene();scene.background=new THREE.Color(0x18232e);scene.fog=new THREE.Fog(0x18232e,16,42);
  camera=new THREE.PerspectiveCamera(65,1,0.1,100);camera.position.set(0,3.5,11);camera.rotation.order='YXZ';
  scene.add(new THREE.HemisphereLight(0xc4dfef,0x22302d,2.2));
  const key=new THREE.DirectionalLight(0xe2ffd0,3);key.position.set(-3,9,7);scene.add(key);
  const fill=new THREE.PointLight(0x8bccff,35,25);fill.position.set(7,5,0);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshStandardMaterial({color:0x1b2a35,roughness:.65,metalness:.2}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const floorGrid=new THREE.GridHelper(50,50,0x435662,0x2d3e4a);floorGrid.position.y=.015;scene.add(floorGrid);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(50,22),new THREE.MeshStandardMaterial({color:0x1c2a36,roughness:.9}));back.position.set(0,9,-10);scene.add(back);
  const wallGrid=new THREE.GridHelper(50,50,0x3f5360,0x2c3d4a);wallGrid.rotation.x=Math.PI/2;wallGrid.position.set(0,7,-9.98);scene.add(wallGrid);
  const trimMat=new THREE.MeshBasicMaterial({color:0x698b65});
  const trim=new THREE.Mesh(new THREE.BoxGeometry(32,.025,.035),trimMat);trim.position.set(0,.06,-9.94);scene.add(trim);
  for(const x of [-10,10]){
    const column=new THREE.Mesh(new THREE.BoxGeometry(.25,12,.35),new THREE.MeshStandardMaterial({color:0x2b3b47}));column.position.set(x,6,-9.7);scene.add(column);
    const light=new THREE.Mesh(new THREE.BoxGeometry(.025,8,.04),new THREE.MeshBasicMaterial({color:0x94bcb6}));light.position.set(x,5,-9.49);scene.add(light);
  }
  // Shared geometry is reused for every target and hit fragment.
  geometry=new THREE.SphereGeometry(1,32,24);targetMaterial=new THREE.MeshStandardMaterial({color:0xc0f273,emissive:0x4b681e,emissiveIntensity:.3,metalness:.18,roughness:.24});
  ringGeometry=new THREE.TorusGeometry(1.1,.013,6,48);ringMaterial=new THREE.MeshBasicMaterial({color:0xd8ff99,transparent:true,opacity:.36});
  raycaster=new THREE.Raycaster();weapon=new HeldWeapon();resize();populate(true);
  renderer.domElement.addEventListener('pointerdown',pointerDown);
  renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
  new ResizeObserver(resize).observe($('arena'));
  requestAnimationFrame(frame);
}
function resize(){
  if(!renderer)return;const width=$('arena').clientWidth,height=$('arena').clientHeight;if(!width||!height)return;
  renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();
  weapon?.resize(width,height);
  // Narrow screens get a smaller horizontal spawn area; all targets stay reachable.
  playBounds.x=Math.min(5.2,Math.max(.65,11*Math.tan(THREE.MathUtils.degToRad(32.5))*camera.aspect-.8));
  if(state==='preview')populate(true);
}
function clearTargets(){for(const target of targets)scene.remove(target.mesh);targets=[];for(const p of particles)scene.remove(p.mesh);particles=[];}
function populate(preview=false){
  if(!scene)return;clearTargets();const count=preview?5:(mode==='flick'?1:session.settings.count);
  for(let i=0;i<count;i++)spawn(preview,i);
}
function spawn(preview=false,index=0){
  const s=preview?settings:session.settings;let position=new THREE.Vector3();
  if(preview){const positions=[[-2.8,5.1,-.5],[.4,5.8,-1.5],[3.1,4.8,1],[1.8,2.7,0],[-1,3.4,1.1]];position.fromArray(positions[index%5]);position.x*=Math.min(1,playBounds.x/4);}
  else{
    for(let attempt=0;attempt<40;attempt++){
      position.set((Math.random()*2-1)*playBounds.x,3.5+(Math.random()*2-1)*playBounds.y,Math.random()*1.5-1.5);
      if(targets.every(t=>t.mesh.position.distanceTo(position)>s.radius*2.8))break;
    }
  }
  const mesh=new THREE.Mesh(geometry,targetMaterial);mesh.position.copy(position);mesh.scale.setScalar(preview?.45:s.radius);
  const ring=new THREE.Mesh(ringGeometry,ringMaterial);mesh.add(ring);scene.add(mesh);
  const angle=Math.random()*Math.PI*2;
  targets.push({mesh,born:session?.elapsed||0,velocity:new THREE.Vector3(Math.cos(angle)*s.speed,Math.sin(angle)*s.speed,0),baseY:position.y,phase:index*1.7});
}
function burst(position){for(let i=0;i<12;i++){const mesh=new THREE.Mesh(geometry,targetMaterial);mesh.position.copy(position);mesh.scale.setScalar(.04+Math.random()*.045);scene.add(mesh);particles.push({mesh,life:.4,velocity:new THREE.Vector3((Math.random()-.5)*6,(Math.random()-.3)*6,(Math.random()-.5)*6)});}}
function frame(now){
  const dt=Math.min((now-lastFrame)/1000,.25);lastFrame=now;
  updateGamepad(now,dt);
  if(state==='running'){
    if(session.tick(dt)){finish(true);}else{
      for(const target of [...targets]){
        if(mode==='tracking'){
          target.mesh.position.addScaledVector(target.velocity,dt);
          for(const [axis,low,high] of [['x',-playBounds.x,playBounds.x],['y',1.05,5.95]]){
            if(target.mesh.position[axis]<low){target.mesh.position[axis]=low;target.velocity[axis]=Math.abs(target.velocity[axis]);}
            if(target.mesh.position[axis]>high){target.mesh.position[axis]=high;target.velocity[axis]=-Math.abs(target.velocity[axis]);}
          }
        }
        if(mode==='flick'){
          const age=session.elapsed-target.born;
          target.mesh.children[0].scale.setScalar(1+age/session.settings.lifetime*.5);
          if(age>=session.settings.lifetime){scene.remove(target.mesh);targets.splice(targets.indexOf(target),1);session.expire();spawn();}
        }
      }
      updateHud();
    }
  }else if(state==='preview'){
    elapsedPreview+=dt;camera.rotation.set(-.02,Math.sin(elapsedPreview*.1)*.025,0);
    targets.forEach(t=>{t.mesh.position.y=t.baseY+Math.sin(elapsedPreview*.7+t.phase)*.1;});
  }
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.multiplyScalar(Math.exp(-dt*5));if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1);}}
  if(now>feedbackUntil){$('feedback').textContent='';$('hit-marker').className='hit-marker';}
  if(!$('training-panel').hidden && !document.hidden){
    memes.update(now);screenEffects.update(now);
    renderer.render(scene,camera);
    if(state!=='preview'){weapon.update(state==='running'?dt:0,now/1000);weapon.render(renderer);}
  }
  requestAnimationFrame(frame);
}
function updateHud(){$('score').textContent=session.score;$('timer').textContent=session.remaining.toFixed(1);$('accuracy').textContent=Math.round(session.accuracy)+'%';$('combo').textContent=session.combo;}
function setOverlay(tag,title,body,buttons){
  $('overlay-tag').textContent=tag;$('overlay-title').textContent=title;$('overlay-body').replaceChildren();
  if(typeof body==='string'){const p=document.createElement('p');p.textContent=body;$('overlay-body').append(p);}else $('overlay-body').append(body);
  $('overlay-actions').replaceChildren();buttons.forEach(({text,action,primary=false})=>{const button=document.createElement('button');button.textContent=text;button.className=primary?'primary':'secondary';button.addEventListener('click',action);$('overlay-actions').append(button);});
  $('overlay').hidden=false;
  overlayIndex=0;highlightGamepadAction();
}
function highlightGamepadAction(){
  const buttons=[...$('overlay-actions').children];
  buttons.forEach((button,i)=>button.classList.toggle('gamepad-selected',inputMode==='gamepad'&&i===overlayIndex));
}
function updateGamepad(now,dt){
  let pads=[],supported=typeof navigator.getGamepads==='function';
  try{if(supported)pads=navigator.getGamepads();}catch{supported=false;}
  lab.update(pads,now);
  gyroState.tick(now);
  if(now-lastGyroPaint>=100){lastGyroPaint=now;const fresh=gyroState.fresh(now);$('gyro-source').textContent=gyroConnection.source||'未连接';$('gyro-status').textContent=gyroConnection.source?(fresh?`${gyroConnection.message} · ${gyroState.rate} Hz · ${gyroState.notice}`:`${gyroConnection.message} · 暂无新运动数据，请检查连接`):'未连接陀螺仪';$('gyro-values').textContent=fresh?Object.entries(gyroState.corrected()).map(([k,v])=>k.toUpperCase()+' '+v.toFixed(2)).join(' · ')+' °/s':'X — · Y — · Z — °/s';}
  const active=!document.hidden&&document.hasFocus();
  const old=gamepadState;gamepadState=gamepadInput.poll(pads,now,active);
  const message=!supported?'此浏览器暂不支持手柄':gamepadState.connected?'手柄已连接 · 按 A / × 开始':gamepadState.unmapped?'未识别按键布局，请将手柄切换为 XInput 模式':'连接手柄后按任意键唤醒';
  if(message!==gamepadMessage){$('gamepad-status').textContent=message;gamepadMessage=message;}
  $('gamepad-hint').hidden=!(state==='running'&&inputMode==='gamepad');
  if(state==='running'&&inputMode==='gamepad'&&old.connected&&(!gamepadState.connected||old.index!==gamepadState.index||old.id!==gamepadState.id)){
    pause('手柄已断开或切换，重新连接后按 A / × 继续。');return;
  }
  if(!active||!gamepadState.connected)return;
  if(state==='running'){
    if(inputMode!=='gamepad')return;
    if(gamepadState.pause||gamepadState.cancel){pause();return;}
    const stick=stickVector(gamepadState.look.x,gamepadState.look.y,session.settings.gamepadDeadzone);
    const delta=lookDelta(stick,dt,session.settings.gamepadSensitivity,gamepadState.precision);
    const motion=gyroState.delta(now,dt,session.settings,gamepadState.precision);
    camera.rotation.y+=delta.yaw+motion.yaw;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x+delta.pitch+motion.pitch,-1.3,1.3);
    weapon.aim(-delta.yaw/.002,-delta.pitch/.002);
    if(gamepadState.fire)shoot(0,0);
  }else if(state==='preview'){
    if($('training-panel').hidden){if(gamepadState.cancel)document.querySelector('[data-tab="training"]').click();return;}
    if(gamepadState.mode){const cards=[...document.querySelectorAll('[data-mode]')],index=cards.findIndex(c=>c.dataset.mode===mode);cards[(index+gamepadState.mode+cards.length)%cards.length].click();}
    if(gamepadState.confirm||gamepadState.pause){settings.control='gamepad';settingChanged();start();}
  }else if(inputMode==='gamepad'){
    if(gamepadState.cancel){home();return;}
    const buttons=[...$('overlay-actions').children];
    if(gamepadState.menu){overlayIndex=(overlayIndex+gamepadState.menu+buttons.length)%buttons.length;highlightGamepadAction();}
    if(gamepadState.pause&&['ready','paused'].includes(state)){activate();return;}
    if(gamepadState.confirm)buttons[overlayIndex]?.click();
  }
}
function unlock(){if(document.pointerLockElement)document.exitPointerLock();}
function start(){
  if(!renderer)return;memes.hide();screenEffects.hide();stopAudio();inputMode=settings.control;session=new Session(mode,settings);state='ready';
  document.body.classList.add('playing');$('preview-caption').hidden=true;$('arena-bottom').hidden=true;$('hud').hidden=false;
  $('reticle').hidden=true;camera.position.set(0,3.5,11);camera.rotation.set(0,0,0);resize();populate();updateHud();
  setOverlay('READY WHEN YOU ARE',modes[mode].name,inputMode==='gamepad'?'右摇杆瞄准，RT / R2 射击，LT / L2 精瞄。按 A / × 进入，Start / Options 暂停。':inputMode==='fps'?'鼠标转动视角，左键射击。按 Esc 暂停并释放鼠标。':'移动指针，点击立体靶球。触屏可直接点靶球。按 Esc 暂停。',[{text:'进入训练',action:activate,primary:true},{text:'返回训练场',action:home}]);
}
async function activate(){
  if(!['ready','paused'].includes(state))return;
  unlockAudio();
  if(inputMode==='gamepad'&&!gamepadState.connected){toast('请连接标准手柄并按一下按键唤醒，也可返回后切换为鼠标。');return;}
  if(inputMode==='fps'){
    try{
      if(!renderer.domElement.requestPointerLock)throw new Error('unsupported');
      await renderer.domElement.requestPointerLock();
      // Older browsers return void; pointerlockchange completes the transition.
      if(document.pointerLockElement===renderer.domElement)run();
    }catch{lockFallback();}
  }else run();
}
function lockFallback(){if(!['ready','paused'].includes(state))return;setOverlay('BROWSER COMPATIBILITY','请选择自由指针模式','当前浏览器未允许锁定鼠标。可以直接点击 3D 靶球，或在 Chrome / Edge 中重试。',[{text:'用自由指针继续',primary:true,action:()=>{inputMode='cursor';session.settings.control='cursor';camera.rotation.set(0,0,0);run();}},{text:'重试鼠标锁定',action:activate},{text:'返回训练场',action:home}]);}
function run(){state='running';lastFrame=performance.now();$('overlay').hidden=true;$('reticle').hidden=inputMode==='cursor';renderer.domElement.style.cursor=inputMode==='cursor'?'crosshair':'none';}
function pause(message='时间已冻结，放松一下手腕。'){if(state!=='running')return;state='paused';gamepadInput.suspend();memes.hide();screenEffects.hide();unlock();stopAudio();$('reticle').hidden=true;setOverlay('TAKE A BREATH','训练已暂停',message,[{text:'继续训练',primary:true,action:activate},{text:'结束并查看结果',action:()=>finish(false)},{text:'返回训练场',action:home}]);}
function home(){gamepadInput.stopRumble();state='preview';memes.hide();screenEffects.hide();unlock();stopAudio();document.body.classList.remove('playing');$('overlay').hidden=true;$('hud').hidden=true;$('reticle').hidden=true;$('preview-caption').hidden=false;$('arena-bottom').hidden=false;renderer.domElement.style.cursor='default';camera.rotation.set(0,0,0);$('feedback').textContent='';feedbackUntil=0;resize();populate(true);syncSettings();}
function finish(completed){
  if(state==='results'||state==='preview')return;gamepadInput.stopRumble();state='results';memes.hide();screenEffects.hide();session.finished=true;unlock();$('reticle').hidden=true;stopAudio();
  const result=session.result(completed);history.unshift(result);history=history.slice(0,50);
  const oldBest=Number.isFinite(bests[result.key])?bests[result.key]:-1;const newBest=completed&&result.score>oldBest;
  if(newBest)bests[result.key]=result.score;persist();
  const body=document.createElement('div');const stats=document.createElement('div');stats.className='result-grid';
  for(const [value,label] of [[result.score,'得分'],[result.accuracy+'%','命中率'],[result.maxCombo,'最佳连击']]){const item=document.createElement('div');const valueEl=document.createElement('strong');valueEl.textContent=value;const labelEl=document.createElement('span');labelEl.textContent=label;item.append(valueEl,labelEl);stats.append(item);}
  const detail=document.createElement('p');detail.textContent=`命中 ${result.hits} / 射击 ${result.shots} · 消失 ${result.expired} · 用时 ${result.elapsed.toFixed(1)} 秒`;
  const note=document.createElement('p');note.textContent=completed?(newBest?'新纪录！这是你当前配置的最佳成绩。':'每次练习，都是进步。保持这个节奏。'):'本次提前结束，保留记录但不计入最佳成绩。';body.append(stats,detail,note);
  setOverlay(completed?'SESSION COMPLETE':'SESSION ENDED',completed?'练得不错，下次更准。':'本次训练已结束',body,[{text:'再来一局',action:start,primary:true},{text:'返回训练场',action:home}]);
  if(completed&&settings.sound)playUrl('sounds/'+(result.score>=60?'w':'l')+'.mp3');
}
$('start').addEventListener('click',start);
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===renderer?.domElement){if(['ready','paused'].includes(state))run();}else if(state==='running'&&inputMode==='fps')pause();});
document.addEventListener('pointerlockerror',lockFallback);
document.addEventListener('mousemove',e=>{if(state==='running'&&inputMode==='fps'&&document.pointerLockElement===renderer.domElement){camera.rotation.y-=e.movementX*.002*session.settings.sensitivity;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-e.movementY*.002*session.settings.sensitivity,-1.3,1.3);weapon.aim(e.movementX,e.movementY);}});
document.addEventListener('keydown',e=>{if(e.code==='Escape'&&state==='running')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){lab.stop();pause();}});window.addEventListener('blur',()=>{lab.stop();pause();});
function pointerDown(e){
  if(state!=='running'||e.button!==0)return;e.preventDefault();
  if(inputMode==='gamepad')return;
  if(inputMode==='fps'&&document.pointerLockElement!==renderer.domElement)return;
  const rect=renderer.domElement.getBoundingClientRect();
  shoot(inputMode==='fps'?0:(e.clientX-rect.left)/rect.width*2-1,inputMode==='fps'?0:-(e.clientY-rect.top)/rect.height*2+1);
}
function shoot(x,y){
  if(state!=='running')return;cursorPoint.set(x,y);
  camera.updateMatrixWorld();scene.updateMatrixWorld(true);raycaster.setFromCamera(cursorPoint,camera);
  const intersection=raycaster.intersectObjects(targets.map(t=>t.mesh),false)[0];session.shoot(Boolean(intersection));weapon.fire();
  if(inputMode==='gamepad'&&settings.gamepadVibration)gamepadInput.rumble(Boolean(intersection));
  if(intersection){const index=targets.findIndex(t=>t.mesh===intersection.object);const target=targets[index];burst(target.mesh.position);scene.remove(target.mesh);targets.splice(index,1);spawn();}
  $('feedback').textContent=intersection?(session.combo>=5?`${session.combo} 连击！`:'+1'):'MISS';$('feedback').style.color=intersection?'#c5f66b':'#ff7b8c';
  $('hit-marker').className='hit-marker '+(intersection?'hit':'miss');feedbackUntil=performance.now()+350;
  const group=intersection?'hit':'miss';const reaction=memes.trigger(group);const fullScreen=screenEffects.trigger();
  if(fullScreen||reaction?.kind==='blast')boom();else playRandom(group);updateHud();
}
$('mute').addEventListener('click',()=>{settings.sound=!settings.sound;persist();syncSettings();if(!settings.sound)stopAudio();});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('arena').requestFullscreen();}catch{toast('当前浏览器不支持全屏，请使用 F11 或在独立浏览器中打开。');}});

function unlockAudio(){try{audioContext??=new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{}}
function beep(hit){try{if(!audioContext||audioContext.state!=='running')return;const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.setValueAtTime(hit?850:170,audioContext.currentTime);gain.gain.setValueAtTime(settings.volume*.18,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.1);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.1);}catch{}}
function stopAudio(){activeAudio.forEach(a=>{a.pause();a.src='';});activeAudio=[];activeSynth.forEach(s=>{try{s.stop();}catch{}});activeSynth=[];}
function boom(){
  if(!settings.sound||!audioContext||audioContext.state!=='running')return;
  const buffer=audioContext.createBuffer(1,Math.floor(audioContext.sampleRate*.45),audioContext.sampleRate);const data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*5);
  const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();
  source.buffer=buffer;filter.type='lowpass';filter.frequency.value=700;gain.gain.value=settings.volume*.4;
  source.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);activeSynth.push(source);
  source.onended=()=>{activeSynth=activeSynth.filter(s=>s!==source);source.disconnect();filter.disconnect();gain.disconnect();};source.start();
}
function playUrl(url,preview=false){
  if(activeAudio.length>=3){const oldest=activeAudio.shift();oldest.pause();}
  const audio=new Audio(url);audio.volume=settings.volume;activeAudio.push(audio);
  const cleanup=()=>{activeAudio=activeAudio.filter(a=>a!==audio);};audio.onended=cleanup;
  audio.play().catch(()=>{cleanup();if(preview)toast('此音效无法播放，请选择其他音效。');else beep(!url.includes('/miss/'));});
}
function playRandom(group){if(!settings.sound)return;const files=manifest[group].filter(f=>!disabled.includes(f.url));if(files.length)playUrl(files[Math.floor(Math.random()*files.length)].url);}
async function loadSounds(){try{const response=await fetch('./sounds/manifest.json');if(!response.ok)throw new Error('audio');manifest=await response.json();renderSounds();}catch{$('sound-content').textContent='音效列表暂时无法加载，请刷新页面。';}}
function renderSounds(){
  $('sound-content').replaceChildren();
  for(const group of ['hit','miss']){const box=document.createElement('section');box.className='sound-group';const title=document.createElement('h2');title.textContent=(group==='hit'?'命中音效':'打空音效')+' · '+manifest[group].length;box.append(title);
    manifest[group].forEach(file=>{const row=document.createElement('div');row.className='sound-row';const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=!disabled.includes(file.url);check.addEventListener('change',()=>{disabled=disabled.filter(x=>x!==file.url);if(!check.checked)disabled.push(file.url);persist();});const name=document.createElement('span');name.textContent=file.name.replaceAll('-',' ');label.append(check,name);const preview=document.createElement('button');preview.textContent='试听 ▷';preview.setAttribute('aria-label','试听 '+file.name);preview.addEventListener('click',()=>{stopAudio();unlockAudio();playUrl(file.url,true);});row.append(label,preview);box.append(row);});$('sound-content').append(box);
  }
}
function renderRecords(){
  const host=$('records-content');host.replaceChildren();
  if(!history.length){const empty=document.createElement('div');empty.className='empty-state';const title=document.createElement('h2');title.textContent='你的第一份成绩，等你来写。';const text=document.createElement('p');text.textContent='完成一局训练后，这里会显示得分、命中率和最佳连击。';empty.append(title,text);host.append(empty);return;}
  const wrap=document.createElement('div');wrap.className='table-wrap';const table=document.createElement('table');table.className='record-table';const head=document.createElement('thead');const hr=document.createElement('tr');['时间','模式 / 配置','得分','命中率','最佳连击','状态'].forEach(text=>{const th=document.createElement('th');th.textContent=text;hr.append(th);});head.append(hr);table.append(head);const tbody=document.createElement('tbody');
  history.forEach(r=>{const tr=document.createElement('tr');const values=[new Date(r.date).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}),`${modes[r.mode].name} · ${r.settings.duration}s · ${r.settings.control==='fps'?'第一人称':'指针'}`,r.score,r.accuracy+'%',r.maxCombo,r.completed?'已完成':'提前结束'];values.forEach((value,index)=>{const td=document.createElement('td');td.textContent=value;if(index===2)td.className='record-score';tr.append(td);});tbody.append(tr);});table.append(tbody);wrap.append(table);host.append(wrap);
}

syncSettings();loadSounds();
try{initScene();}catch(error){$('fatal').hidden=false;$('fatal').textContent='无法启动 3D 画面。请使用支持 WebGL 2 的 Chrome / Edge，并开启浏览器硬件加速。';$('start').disabled=true;console.error('3D initialization failed',error);}
