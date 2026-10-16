import test from 'node:test';
import assert from 'node:assert/strict';
import {GamepadInput,stickVector,lookDelta} from './gamepad.mjs';
const pad=(buttons=[],axes=[0,0,0,0],index=0,id='test')=>({connected:true,mapping:'standard',index,id,axes,buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))});

test('radial deadzone prevents drift, preserves direction and caps diagonal speed',()=>{
  assert.deepEqual(stickVector(.05,-.05,.15),{x:0,y:0});
  const v=stickVector(1,1);assert.ok(Math.abs(Math.hypot(v.x,v.y)-1)<1e-10);
  assert.ok(stickVector(.5,-.5).y<0);assert.deepEqual(stickVector(NaN,Infinity),{x:0,y:0});
  assert.ok(Math.hypot(...Object.values(stickVector(.4,0)))<.4);
});
test('aim speed uses elapsed time and precision trigger',()=>{
  const a=lookDelta({x:1,y:.5},1/60,1),b=lookDelta({x:1,y:.5},1/120,1);
  assert.equal(a.yaw,b.yaw*2);assert.ok(a.yaw<0&&a.pitch<0);
  assert.equal(lookDelta({x:1,y:0},1/60,1,true).yaw,a.yaw*.35);
  assert.equal(lookDelta({x:1,y:0},10,1).yaw,-.125);
});
test('connecting or returning to focus while holding fire requires release',()=>{
  const input=new GamepadInput();assert.equal(input.poll([pad([7])],0).fire,false);
  assert.equal(input.poll([pad([7])],300).fire,false);
  input.poll([pad()],400);assert.equal(input.poll([pad([7])],500).fire,true);
  input.poll([pad([7])],600,false);assert.equal(input.poll([pad([7])],900).fire,false);
  input.poll([pad()],1000);assert.equal(input.poll([pad([7])],1100).fire,true);
});
test('buttons are edges while held RT has a bounded repeat rate',()=>{
  const input=new GamepadInput();input.poll([pad()],0);
  assert.equal(input.poll([pad([9])],10).pause,true);assert.equal(input.poll([pad([9])],20).pause,false);
  input.poll([pad()],30);assert.equal(input.poll([pad([7])],40).fire,true);
  assert.equal(input.poll([pad([7])],199).fire,false);assert.equal(input.poll([pad([7])],200).fire,true);
  input.poll([pad()],210);assert.equal(input.poll([pad([0])],220).confirm,true);
  assert.equal(input.poll([pad([0])],230).confirm,false);
});
test('disconnect and remapped devices do not reuse held input or switch active pads',()=>{
  const input=new GamepadInput();input.poll([pad([],undefined,1)],0);
  assert.equal(input.poll([pad([7]),pad([],undefined,1)],20).index,1);
  assert.equal(input.poll([],30).connected,false);
  assert.equal(input.poll([pad([7])],40).fire,false);
  assert.equal(input.poll([{...pad(),mapping:''}],50).unmapped,true);
});
test('mode selection and pause-menu navigation use standard buttons',()=>{
  const input=new GamepadInput();input.poll([pad()],0);
  assert.equal(input.poll([pad([5])],10).mode,1);assert.equal(input.poll([pad([5])],20).mode,0);
  input.poll([pad()],30);assert.equal(input.poll([pad([14])],40).mode,-1);
  input.poll([pad()],50);assert.equal(input.poll([pad([13])],60).menu,1);
  assert.equal(input.poll([pad([13])],80).menu,0);assert.equal(input.poll([pad([13])],310).menu,1);
  assert.equal(input.poll([pad([1])],320).cancel,true);
});

test('shot and hit vibration use different strength and stop on pause/disconnect',async()=>{
  const calls=[];let resets=0;
  const p=pad();p.vibrationActuator={effects:['dual-rumble'],playEffect:async(type,params)=>calls.push({type,params}),reset:async()=>resets++};
  const input=new GamepadInput();input.poll([p],0);
  assert.equal(await input.rumble(false),true);assert.equal(await input.rumble(true),true);
  assert.equal(calls[0].type,'dual-rumble');assert.ok(calls[1].params.strongMagnitude>calls[0].params.strongMagnitude);
  assert.ok(calls[1].params.duration<160);input.suspend();assert.equal(resets,1);
  input.poll([],20);assert.equal(resets,2);assert.equal(await input.rumble(true),false);
});
test('unsupported or rejected vibration never breaks input',async()=>{
  const input=new GamepadInput();input.poll([pad()],0);assert.equal(await input.rumble(true),false);
  const p=pad();p.vibrationActuator={playEffect:async()=>{throw new Error('unsupported');},reset:()=>{throw new Error('disconnected');}};
  input.poll([p],10);assert.equal(await input.rumble(true),false);assert.doesNotThrow(()=>input.suspend());
});
