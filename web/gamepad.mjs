// Standard Gamepad API mapping: Xbox, PlayStation and XInput-compatible pads.
export function stickVector(x=0,y=0,deadzone=.15){
  x=Number.isFinite(x)?Math.max(-1,Math.min(1,x)):0;
  y=Number.isFinite(y)?Math.max(-1,Math.min(1,y)):0;
  const length=Math.hypot(x,y),zone=Math.max(0,Math.min(.5,deadzone));
  if(length<=zone)return {x:0,y:0};
  const strength=(Math.min(1,length)-zone)/(1-zone);
  return {x:x/length*strength*strength,y:y/length*strength*strength};
}

export function lookDelta(stick,dt,sensitivity=1,precision=false){
  const speed=2.5*sensitivity*Math.max(0,Math.min(.05,dt))*(precision?.35:1);
  return {yaw:-stick.x*speed,pitch:-stick.y*speed};
}

export class GamepadInput {
  constructor(){this.key=null;this.pad=null;this.previous=[];this.blocked=true;this.lastShot=-Infinity;this.lastMenu=-Infinity;}
  poll(gamepads,now,active=true){
    const pads=Array.from(gamepads||[]).filter(p=>p&&p.connected!==false);
    const standard=pads.filter(p=>p.mapping==='standard');
    const pad=standard.find(p=>`${p.index}:${p.id}`===this.key)||standard[0];
    if(!pad){this.stopRumble();this.pad=null;this.key=null;this.previous=[];this.blocked=true;return {connected:false,unmapped:pads.length>0};}
    const key=`${pad.index}:${pad.id}`;
    const buttons=Array.from(pad.buttons||[],b=>!!b?.pressed||Number(b?.value)>=.55);
    const released=buttons.every(b=>!b);
    const initial=this.key!==key;
    if(initial||!active)this.stopRumble();this.pad=pad;
    if(initial||!active){this.key=key;this.previous=buttons;this.blocked=true;this.lastShot=-Infinity;this.lastMenu=-Infinity;}
    const result={connected:true,id:pad.id,index:pad.index,changed:initial,look:{x:0,y:0},precision:false,fire:false,confirm:false,cancel:false,pause:false,mode:0,menu:0};
    if(!active||initial||this.blocked){if(active&&released)this.blocked=false;this.previous=buttons;return result;}
    const edge=i=>buttons[i]&&!this.previous[i];
    result.look={x:pad.axes?.[2]||0,y:pad.axes?.[3]||0};
    result.precision=buttons[6];result.confirm=edge(0);result.cancel=edge(1);result.pause=edge(9);
    result.mode=edge(15)||edge(5)?1:edge(14)||edge(4)?-1:0;
    const menuAxis=pad.axes?.[1]||0;
    const up=buttons[12]||menuAxis<-.65,down=buttons[13]||menuAxis>.65;
    if((up||down)&&now-this.lastMenu>=250){result.menu=down?1:-1;this.lastMenu=now;}
    if(!up&&!down)this.lastMenu=-Infinity;
    if(edge(0)||(buttons[7]&&now-this.lastShot>=160)){result.fire=true;this.lastShot=now;}
    this.previous=buttons;return result;
  }
  actuator(){return this.pad?.vibrationActuator||this.pad?.hapticActuators?.[0];}
  async rumble(hit){
    try{
      const actuator=this.actuator();if(typeof actuator?.playEffect!=='function')return false;
      if(actuator.effects&&!Array.from(actuator.effects).includes('dual-rumble'))return false;
      await actuator.playEffect('dual-rumble',{startDelay:0,duration:hit?90:45,strongMagnitude:hit?.45:.08,weakMagnitude:hit?.65:.25});
      return true;
    }catch{return false;}
  }
  stopRumble(){try{Promise.resolve(this.actuator()?.reset?.()).catch(()=>{});}catch{}}
  suspend(){this.blocked=true;this.stopRumble();}
}
