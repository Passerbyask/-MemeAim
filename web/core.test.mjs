import test from 'node:test';
import assert from 'node:assert/strict';
import {Session,defaults,configKey,sanitizeSettings} from './core.mjs';

test('原项目计分规则：打空最低为零，命中连击，打空中断',()=>{
  const s=new Session('gridshot',defaults);s.shoot(false);assert.equal(s.score,0);
  s.shoot(true);s.shoot(true);s.shoot(false);
  assert.equal(s.score,1);assert.equal(s.accuracy,50);assert.equal(s.combo,0);assert.equal(s.maxCombo,2);
});
test('闪现目标到期不扣分，但清除连击并记录消失数',()=>{
  const s=new Session('flick',defaults);s.shoot(true);s.expire();assert.equal(s.score,1);assert.equal(s.combo,0);assert.equal(s.expired,1);assert.equal(s.shots,1);
});
test('倒计时归零后不再计分；提前结束的结果单独标记',()=>{
  const s=new Session('tracking',{...defaults,duration:10});s.tick(9.9);assert.equal(s.finished,false);s.tick(.2);assert.equal(s.remaining,0);s.shoot(true);assert.equal(s.hits,0);assert.equal(s.result().elapsed,10);assert.equal(s.result(false).completed,false);
});
test('排行榜配置隔离时长、靶球和瞄准方式，忽略无关选项',()=>{
  const a=configKey('gridshot',defaults);
  for(const change of [{duration:30},{radius:.5},{count:5},{control:'cursor'},{control:'gamepad'}])assert.notEqual(a,configKey('gridshot',{...defaults,...change}));
  assert.equal(a,configKey('gridshot',{...defaults,color:'#ffffff',speed:4}));
  assert.notEqual(configKey('flick',defaults),configKey('flick',{...defaults,lifetime:2}));
});
test('损坏或越界的持久化设置恢复为安全值',()=>{
  const s=sanitizeSettings({duration:999,radius:-4,count:2.7,sensitivity:NaN,control:'bad',sound:'false',volume:2});
  assert.equal(s.duration,180);assert.equal(s.radius,.15);assert.equal(s.count,3);assert.equal(s.sensitivity,1);assert.equal(s.control,'fps');assert.equal(s.sound,true);assert.equal(s.volume,1);
  const pad=sanitizeSettings({control:'gamepad',gamepadSensitivity:10,gamepadDeadzone:0});
  assert.equal(pad.control,'gamepad');assert.equal(pad.gamepadSensitivity,3);assert.equal(pad.gamepadDeadzone,.05);
  assert.equal(sanitizeSettings({}).gamepadDeadzone,.15);
});
