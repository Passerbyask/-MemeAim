import test from 'node:test';
import assert from 'node:assert/strict';
import {GyroState,parseDualSense} from './gyro.mjs';
import {StickStats} from './controller-lab.mjs';
import {defaults,sanitizeSettings,configKey} from './core.mjs';
test('DualSense USB and Bluetooth decode signed motion; basic Bluetooth is not motion',()=>{
  const usb=new DataView(new ArrayBuffer(63));usb.setInt16(15,164,true);usb.setInt16(17,-328,true);assert.deepEqual(parseDualSense(1,usb),{x:10,y:-20,z:0});
  const bt=new DataView(new ArrayBuffer(77));bt.setInt16(16,-164,true);assert.equal(parseDualSense(0x31,bt).x,-10);
  assert.equal(parseDualSense(1,new DataView(new ArrayBuffer(9))),null);assert.equal(parseDualSense(3,usb),null);
});
test('motion requires stationary calibration, stops when stale and respects activation',()=>{
  const state=new GyroState();const settings={...defaults,gyroEnabled:true};
  state.ingest({x:3,y:4,z:0},0);assert.equal(state.delta(0,.01,settings,true).yaw,0);
  state.calibrate(0);for(let n=0;n<=40;n++)state.ingest({x:3,y:4,z:0},n*50);
  assert.equal(state.calibrated,true);assert.deepEqual(state.corrected(),{x:0,y:0,z:0});
  state.ingest({x:13,y:24,z:30},2050);
  assert.ok(state.delta(2050,.01,settings,true).yaw<0);assert.equal(state.delta(2050,.01,settings,false).yaw,0);
  assert.equal(state.delta(2400,.01,settings,true).yaw,0);
  assert.equal(state.ingest({x:NaN,y:0,z:0},2500),false);
});
test('moving during calibration is rejected, reset clears the previous device bias',()=>{
  const state=new GyroState();state.calibrate(0);for(let n=0;n<=40;n++)state.ingest({x:n%2?10:-10,y:0,z:0},n*50);assert.equal(state.calibrated,false);state.reset();assert.equal(state.fresh(0),false);
});
test('interrupted calibration expires and cannot retain an old successful bias',()=>{
  const state=new GyroState();state.calibrated=true;state.calibrate(0);assert.equal(state.calibrated,false);
  for(let n=0;n<25;n++)state.ingest({x:0,y:0,z:0},n*30);
  state.tick(5100);assert.equal(state.calibration,null);assert.equal(state.calibrated,false);
  assert.match(state.notice,/中断/);
});
test('gyro direction, sensitivity and enabled scoring configuration are isolated',()=>{
  const state=new GyroState();state.calibrated=true;state.ingest({x:10,y:20,z:30},100);
  const settings={...defaults,control:'gamepad',gyroEnabled:true,gyroActivation:'always'};
  const a=state.delta(100,.01,settings,false),b=state.delta(100,.01,{...settings,gyroInvertX:true,gyroYawAxis:'z'},false);
  assert.ok(a.yaw<0&&b.yaw>0);assert.equal(a.pitch,b.pitch);
  assert.notEqual(configKey('gridshot',settings),configKey('gridshot',{...settings,gyroEnabled:false}));
  const safe=sanitizeSettings({gyroSensitivity:999,gyroYawAxis:'bad',gyroActivation:'bad',gyroEnabled:'true'});assert.equal(safe.gyroSensitivity,5);assert.equal(safe.gyroEnabled,false);
});
test('center drift measurement excludes movement after the sampling window',()=>{
  const stats=new StickStats();stats.startCenter(0);for(let n=0;n<40;n++)stats.update([.03,0,.06,0],n*50);stats.update([1,1,1,1],2100);
  assert.equal(stats.complete,true);assert.equal(stats.centerPeak[1],.06);assert.equal(stats.recommendation(),.08);
  assert.ok(stats.reach[0].some(v=>v>1));stats.reset();assert.equal(stats.complete,false);
});
