// Imported functional tests updated for delivered V41 defaults and balance.
// Obsolete draft SPEC.md equality checks are excluded; runtime code is unchanged.
/* ============================================================================
 * 临时验证脚本：在 Node 里 stub localStorage / window / AudioContext，
 * 加载 work/src/js/store.js 并验证 Store / AudioFX 的核心行为。
 * 用法：node team/core/verify-store.js
 * 说明：仅开发期自测使用，不属于运行时依赖，也不会被构建内联。
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const STORE_PATH = path.resolve(__dirname, '..', 'src', 'js', 'store.js');
const SOURCE = fs.readFileSync(STORE_PATH, 'utf8');

const SETTINGS_KEY = 'aimlab.web.settings.v1';
const RECORDS_KEY = 'aimlab.web.records.v1';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS  ' + name);
  } catch (error) {
    failures.push({ name, error });
    console.log('FAIL  ' + name + '  ->  ' + (error && error.message));
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((label || 'value') + ': expected ' + e + ', got ' + a);
}

function ok(value, label) {
  if (!value) throw new Error('expected truthy: ' + (label || ''));
}

function throwsNothing(fn, label) {
  try {
    return fn();
  } catch (error) {
    throw new Error((label || 'call') + ' threw: ' + (error && error.message));
  }
}

/* ---------------------------- 浏览器 API stub ---------------------------- */

let audioContextCount = 0;
const audioContextInstances = [];

function makeParam(value) {
  return {
    value,
    setValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime(v) {
      if (!(v > 0)) throw new Error('exponential ramp target must be > 0, got ' + v);
      this.value = v;
    },
    setTargetAtTime(v) { this.value = v; },
    cancelScheduledValues() {},
  };
}

function FakeNode() {
  this.gain = makeParam(1);
  this.frequency = makeParam(440);
  this.type = 'sine';
  this.onended = null;
}
FakeNode.prototype.connect = function () {};
FakeNode.prototype.disconnect = function () {};
FakeNode.prototype.start = function () {};
FakeNode.prototype.stop = function () {};

function FakeAudioContext() {
  audioContextCount++;
  audioContextInstances.push(this);
  this.state = 'running';
  this.currentTime = 1;
  this.destination = new FakeNode();
  this.oscillators = 0;
}
FakeAudioContext.prototype.createGain = function () { return new FakeNode(); };
FakeAudioContext.prototype.createOscillator = function () {
  this.oscillators++;
  return new FakeNode();
};
FakeAudioContext.prototype.createDynamicsCompressor = function () {
  const node = new FakeNode();
  node.threshold = makeParam(-16);
  node.knee = makeParam(20);
  node.ratio = makeParam(6);
  node.attack = makeParam(0.003);
  node.release = makeParam(0.25);
  return node;
};
FakeAudioContext.prototype.resume = function () {
  this.state = 'running';
  return Promise.resolve();
};

function makeSuspendedAudioContextClass() {
  function SuspendedAudioContext() {
    FakeAudioContext.call(this);
    this.state = 'suspended';
    this.resumeCalls = 0;
  }
  SuspendedAudioContext.prototype = Object.create(FakeAudioContext.prototype);
  SuspendedAudioContext.prototype.constructor = SuspendedAudioContext;
  SuspendedAudioContext.prototype.resume = function () {
    this.resumeCalls++;
    this.state = 'running';
    return Promise.resolve();
  };
  return SuspendedAudioContext;
}

function FakeStorage() {
  this.map = new Map();
  this.failWrites = false;
}
FakeStorage.prototype.getItem = function (key) {
  return this.map.has(key) ? this.map.get(key) : null;
};
FakeStorage.prototype.setItem = function (key, value) {
  if (this.failWrites) throw new Error('QuotaExceededError');
  this.map.set(key, String(value));
};
FakeStorage.prototype.removeItem = function (key) { this.map.delete(key); };
FakeStorage.prototype.clear = function () { this.map.clear(); };

function createEnv(options) {
  const opts = options || {};
  const storage = opts.storage || new FakeStorage();
  const windowObj = { localStorage: storage };

  if (opts.noAudio !== true) {
    windowObj.AudioContext = opts.suspendedAudio ? makeSuspendedAudioContextClass() : FakeAudioContext;
  }
  if (opts.throwingStorage) {
    Object.defineProperty(windowObj, 'localStorage', {
      configurable: true,
      get() { throw new Error('SecurityError: localStorage is disabled'); },
    });
  }

  const sandbox = { window: windowObj, console };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'store.js' });

  return {
    sandbox,
    storage,
    windowObj,
    Store: vm.runInContext('Store', sandbox),
    AudioFX: vm.runInContext('AudioFX', sandbox),
    MODES: vm.runInContext('MODES', sandbox),
  };
}

function storedJSON(env, key) {
  const text = env.storage.getItem(key);
  if (text === null) return null;
  return JSON.parse(text);
}


/* ============================ 1. 源码静态检查 ============================ */

test('源码无 console 输出 / fetch / </script> / import-export', () => {
  ok(!/console\./.test(SOURCE), 'console 调用');
  ok(!/\bfetch\s*\(/.test(SOURCE), 'fetch 调用');
  ok(SOURCE.indexOf('</' + 'script>') < 0, '脚本结束标签字符串');
  ok(!/^\s*(import|export)\s/m.test(SOURCE), '模块语法');
  ok(SOURCE.indexOf('aimlab.web.settings.v1') >= 0, 'settings key');
  ok(SOURCE.indexOf('aimlab.web.records.v1') >= 0, 'records key');
});

/* ============================== 2. MODES ================================ */

test('MODES：6 个模式、顺序/字段/关键数值正确', () => {
  const env = createEnv();
  const modes = plain(env.MODES);
  eq(modes.length, 6, 'modes.length');
  eq(modes.map((m) => m.id), ['gridshot', 'spidershot', 'motion', 'flick', 'tracking', 'precision'], 'id 顺序');
  eq(modes.map((m) => m.index), ['01', '02', '03', '04', '05', '06'], 'index');
  eq(modes.map((m) => m.en), ['GRIDSHOT', 'SPIDERSHOT', 'MOTION SHOT', 'FLICKSHOT', 'TRACKING', 'PRECISION'], 'en');
  eq(modes.map((m) => m.name), ['网格速射', '蜘蛛速射', '动态速射', '甩枪训练', '跟枪训练', '微操精准'], 'name');
  eq(modes.map((m) => m.duration), [60, 60, 60, 45, 30, 45], 'duration');
  eq(modes.map((m) => m.accent), ['#2ce8ff', '#a78bfa', '#c4f74c', '#ffb454', '#ff63a9', '#7c9dff'], 'accent');
  eq(modes.map((m) => m.base), [100, 120, 150, 180, 120, 240], 'base');
  eq(modes.map((m) => m.thresholds), [
    { S: 22000, A: 16000, B: 10000, C: 5000 },
    { S: 26000, A: 19000, B: 12000, C: 6000 },
    { S: 24000, A: 17500, B: 11500, C: 6000 },
    { S: 17000, A: 12500, B: 8000, C: 4000 },
    { S: 8000, A: 6200, B: 4500, C: 2500 },
    { S: 22000, A: 16000, B: 10000, C: 5000 },
  ], 'thresholds');
  const labelKeys = ['accuracy', 'hits', 'misses', 'ttk', 'streak', 'rate'];
  modes.forEach((mode, i) => {
    ok(mode.tagline && mode.desc && mode.tip, '文案字段 ' + i);
    eq(Object.keys(mode.labels).sort(), labelKeys.slice().sort(), 'labels keys ' + mode.id);
    ok(typeof mode.labels.accuracy === 'string' && mode.labels.accuracy.length > 0, 'labels.accuracy ' + i);
  });
  eq(modes[4].labels.hits, '在靶时间', 'tracking hits label');
  eq(modes[3].labels.ttk, '平均反应', 'flick ttk label');
  ok(env.Store.MODES.length === 6, 'Store.MODES');
  eq(plain(env.Store.mode('motion')).id, 'motion', 'mode()');
  ok(env.Store.mode('nope') === null, 'mode() 未知返回 null');
  ok(env.Store.mode() === null, 'mode() 无参返回 null');
});




/* ========================= 3. 默认设置 / init ========================== */

test('默认设置与记录结构符合 SPEC 4.1/4.2', () => {
  const env = createEnv();
  const settings = plain(env.Store.settings);
  eq(settings.version, 1, 'version');
  eq(settings.aimMode, 'relative', 'aimMode');
  eq(settings.sensitivity, 1.0, 'sensitivity');
  eq(settings.targetScale, 1.0, 'targetScale');
  eq(settings.effects, true, 'effects');
  eq(settings.crosshair, {
    style: 'cross', color: '#2ce8ff', size: 14, thickness: 2,
    gap: 4, opacity: 0.95, outline: true,
  }, 'crosshair');
  eq(settings.audio, { enabled: false, volume: 0.7 }, 'audio');
  eq(settings.lastMode, 'gridshot', 'lastMode');
  eq(plain(env.Store.records), { version: 1, bests: {}, history: [] }, 'records');
});

test('init()：空存储返回 false，默认值就位且不脏写', () => {
  const env = createEnv();
  eq(throwsNothing(() => env.Store.init(), 'init'), false, 'init 返回值');
  eq(env.storage.getItem(SETTINGS_KEY), null, 'init 不应写 settings');
  eq(env.storage.getItem(RECORDS_KEY), null, 'init 不应写 records');
  eq(env.Store.settings.sensitivity, 1, 'sensitivity');
});

test('init()：损坏 JSON 不崩溃并回退默认值', () => {
  const env = createEnv();
  env.storage.setItem(SETTINGS_KEY, '{ this is not json');
  env.storage.setItem(RECORDS_KEY, '[[[broken');
  eq(throwsNothing(() => env.Store.init(), 'init'), true, '有存档标记');
  eq(env.Store.settings.sensitivity, 1, 'settings 回退');
  eq(plain(env.Store.records), { version: 1, bests: {}, history: [] }, 'records 回退');
});

test('init()：越界数值 / 非法枚举被修正', () => {
  const env = createEnv();
  env.storage.setItem(SETTINGS_KEY, JSON.stringify({
    version: 1,
    aimMode: 'weird-mode',
    sensitivity: 99,
    targetScale: 0.1,
    effects: 'nope',
    crosshair: {
      style: 'bogus', color: 'red', size: 999, thickness: 0,
      gap: -5, opacity: 2, outline: 'x',
    },
    audio: { enabled: 'yes', volume: 5 },
    lastMode: 'unknown-mode',
  }));
  env.Store.init();
  const settings = plain(env.Store.settings);
  eq(settings.aimMode, 'relative', 'aimMode 回退');
  eq(settings.sensitivity, 3, 'sensitivity clamp 上限');
  eq(settings.targetScale, 0.7, 'targetScale clamp 下限');
  eq(settings.effects, true, 'effects 回退默认');
  eq(settings.crosshair.style, 'cross', 'style 回退');
  eq(settings.crosshair.color, '#2ce8ff', 'color 回退');
  eq(settings.crosshair.size, 30, 'size clamp');
  eq(settings.crosshair.thickness, 1, 'thickness clamp');
  eq(settings.crosshair.gap, 0, 'gap clamp');
  eq(settings.crosshair.opacity, 1, 'opacity clamp');
  eq(settings.crosshair.outline, true, 'outline 回退');
  eq(settings.audio.enabled, false, 'audio.enabled 回退');
  eq(settings.audio.volume, 1, 'audio.volume clamp');
  eq(settings.lastMode, 'gridshot', 'lastMode 回退');
});

test('init()：合法存档被读取（新上下文）', () => {
  const storage = new FakeStorage();
  const first = createEnv({ storage });
  first.Store.updateSettings({ sensitivity: 2.25, crosshair: { size: 22 }, lastMode: 'flick' });
  first.Store.recordRun({ modeId: 'flick', score: 6000, accuracy: 75, hits: 20, shots: 30, bestCombo: 9 });

  const second = createEnv({ storage });
  eq(second.Store.init(), true, 'init 返回 true');
  eq(second.Store.settings.sensitivity, 2.25, 'sensitivity 持久化');
  eq(second.Store.settings.crosshair.size, 22, 'crosshair.size 持久化');
  eq(second.Store.settings.lastMode, 'flick', 'lastMode 持久化');
  eq(second.Store.records.bests.flick.score, 6000, 'best 持久化');
  eq(second.Store.records.history.length, 1, 'history 持久化');
});

/* ======================= 4. saveSettings/updateSettings ================= */

test('updateSettings()：深合并、落盘、返回 settings 引用', () => {
  const env = createEnv();
  env.Store.init();
  const returned = throwsNothing(() => env.Store.updateSettings({
    sensitivity: 1.5,
    crosshair: { size: 20 },
  }), 'updateSettings');
  ok(returned === env.Store.settings, '返回 live settings');
  eq(env.Store.settings.sensitivity, 1.5, 'sensitivity 更新');
  eq(env.Store.settings.crosshair.size, 20, '嵌套更新');
  eq(env.Store.settings.crosshair.color, '#2ce8ff', '嵌套其余字段保留');
  eq(env.Store.settings.crosshair.thickness, 2, '嵌套其余字段保留 2');
  eq(env.Store.settings.audio.volume, 0.7, 'audio 不受影响');
  const saved = storedJSON(env, SETTINGS_KEY);
  eq(saved.sensitivity, 1.5, '落盘 sensitivity');
  eq(saved.crosshair.size, 20, '落盘 crosshair.size');
});

test('updateSettings()：非法补丁保留旧值，越界补丁被 clamp', () => {
  const env = createEnv();
  env.Store.updateSettings({ sensitivity: 1.5 });
  env.Store.updateSettings({ sensitivity: 'abc', aimMode: 'bogus', lastMode: 'nope' });
  eq(env.Store.settings.sensitivity, 1.5, '非法数值保留旧值');
  eq(env.Store.settings.aimMode, 'relative', '非法枚举保留旧值');
  eq(env.Store.settings.lastMode, 'gridshot', '非法 lastMode 保留旧值');
  env.Store.updateSettings({ sensitivity: 99, targetScale: -3, crosshair: { gap: 999 } });
  eq(env.Store.settings.sensitivity, 3, 'sensitivity clamp');
  eq(env.Store.settings.targetScale, 0.7, 'targetScale clamp');
  eq(env.Store.settings.crosshair.gap, 14, 'gap clamp');
});

test('updateSettings()：audio 变更同步 AudioFX 与存储', () => {
  const env = createEnv();
  env.Store.init();
  env.Store.updateSettings({ audio: { enabled: false, volume: 0.25 } });
  eq(env.Store.settings.audio, { enabled: false, volume: 0.25 }, 'settings.audio');
  eq(env.AudioFX.play('hit'), false, '静音后 play 返回 false');
  eq(storedJSON(env, SETTINGS_KEY).audio, { enabled: false, volume: 0.25 }, '落盘 audio');
  env.Store.updateSettings({ audio: { enabled: true } });
  eq(env.AudioFX.play('hit'), true, '重新开启后 play 发声');
});

test('saveSettings()：成功 true / 存储故障 false，且不抛错', () => {
  const env = createEnv();
  eq(env.Store.saveSettings(), true, '正常保存');
  ok(storedJSON(env, SETTINGS_KEY) !== null, '已落盘');
  env.storage.failWrites = true;
  eq(env.Store.saveSettings(), false, '写入失败返回 false');
  env.storage.failWrites = false;

  const broken = createEnv({ throwingStorage: true });
  eq(throwsNothing(() => broken.Store.saveSettings(), 'saveSettings'), false, 'localStorage 抛错时返回 false');
});

/* ============================= 5. recordRun ============================= */

test('recordRun()：首条记录更新 best 并写入 history', () => {
  const env = createEnv();
  env.Store.init();
  const result = plain(env.Store.recordRun({
    modeId: 'gridshot', score: 12000, accuracy: 88.5, grade: 'B',
    hits: 100, shots: 120, bestCombo: 15,
    date: '2026-10-18T00:00:00.000Z',
  }));
  eq(result.isBest, true, 'isBest');
  eq(result.previousBest, 0, 'previousBest');
  eq(result.best, {
    score: 12000, accuracy: 88.5, grade: 'B', bestCombo: 15,
    date: '2026-10-18T00:00:00.000Z',
  }, 'best');
  eq(plain(env.Store.records.bests.gridshot).score, 12000, 'records.bests 更新');
  const entry = plain(env.Store.records.history[0]);
  eq(entry, {
    modeId: 'gridshot', score: 12000, accuracy: 88.5, grade: 'B',
    hits: 100, shots: 120, date: '2026-10-18T00:00:00.000Z',
  }, 'history entry');
  ok(storedJSON(env, RECORDS_KEY) !== null, 'records 已落盘');
});

test('recordRun()：分数不更高时不覆盖 best，但 history 记入', () => {
  const env = createEnv();
  env.Store.recordRun({ modeId: 'gridshot', score: 12000, accuracy: 90, hits: 100, shots: 120, bestCombo: 15 });
  const second = plain(env.Store.recordRun({ modeId: 'gridshot', score: 9000, accuracy: 70, hits: 70, shots: 100, bestCombo: 8 }));
  eq(second.isBest, false, 'isBest');
  eq(second.previousBest, 12000, 'previousBest');
  eq(second.best.score, 12000, 'best 保持');
  eq(env.Store.records.history.length, 2, 'history 两条');
  eq(plain(env.Store.records.history[0]).score, 9000, '最新在前');
  eq(plain(env.Store.records.history[1]).score, 12000, '旧记录在后');
});

test('recordRun()：更高分更新 best，缺失 grade 时自动评级', () => {
  const env = createEnv();
  env.Store.recordRun({ modeId: 'gridshot', score: 12000, accuracy: 80, hits: 90, shots: 120 });
  const third = plain(env.Store.recordRun({ modeId: 'gridshot', score: 20000, accuracy: 95, hits: 150, shots: 160, bestCombo: 40 }));
  eq(third.isBest, true, 'isBest');
  eq(third.previousBest, 12000, 'previousBest');
  eq(third.best.score, 20000, 'best 更新');
  eq(third.best.grade, 'A', '自动评级 20000 = A');
  eq(plain(env.Store.records.bests.gridshot).grade, 'A', 'bests.grade');
});

test('recordRun()：防御空 summary / 缺字段 / 未知模式', () => {
  const env = createEnv();
  eq(throwsNothing(() => env.Store.recordRun(null), 'recordRun(null)'), { isBest: false, previousBest: 0, best: null }, 'null');
  eq(env.Store.recordRun(undefined), { isBest: false, previousBest: 0, best: null }, 'undefined');
  eq(env.Store.recordRun({}), { isBest: false, previousBest: 0, best: null }, '空对象');
  eq(env.Store.recordRun({ modeId: 'not-a-mode', score: 1 }), { isBest: false, previousBest: 0, best: null }, '未知模式');
  eq(env.Store.records.history.length, 0, '非法 summary 不写 history');

  const partial = plain(env.Store.recordRun({ modeId: 'flick', score: 5000, hits: 8, shots: 10 }));
  eq(partial.isBest, true, '部分字段 isBest');
  eq(partial.best.accuracy, 0, '缺失 accuracy = 0');
  eq(partial.best.grade, 'C', '缺失 grade 自动评级 flick 5000 = C');
  ok(typeof partial.best.date === 'string' && !isNaN(Date.parse(partial.best.date)), 'date 兜底 ISO');
  const badNums = plain(env.Store.recordRun({
    modeId: 'precision', score: 'not-a-number', accuracy: 999, hits: -5, shots: 'x', bestCombo: -1,
  }));
  eq(badNums.isBest, false, 'score 非法当 0，不覆盖已有 best');
  const lastEntry = plain(env.Store.records.history[0]);
  eq(lastEntry.score, 0, 'score 兜底 0');
  eq(lastEntry.accuracy, 100, 'accuracy clamp 100');
  eq(lastEntry.hits, 0, 'hits 兜底 0');
  eq(lastEntry.grade, 'D', 'grade 自动 D');
});

test('recordRun()：history 最新在前且最多 40 条', () => {
  const env = createEnv();
  for (let i = 1; i <= 50; i++) {
    env.Store.recordRun({ modeId: 'gridshot', score: i * 100, accuracy: 50, hits: i, shots: i + 5 });
  }
  eq(env.Store.records.history.length, 40, '上限 40');
  eq(plain(env.Store.records.history[0]).score, 5000, '最新在前');
  eq(plain(env.Store.records.history[39]).score, 1100, '最旧保留第 11 条');
  eq(storedJSON(env, RECORDS_KEY).history.length, 40, '落盘也是 40');
});

test('recordRun()：不同模式 best 互不影响', () => {
  const env = createEnv();
  env.Store.recordRun({ modeId: 'gridshot', score: 10000, accuracy: 80, hits: 10, shots: 20 });
  env.Store.recordRun({ modeId: 'tracking', score: 2000, accuracy: 60, hits: 5, shots: 5 });
  eq(Object.keys(plain(env.Store.records.bests)).sort(), ['gridshot', 'tracking'], 'bests 两个模式');
  eq(plain(env.Store.records.bests.gridshot).score, 10000, 'gridshot best');
  eq(plain(env.Store.records.bests.tracking).score, 2000, 'tracking best');
});

/* ==================== 6. stats / recent / topRuns / storageKB =========== */

test('stats()/recent()/topRuns()/storageKB()', () => {
  const env = createEnv();
  env.Store.recordRun({ modeId: 'gridshot', score: 12000, accuracy: 90, hits: 100, shots: 110 });
  env.Store.recordRun({ modeId: 'flick', score: 6000, accuracy: 60, hits: 20, shots: 40 });
  env.Store.recordRun({ modeId: 'gridshot', score: 8000, accuracy: 80, hits: 50, shots: 70 });

  const stats = plain(env.Store.stats());
  eq(stats.runs, 3, 'runs');
  eq(stats.bestScore, 12000, 'bestScore');
  eq(stats.totalHits, 170, 'totalHits');
  eq(stats.avgAccuracy.toFixed(4), ((90 + 60 + 80) / 3).toFixed(4), 'avgAccuracy');

  eq(plain(env.Store.recent()).length, 3, 'recent 默认');
  eq(plain(env.Store.recent(2)).length, 2, 'recent(2)');
  eq(plain(env.Store.recent(0)), [], 'recent(0)');
  eq(plain(env.Store.recent(999)).length, 3, 'recent 超出长度');

  const top = plain(env.Store.topRuns());
  eq(top.map((item) => item.modeId), ['gridshot', 'flick'], 'topRuns 按分数降序');
  eq(top[0].score, 12000, 'topRuns 分数');
  ok(top[0].accuracy === 90 && typeof top[0].grade === 'string', 'topRuns 字段');
  eq(plain(env.Store.topRuns(1)).length, 1, 'topRuns(1)');

  const kb = env.Store.storageKB();
  ok(typeof kb === 'number' && isFinite(kb), 'storageKB 数字');
  eq(Math.round(kb * 10) / 10, kb, 'storageKB 1 位小数');
  ok(kb > 0, '有数据时大于 0');
});

test('clearRecords()/resetAll()', () => {
  const env = createEnv();
  env.Store.recordRun({ modeId: 'gridshot', score: 10000, accuracy: 80, hits: 10, shots: 20 });
  env.Store.updateSettings({ sensitivity: 2 });
  eq(env.Store.clearRecords(), true, 'clearRecords 返回');
  eq(plain(env.Store.stats()), { runs: 0, bestScore: 0, avgAccuracy: 0, totalHits: 0 }, '清空后 stats');
  eq(plain(env.Store.records.bests), {}, 'bests 清空');
  eq(storedJSON(env, RECORDS_KEY).history.length, 0, '落盘清空');
  eq(env.Store.settings.sensitivity, 2, 'clearRecords 不影响设置');

  eq(env.Store.resetAll(), true, 'resetAll 返回');
  eq(env.Store.settings.sensitivity, 1, 'resetAll 恢复设置');
  eq(env.Store.records.history.length, 0, 'resetAll 清空记录');
});

test('resetSettings()：恢复默认并落盘', () => {
  const env = createEnv();
  env.Store.updateSettings({ sensitivity: 2.5, crosshair: { style: 'dot' }, audio: { volume: 0.1 } });
  eq(env.Store.resetSettings(), true, 'resetSettings 返回');
  eq(plain(env.Store.settings), plain(storedJSON(env, SETTINGS_KEY)), '内存与存储一致');
  eq(env.Store.settings.sensitivity, 1, 'sensitivity 默认');
  eq(env.Store.settings.crosshair.style, 'cross', 'crosshair 默认');
  eq(env.Store.settings.audio.volume, 0.7, 'audio 默认');
});

/* ========================= 7. 通用工具函数 ============================= */

test('clamp/lerp/rand/randInt/pick/shuffle', () => {
  const env = createEnv();
  const S = env.Store;
  eq(S.clamp(5, 0, 3), 3, 'clamp 上限');
  eq(S.clamp(-1, 0, 3), 0, 'clamp 下限');
  eq(S.clamp(0.5, 0, 1), 0.5, 'clamp 区间内');
  eq(S.clamp('x', 0, 10), 0, 'clamp 非法值');
  eq(S.lerp(0, 10, 0.5), 5, 'lerp');
  eq(S.lerp(10, 0, 0.25), 7.5, 'lerp 反向');

  for (let i = 0; i < 200; i++) {
    const value = S.rand(2, 4);
    ok(value >= 2 && value <= 4, 'rand 范围');
    const single = S.rand(5);
    ok(single >= 0 && single <= 5, 'rand 单参范围');
  }
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const value = S.randInt(1, 3);
    ok(Number.isInteger(value) && value >= 1 && value <= 3, 'randInt 范围');
    seen.add(value);
  }
  eq(Array.from(seen).sort(), [1, 2, 3], 'randInt 覆盖');
  eq(S.randInt(1, 1), 1, 'randInt 单点');

  eq(S.pick([]), undefined, 'pick 空数组');
  eq(S.pick([7]), 7, 'pick 单元素');
  ok([1, 2, 3].indexOf(S.pick([1, 2, 3])) >= 0, 'pick 结果');
  const source = [1, 2, 3, 4, 5];
  const shuffled = S.shuffle(source);
  eq(source, [1, 2, 3, 4, 5], 'shuffle 不修改原数组');
  eq(shuffled.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5], 'shuffle 元素一致');
  eq(Array.from(S.shuffle([])), [], 'shuffle 空数组');
});

test('fmtScore/fmtPct/fmtTime/escapeHtml', () => {
  const env = createEnv();
  const S = env.Store;
  eq(S.fmtScore(12345), '12,345', 'fmtScore');
  eq(S.fmtScore(999), '999', 'fmtScore 999');
  eq(S.fmtScore(0), '0', 'fmtScore 0');
  eq(S.fmtScore(1000), '1,000', 'fmtScore 1000');
  eq(S.fmtScore(1234567), '1,234,567', 'fmtScore 百万');
  eq(S.fmtScore(-1500), '-1,500', 'fmtScore 负数');
  eq(S.fmtScore('abc'), '0', 'fmtScore 非法');
  eq(S.fmtPct(87.345), '87.3', 'fmtPct 默认 1 位');
  eq(S.fmtPct(100), '100.0', 'fmtPct 100');
  eq(S.fmtPct(50, 0), '50', 'fmtPct 0 位');
  eq(S.fmtPct('abc'), '0.0', 'fmtPct 非法');
  eq(S.fmtTime(12.34), '12.3', 'fmtTime');
  eq(S.fmtTime(60), '60.0', 'fmtTime 60');
  eq(S.fmtTime(-5), '0.0', 'fmtTime 负数');
  eq(S.fmtTime('x'), '0.0', 'fmtTime 非法');
  eq(S.escapeHtml('<b>"x"&</b>'), '&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;', 'escapeHtml');
  eq(S.escapeHtml("it's"), 'it&#39;s', 'escapeHtml 单引号');
  eq(S.escapeHtml(null), '', 'escapeHtml null');
  eq(S.escapeHtml(undefined), '', 'escapeHtml undefined');
});

test('timeAgo()：刚刚 / 分钟前 / 昨天 / M/D', () => {
  const env = createEnv();
  const S = env.Store;
  eq(S.timeAgo(new Date().toISOString()), '刚刚', '现在');
  eq(S.timeAgo(Date.now() - 5000), '刚刚', '5 秒前');
  eq(S.timeAgo(Date.now() - 3 * 60000), '3 分钟前', '3 分钟前');
  eq(S.timeAgo(Date.now() - 59 * 60000), '59 分钟前', '59 分钟前');
  eq(S.timeAgo(''), '--', '空字符串');
  eq(S.timeAgo('not-a-date'), '--', '非法日期');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);
  eq(S.timeAgo(yesterday.toISOString()), '昨天', '昨天');

  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - 5);
  ok(/^\d{1,2}\/\d{1,2}$/.test(S.timeAgo(daysAgo.toISOString())), '更早显示 M/D: ' + S.timeAgo(daysAgo.toISOString()));

  const oneHourAgo = S.timeAgo(Date.now() - 3600000);
  ok(oneHourAgo === '昨天' || /^\d+ 小时前$/.test(oneHourAgo), '1 小时前: ' + oneHourAgo);
});

/* ============================ 8. 评级 ================================== */

test('gradeFor()：阈值边界与 mode id 字符串', () => {
  const env = createEnv();
  const S = env.Store;
  const gridshot = S.mode('gridshot');
  eq(S.gradeFor(22000, gridshot), 'S', 'S 边界');
  eq(S.gradeFor(21999, gridshot), 'A', 'S-1');
  eq(S.gradeFor(16000, gridshot), 'A', 'A 边界');
  eq(S.gradeFor(15999, gridshot), 'B', 'A-1');
  eq(S.gradeFor(10000, gridshot), 'B', 'B 边界');
  eq(S.gradeFor(9999, gridshot), 'C', 'B-1');
  eq(S.gradeFor(5000, gridshot), 'C', 'C 边界');
  eq(S.gradeFor(4999, gridshot), 'D', 'C-1');
  eq(S.gradeFor(0, gridshot), 'D', '0 分');
  eq(S.gradeFor(25000, 'spidershot'), 'A', 'mode id 字符串');
  eq(S.gradeFor(17000, 'flick'), 'S', 'flick S 边界');
  eq(S.gradeFor(16999, 'flick'), 'A', 'flick S-1');
  eq(S.gradeFor(99999, 'tracking'), 'S', 'tracking S');
  eq(S.gradeFor(12345, null), 'D', '无模式 D');
  eq(S.gradeFor(22000, { thresholds: { S: 22000, A: 16000, B: 10000, C: 5000 } }), 'S', '直接传 thresholds');
});

test('nextGrade()：评级 / 下一档 / 差值 / 档内进度', () => {
  const env = createEnv();
  const S = env.Store;
  const gridshot = S.mode('gridshot');

  eq(plain(S.nextGrade(0, gridshot)), { grade: 'D', next: 'C', need: 5000, progress: 0 }, 'D 起点');
  const lowD = plain(S.nextGrade(2000, gridshot));
  eq(lowD.grade, 'D', '2000 评级');
  eq(lowD.next, 'C', '2000 下一档');
  eq(lowD.need, 3000, '2000 差值');
  ok(Math.abs(lowD.progress - 0.4) < 1e-9, '2000 进度 0.4');

  eq(plain(S.nextGrade(5000, gridshot)), { grade: 'C', next: 'B', need: 5000, progress: 0 }, 'C 起点');
  const b = plain(S.nextGrade(15000, gridshot));
  eq(b.grade, 'B', '15000 评级');
  eq(b.next, 'A', '15000 下一档');
  eq(b.need, 1000, '15000 差值');
  ok(Math.abs(b.progress - 5000 / 6000) < 1e-9, '15000 进度');

  const a = plain(S.nextGrade(21999, gridshot));
  eq(a.grade, 'A', '21999 评级');
  eq(a.next, 'S', '21999 下一档');
  eq(a.need, 1, '21999 差值');
  ok(Math.abs(a.progress - 5999 / 6000) < 1e-9, '21999 进度');

  eq(plain(S.nextGrade(22000, gridshot)), { grade: 'S', next: null, need: 0, progress: 1 }, 'S 封顶');
  eq(plain(S.nextGrade(99999, gridshot)), { grade: 'S', next: null, need: 0, progress: 1 }, 'S 高分');
  const unknown = plain(S.nextGrade(100, null));
  eq(unknown.grade, 'D', '未知模式评级');
  eq(unknown.next, null, '未知模式无下一档');
  eq(unknown.need, 0, '未知模式 need');
});

/* ============================ 9. AudioFX =============================== */

test('AudioFX：unlock 幂等、九种音效、音量/开关同步', () => {
  const env = createEnv();
  eq(env.AudioFX.play('hit'), false, '默认静音');
  env.AudioFX.setEnabled(true);
  const before = audioContextCount;

  eq(env.AudioFX.unlock(), true, 'unlock 成功');
  eq(audioContextCount, before + 1, '创建一个 AudioContext');
  eq(env.AudioFX.unlock(), true, 'unlock 再次调用');
  eq(audioContextCount, before + 1, 'unlock 幂等，不重复创建');

  const names = ['click', 'hit', 'miss', 'combo', 'countdown', 'go', 'finish', 'record', 'toggle'];
  names.forEach((name) => eq(env.AudioFX.play(name), true, 'play ' + name));
  eq(env.AudioFX.play('unknown-sound'), false, '未知音效返回 false');
  eq(audioContextCount, before + 1, 'play 不重复创建 AudioContext');

  eq(env.AudioFX.setEnabled(false), false, 'setEnabled(false) 返回');
  eq(env.Store.settings.audio.enabled, false, '写回 Store.settings');
  eq(storedJSON(env, SETTINGS_KEY).audio.enabled, false, '静音落盘');
  eq(env.AudioFX.play('hit'), false, '静音后 play 静默');

  eq(env.AudioFX.setEnabled(true), true, 'setEnabled(true) 返回');
  eq(env.AudioFX.play('hit'), true, '恢复后 play');

  eq(env.AudioFX.setVolume(0.5), 0.5, 'setVolume 返回');
  eq(env.Store.settings.audio.volume, 0.5, '音量写回 settings');
  eq(storedJSON(env, SETTINGS_KEY).audio.volume, 0.5, '音量落盘');
  eq(env.AudioFX.setVolume(5), 1, '音量上限 clamp');
  eq(env.AudioFX.setVolume(-2), 0, '音量下限 clamp');

  eq(env.AudioFX.test(), true, 'test() 返回 true');
});

test('AudioFX：不支持 Web Audio 时全部静默 no-op', () => {
  const env = createEnv({ noAudio: true });
  eq(throwsNothing(() => env.AudioFX.unlock(), 'unlock'), false, 'unlock false');
  eq(throwsNothing(() => env.AudioFX.play('hit'), 'play'), false, 'play false');
  eq(throwsNothing(() => env.AudioFX.test(), 'test'), false, 'test false');
  eq(throwsNothing(() => env.AudioFX.setEnabled(false), 'setEnabled'), false, 'setEnabled false');
  eq(throwsNothing(() => env.AudioFX.setVolume(0.5), 'setVolume'), 0.5, 'setVolume 仍可写设置');
});

test('AudioFX：suspended 上下文会在 play 前 resume', () => {
  const env = createEnv({ suspendedAudio: true });
  env.AudioFX.setEnabled(true);
  eq(env.AudioFX.unlock(), true, 'unlock');
  const instance = audioContextInstances[audioContextInstances.length - 1];
  /* unlock 本身会 resume 一次；这里回到 suspended 再验证 play 前的 resume */
  instance.state = 'suspended';
  instance.resumeCalls = 0;
  eq(env.AudioFX.play('hit'), true, 'play');
  ok(instance.resumeCalls >= 1, 'play 前 resume 被调用: ' + instance.resumeCalls);
});

/* ==================== 10. localStorage 降级 / 无 window ================= */

test('localStorage 抛错时降级内存，不崩溃', () => {
  const env = createEnv({ throwingStorage: true });
  eq(throwsNothing(() => env.Store.init(), 'init'), false, 'init 返回 false');
  eq(throwsNothing(() => env.Store.saveSettings(), 'saveSettings'), false, 'saveSettings false');
  eq(throwsNothing(() => env.Store.updateSettings({ sensitivity: 2 }), 'updateSettings'), env.Store.settings, 'updateSettings 可用');
  eq(env.Store.settings.sensitivity, 2, '内存中生效');
  const result = throwsNothing(() => env.Store.recordRun({ modeId: 'gridshot', score: 1234, accuracy: 50, hits: 3, shots: 6 }), 'recordRun');
  eq(result.isBest, true, 'recordRun 内存可用');
  eq(plain(env.Store.stats()).runs, 1, '内存统计');
  ok(typeof env.Store.storageKB() === 'number', 'storageKB 数字');
});

test('没有 window / 没有 localStorage 时也能加载并工作', () => {
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'store.js' });
  const Store = vm.runInContext('Store', sandbox);
  const AudioFX = vm.runInContext('AudioFX', sandbox);
  eq(throwsNothing(() => Store.init(), 'init'), false, 'init false');
  eq(Store.settings.sensitivity, 1, '默认设置');
  eq(Store.saveSettings(), false, 'saveSettings false');
  eq(AudioFX.unlock(), false, 'AudioFX unlock false');
  eq(AudioFX.play('hit'), false, 'AudioFX play false');
  eq(plain(Store.recordRun({ modeId: 'motion', score: 100, accuracy: 50, hits: 1, shots: 2 }).isBest), true, 'recordRun');
});

/* ==================== 11. 公开 API 键与契约一致性 ====================== */

test('Store / AudioFX 公开 API 与 SPEC 5.1 契约完全对应', () => {
  const env = createEnv();
  const expectedStore = [
    'MODES', 'settings', 'records', 'init', 'saveSettings', 'updateSettings',
    'resetSettings', 'recordRun', 'clearRecords', 'resetAll', 'mode', 'stats',
    'recent', 'topRuns', 'storageKB', 'clamp', 'lerp', 'rand', 'randInt', 'pick',
    'shuffle', 'fmtScore', 'fmtPct', 'fmtTime', 'timeAgo', 'escapeHtml',
    'gradeFor', 'nextGrade',
  ];
  eq(Object.keys(env.Store).sort(), expectedStore.slice().sort(), 'Store 键集合');
  expectedStore.forEach((key) => {
    if (key === 'MODES' || key === 'settings' || key === 'records') return;
    eq(typeof env.Store[key], 'function', key + ' 是函数');
  });
  eq(Array.isArray(plain(env.Store.MODES)), true, 'Store.MODES 数组');
  eq(Object.keys(env.AudioFX).sort(), ['play', 'setEnabled', 'setVolume', 'test', 'unlock'], 'AudioFX 键集合');
  Object.keys(env.AudioFX).forEach((key) => eq(typeof env.AudioFX[key], 'function', 'AudioFX.' + key + ' 是函数'));
});

/* ============================== 汇总 =================================== */
console.log('');
if (failures.length === 0) {
  console.log('ALL PASS  (' + passed + ' tests)');
  process.exit(0);
}
console.log('FAILED ' + failures.length + ' / ' + (passed + failures.length) + ' tests');
failures.forEach((failure) => {
  console.log('--- ' + failure.name);
  console.log(failure.error && failure.error.stack ? failure.error.stack.split('\n').slice(0, 4).join('\n') : failure.error);
});
process.exit(1);
