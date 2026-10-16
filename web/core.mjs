export const defaults = Object.freeze({duration:60,sensitivity:1,gamepadSensitivity:1,gamepadDeadzone:.15,gamepadVibration:true,radius:0.35,count:3,speed:2,lifetime:1,control:'fps',crosshair:'cross',color:'#c5f66b',sound:true,effects:true,volume:0.35});
export const modes = {gridshot:{name:'精准速点',label:'GRIDSHOT'},tracking:{name:'移动追踪',label:'TRACKING'},flick:{name:'闪现甩枪',label:'FLICK'}};
export function sanitizeSettings(raw={}){
  raw=raw&&typeof raw==='object'?raw:{};
  const result={...defaults};
  for(const [key,min,max] of [['duration',10,180],['sensitivity',0.2,3],['gamepadSensitivity',.2,3],['gamepadDeadzone',.05,.35],['radius',0.15,0.6],['count',1,10],['speed',0.5,5],['lifetime',0.2,3],['volume',0,1]]){
    if(typeof raw[key]==='number' && Number.isFinite(raw[key])) result[key]=Math.max(min,Math.min(max,raw[key]));
  }
  result.count=Math.round(result.count);
  if(![10,30,60,90,120,180].includes(result.duration)) result.duration=60;
  if(['fps','cursor','gamepad'].includes(raw.control)) result.control=raw.control;
  if(['cross','dot','circle'].includes(raw.crosshair)) result.crosshair=raw.crosshair;
  if(['#c5f66b','#ffffff','#52dfff','#ff78ac'].includes(raw.color)) result.color=raw.color;
  if(typeof raw.gamepadVibration==='boolean')result.gamepadVibration=raw.gamepadVibration;
  if(typeof raw.sound==='boolean')result.sound=raw.sound;
  if(typeof raw.effects==='boolean')result.effects=raw.effects;
  return result;
}
export function configKey(mode,s){return JSON.stringify([mode,s.duration,s.radius,mode==='flick'?1:s.count,mode==='tracking'?s.speed:0,mode==='flick'?s.lifetime:0,s.control]);}
export class Session {
  constructor(mode,settings){this.mode=mode;this.settings={...settings};this.elapsed=0;this.score=0;this.hits=0;this.shots=0;this.combo=0;this.maxCombo=0;this.expired=0;this.finished=false;}
  get remaining(){return Math.max(0,this.settings.duration-this.elapsed);}
  get accuracy(){return this.shots?this.hits/this.shots*100:0;}
  tick(dt){if(!this.finished){this.elapsed+=Math.max(0,dt);if(this.remaining===0)this.finished=true;}return this.finished;}
  shoot(hit){if(this.finished)return;this.shots++;if(hit){this.hits++;this.score++;this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);}else{this.score=Math.max(0,this.score-1);this.combo=0;}}
  expire(){if(!this.finished){this.expired++;this.combo=0;}}
  result(completed=true){return {mode:this.mode,score:this.score,hits:this.hits,shots:this.shots,accuracy:Math.round(this.accuracy),maxCombo:this.maxCombo,expired:this.expired,elapsed:Math.min(this.elapsed,this.settings.duration),completed,settings:{...this.settings},key:configKey(this.mode,this.settings),date:new Date().toISOString()};}
}
