import {stickVector} from './gamepad.mjs';

export class StickStats {
  constructor(){this.reset();}
  reset(){this.centerPeak=[0,0];this.reach=[Array(36).fill(0),Array(36).fill(0)];this.centerSamples=0;this.measuringUntil=0;this.complete=false;}
  startCenter(now){this.centerPeak=[0,0];this.centerSamples=0;this.measuringUntil=now+2000;this.complete=false;}
  update(axes,now){
    for(let i=0;i<2;i++){
      const x=axes[i*2]||0,y=axes[i*2+1]||0,r=Math.hypot(x,y),bin=Math.floor(((Math.atan2(y,x)+Math.PI)/(2*Math.PI))*36)%36;
      this.reach[i][bin]=Math.max(this.reach[i][bin],Math.min(1.5,r));
      if(this.measuringUntil&&now<=this.measuringUntil)this.centerPeak[i]=Math.max(this.centerPeak[i],r);
    }
    if(this.measuringUntil&&now<=this.measuringUntil)this.centerSamples++;
    if(this.measuringUntil&&now>this.measuringUntil){this.complete=this.centerSamples>=15;this.measuringUntil=0;}
  }
  recommendation(){return Math.min(.35,Math.max(.05,Math.ceil((Math.max(...this.centerPeak)+.02)*100)/100));}
}

export class ControllerLab {
  constructor(root,options){
    this.root=root;this.options=options;this.stats=new StickStats();this.key=null;this.padIndex=null;this.lastPaint=-Infinity;
    this.select=root.querySelector('#lab-device');this.buttons=root.querySelector('#lab-buttons');
    this.select.addEventListener('change',()=>{this.stop();this.padIndex=Number(this.select.value);this.key=null;this.stats.reset();});
    root.querySelector('#lab-center').addEventListener('click',()=>{if(this.pad)this.stats.startCenter(performance.now());});
    root.querySelector('#lab-reset').addEventListener('click',()=>this.stats.reset());
    root.querySelector('#lab-apply').addEventListener('click',()=>{if(this.stats.complete)options.onDeadzone(this.stats.recommendation());});
    root.querySelector('#lab-rumble').addEventListener('click',async()=>{
      try{const actuator=this.pad?.vibrationActuator||this.pad?.hapticActuators?.[0];if(!actuator?.playEffect)throw new Error('未检测到可用的震动接口');const result=await actuator.playEffect('dual-rumble',{duration:180,startDelay:0,strongMagnitude:.4,weakMagnitude:.6});if(result==='preempted')throw new Error('震动已中断');options.toast('已发送震动测试。');}catch{options.toast('当前设备或连接模式未提供震动，请尝试 USB 或 XInput 模式。');}
    });
  }
  stop(){try{Promise.resolve((this.pad?.vibrationActuator||this.pad?.hapticActuators?.[0])?.reset?.()).catch(()=>{});}catch{}}
  update(pads,now){
    if(this.root.hidden)return;
    const devices=Array.from(pads||[]).filter(p=>p&&p.connected!==false);
    const listing=devices.map(p=>`${p.index}:${p.id}`).join('|');
    if(listing!==this.listing){
      this.listing=listing;this.select.replaceChildren(...devices.map(p=>{const option=document.createElement('option');option.value=p.index;option.textContent=`${p.index+1}. ${p.id}`;return option;}));
      if(!devices.some(p=>p.index===this.padIndex))this.padIndex=devices[0]?.index??null;
      if(this.padIndex!==null)this.select.value=this.padIndex;
    }
    const pad=devices.find(p=>p.index===this.padIndex)||null;if(this.pad&&(!pad||pad.id!==this.pad.id||pad.index!==this.pad.index))this.stop();this.pad=pad;
    const key=pad?`${pad.index}:${pad.id}`:null;
    if(key!==this.key){this.key=key;this.stats.reset();this.buttons.replaceChildren();}
    const status=this.root.querySelector('#lab-status');
    status.textContent=pad?`${pad.mapping==='standard'?'标准布局':'原始布局（仅检测）'} · ${pad.axes.length} 轴 · ${pad.buttons.length} 键`:'未检测到手柄，连接后按一下按键。';
    if(pad)this.stats.update(pad.axes,now);
    if(now-this.lastPaint<40)return;this.lastPaint=now;
    const deadzone=this.options.settings().gamepadDeadzone;
    for(let i=0;i<2;i++)this.drawStick(this.root.querySelector('#lab-stick-'+i),pad?.axes.slice(i*2,i*2+2)||[0,0],deadzone,i);
    const axes=pad?.axes||[];
    this.root.querySelector('#lab-values').textContent=axes.length?axes.map((v,i)=>`轴 ${i}: ${v.toFixed(3)}`).join('  ·  '):'等待输入';
    this.root.querySelector('#lab-drift').textContent=this.stats.measuringUntil?'采集中，请松开双摇杆…':this.stats.complete?`中心偏移峰值：左 ${(this.stats.centerPeak[0]*100).toFixed(1)}% / 右 ${(this.stats.centerPeak[1]*100).toFixed(1)}%；建议死区 ${Math.round(this.stats.recommendation()*100)}%`:'点击「测中心漂移」后松开摇杆两秒。外圈轨迹可通过沿边旋转摇杆绘制。';
    this.root.querySelector('#lab-apply').disabled=!this.stats.complete;
    for(const [index,id] of [[6,'lab-lt'],[7,'lab-rt']]){const value=pad?.buttons[index]?.value||0;this.root.querySelector('#'+id).value=value;this.root.querySelector('#'+id+'-value').textContent=value.toFixed(3);}
    if(this.buttons.children.length!==(pad?.buttons.length||0))this.buttons.replaceChildren(...Array.from({length:pad?.buttons.length||0},(_,i)=>{const item=document.createElement('div');item.className='lab-button';return item;}));
    Array.from(this.buttons.children).forEach((item,i)=>{const b=pad.buttons[i];item.textContent=`${i} · ${b.value.toFixed(2)}`;item.classList.toggle('pressed',b.pressed||b.value>.55);});
  }
  drawStick(canvas,axes,deadzone,index){
    const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,r=w*.37,cx=w/2,cy=h/2;
    c.clearRect(0,0,w,h);c.strokeStyle='#344351';c.lineWidth=1;c.beginPath();c.moveTo(cx-r,cy);c.lineTo(cx+r,cy);c.moveTo(cx,cy-r);c.lineTo(cx,cy+r);c.stroke();
    c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke();c.fillStyle='#c5f66b18';c.strokeStyle='#c5f66b66';c.beginPath();c.arc(cx,cy,r*deadzone,0,Math.PI*2);c.fill();c.stroke();
    c.strokeStyle='#566d82';c.beginPath();this.stats.reach[index].forEach((length,i)=>{const a=(i+.5)/36*Math.PI*2-Math.PI;const x=cx+Math.cos(a)*length*r,y=cy+Math.sin(a)*length*r;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.stroke();
    const [x=0,y=0]=axes;const filtered=stickVector(x,y,deadzone);
    c.fillStyle='#ff9d67';c.beginPath();c.arc(cx+x*r,cy+y*r,5,0,Math.PI*2);c.fill();c.fillStyle='#c5f66b';c.beginPath();c.arc(cx+filtered.x*r,cy+filtered.y*r,4,0,Math.PI*2);c.fill();
    c.fillStyle='#bdcbd5';c.font='12px sans-serif';c.fillText(`X ${x.toFixed(3)} / Y ${y.toFixed(3)}`,12,h-12);
  }
}
