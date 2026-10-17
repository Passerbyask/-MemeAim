/* ============================================================================
 * AIMLAB WEB · js/store.js
 *
 * 本文件包含两层能力：
 *   1) Store   —— 模式索引、设置持久化、成绩记录、统计与格式化工具
 *   2) AudioFX —— 基于 Web Audio 实时合成的音效（不加载任何音频文件）
 *
 * 约定：
 *   · classic script，无模块加载、无外部资源、无网络请求、无 console 输出
 *   · 顶层暴露 const MODES / Store / AudioFX，后续脚本可直接访问
 *   · localStorage 缺失、被禁用、JSON 损坏时一律静默降级到内存，公开 API 不抛错
 * ========================================================================== */

/* ============================================================================
 * 一、MODES —— 六种训练模式配置
 * 顺序、字段、数值、文案严格遵循 SPEC 4.3，其它模块直接依赖，禁止改动
 * ========================================================================== */
const MODES = [
  { id:'gridshot', index:'01', en:'GRIDSHOT', name:'网格速射', duration:60,
    accent:'#2ce8ff', base:100, thresholds:{S:22000,A:16000,B:10000,C:5000},
    tagline:'经典三靶 · 点击效率',
    desc:'3×3 网格上保持三个靶点。稳住准星，用连击倍率把分数滚起来。',
    tip:'先求稳，再求快。命中靶心附近有额外加分。',
    labels:{ accuracy:'命中率', hits:'命中', misses:'失误', ttk:'平均 TTK', streak:'最高连击', rate:'每秒命中' } },
  { id:'spidershot', index:'02', en:'SPIDERSHOT', name:'蜘蛛速射', duration:60,
    accent:'#a78bfa', base:120, thresholds:{S:26000,A:19000,B:12000,C:6000},
    tagline:'四周散射 · 距离加成',
    desc:'靶点沿视野四周散射刷新，离中心越远，基础分越高。',
    tip:'不要只盯着中心。用余光扫外圈，优先处理远靶。',
    labels:{ accuracy:'命中率', hits:'命中', misses:'失误', ttk:'平均 TTK', streak:'最高连击', rate:'每秒命中' } },
  { id:'motion', index:'03', en:'MOTION SHOT', name:'动态速射', duration:60,
    accent:'#c4f74c', base:150, thresholds:{S:24000,A:17500,B:11500,C:6000},
    tagline:'移动靶 · 预判轨迹',
    desc:'三个目标持续横向游走并反弹。预判它的下一段路径，提前落点。',
    tip:'别追着靶尾打，瞄准它前方半个身位的位置。',
    labels:{ accuracy:'命中率', hits:'命中', misses:'失误', ttk:'平均 TTK', streak:'最高连击', rate:'每秒命中' } },
  { id:'flick', index:'04', en:'FLICKSHOT', name:'甩枪训练', duration:45,
    accent:'#ffb454', base:180, thresholds:{S:17000,A:12500,B:8000,C:4000},
    tagline:'单靶闪现 · 极限甩枪',
    desc:'每次只出现一个远距靶，留给你不到两秒。甩得越准越快，得分越高。',
    tip:'视线先到，手再到。用大臂带动，别只动手腕。',
    labels:{ accuracy:'命中率', hits:'命中', misses:'失误', ttk:'平均反应', streak:'最高连击', rate:'每秒命中' } },
  { id:'tracking', index:'05', en:'TRACKING', name:'跟枪训练', duration:30,
    accent:'#ff63a9', base:120, thresholds:{S:8000,A:6200,B:4500,C:2500},
    tagline:'黏住移动靶 · 持续锁定',
    desc:'不需要点击。把准星持续放在移动靶内，累积跟枪分数与连击。',
    tip:'用小幅度连续修正，不要等准星飞出去再拉回来。',
    labels:{ accuracy:'跟枪率', hits:'在靶时间', misses:'脱靶时间', ttk:'平均偏离', streak:'最高连击', rate:'得分效率' } },
  { id:'precision', index:'06', en:'PRECISION', name:'微操精准', duration:45,
    accent:'#7c9dff', base:240, thresholds:{S:22000,A:16000,B:10000,C:5000},
    tagline:'微靶点射 · 手稳为王',
    desc:'只有拇指盖大小的靶点。放慢速度，把每一次点击都变成有效命中。',
    tip:'降低出枪速度，优先保证落在靶心。失误会清空连击倍率。',
    labels:{ accuracy:'命中率', hits:'命中', misses:'失误', ttk:'平均 TTK', streak:'最高连击', rate:'每秒命中' } },
];

/* ============================================================================
 * 二、Store —— 数据层
 * ========================================================================== */
const Store = (function () {
  'use strict';

  /* -------- 2.1 常量与默认数据（SPEC 4.1 / 4.2） -------- */

  var SETTINGS_KEY = 'aimlab.web.settings.v1';
  var RECORDS_KEY = 'aimlab.web.records.v1';
  var MAX_HISTORY = 40;

  var DEFAULT_SETTINGS = {
    version: 1,
    aimMode: 'relative',        // 'relative' | 'absolute'
    sensitivity: 1.0,           // 0.2 ~ 3.0
    targetScale: 1.0,           // 0.7 ~ 1.4
    effects: true,
    hdr: true,                  // 支持 HDR 的显示器上启用峰值高光
    crosshair: {
      style: 'cross',           // 'cross' | 'dot' | 'ring' | 'x' | 't'
      color: '#2ce8ff',
      size: 14,                 // 6 ~ 30
      thickness: 2,             // 1 ~ 6
      gap: 4,                   // 0 ~ 14
      opacity: 0.95,            // 0.2 ~ 1
      outline: true,
    },
    audio: {
      enabled: false,           // 默认静音，避免突然出声；按 M 或点喇叭开启
      volume: 0.7,              // 0 ~ 1
    },
    lastMode: 'gridshot',
  };

  var DEFAULT_RECORDS = {
    version: 1,
    bests: {},                  // modeId -> { score, accuracy, grade, bestCombo, date }
    history: [],                // 最新的在前，最多 40 条
  };

  var CROSSHAIR_STYLES = ['cross', 'dot', 'ring', 'x', 't'];
  var GRADES = ['D', 'C', 'B', 'A', 'S']; // 由低到高
  var HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  var MODE_ID_LIST = MODES.map(function (m) { return m.id; });

  var ROOT = (typeof window !== 'undefined' && window) ||
    (typeof globalThis !== 'undefined' ? globalThis : {});

  /* -------- 2.2 基础工具（内部） -------- */

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      return {};
    }
  }

  function toNum(value) {
    var n;
    if (typeof value === 'number') {
      n = value;
    } else if (typeof value === 'string' && value !== '') {
      n = Number(value);
    } else {
      return null;
    }
    return isFinite(n) ? n : null;
  }

  function numOr(value, fallback) {
    var n = toNum(value);
    return n === null ? fallback : n;
  }

  function clampNum(value, min, max) {
    var n = numOr(value, min);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function toBool(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (value === 0 || value === '0' || value === 'false') return false;
    if (value === 1 || value === '1' || value === 'true') return true;
    return fallback;
  }

  function isValidGrade(value) {
    return value === 'S' || value === 'A' || value === 'B' || value === 'C' || value === 'D';
  }

  function isModeId(id) {
    return typeof id === 'string' && MODE_ID_LIST.indexOf(id) >= 0;
  }

  function storage() {
    try {
      var ls = ROOT.localStorage;
      if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') return ls;
    } catch (err) {
      /* 隐私模式 / 禁用 cookie 时访问 localStorage 会抛 SecurityError */
    }
    return null;
  }

  function readRaw(key) {
    var ls = storage();
    if (!ls) return null;
    try {
      return ls.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function safeSet(key, text) {
    var ls = storage();
    if (!ls) return false;
    try {
      ls.setItem(key, text);
      return true;
    } catch (err) {
      /* 配额满 / 只读存储：静默失败，数据仍保留在内存 */
      return false;
    }
  }

  function parseJSON(text) {
    if (typeof text !== 'string' || text === '') return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      return null;
    }
  }

  function safeDateString(value) {
    if (!value) return '';
    if (typeof value === 'string') {
      return isFinite(Date.parse(value)) ? value : '';
    }
    var timestamp = null;
    if (typeof value === 'number') {
      timestamp = isFinite(value) ? value : null;
    } else if (typeof value === 'object' && typeof value.getTime === 'function') {
      timestamp = value.getTime();
    }
    if (timestamp === null || !isFinite(timestamp)) return '';
    try {
      return new Date(timestamp).toISOString();
    } catch (err) {
      return '';
    }
  }

  function nowISO() {
    try {
      return new Date().toISOString();
    } catch (err) {
      return '';
    }
  }

  function recordDate(value) {
    var safe = safeDateString(value);
    return safe !== '' ? safe : nowISO();
  }

  /* -------- 2.3 设置：深合并 + 校验 -------- */

  function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
    if (!base || typeof base !== 'object') base = {};
    Object.keys(patch).forEach(function (key) {
      var value = patch[key];
      if (value === undefined) return;
      var current = base[key];
      if (value && typeof value === 'object' && !Array.isArray(value) &&
          current && typeof current === 'object' && !Array.isArray(current)) {
        base[key] = deepMerge(current, value);
      } else if (Array.isArray(value)) {
        base[key] = value.slice();
      } else {
        base[key] = value;
      }
    });
    return base;
  }

  /**
   * 把任意来源（存档 / 设置补丁 / 默认值）整理成完整合法的 settings 对象。
   * base 用作非法值、未知值的回退（init 时为默认值，update 时为当前设置）。
   */
  function sanitizeSettings(raw, base) {
    var out = clone(base || DEFAULT_SETTINGS);
    out.version = 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;

    if (raw.aimMode === 'relative' || raw.aimMode === 'absolute') out.aimMode = raw.aimMode;

    var n = toNum(raw.sensitivity);
    if (n !== null) out.sensitivity = clampNum(n, 0.2, 3.0);
    n = toNum(raw.targetScale);
    if (n !== null) out.targetScale = clampNum(n, 0.7, 1.4);
    if (raw.effects !== undefined) out.effects = toBool(raw.effects, out.effects);
    if (raw.hdr !== undefined) out.hdr = toBool(raw.hdr, out.hdr);

    var crosshairRaw = raw.crosshair;
    if (crosshairRaw && typeof crosshairRaw === 'object' && !Array.isArray(crosshairRaw)) {
      if (CROSSHAIR_STYLES.indexOf(crosshairRaw.style) >= 0) out.crosshair.style = crosshairRaw.style;
      if (typeof crosshairRaw.color === 'string' && HEX_COLOR_RE.test(crosshairRaw.color)) {
        out.crosshair.color = crosshairRaw.color;
      }
      n = toNum(crosshairRaw.size);
      if (n !== null) out.crosshair.size = clampNum(n, 6, 30);
      n = toNum(crosshairRaw.thickness);
      if (n !== null) out.crosshair.thickness = clampNum(n, 1, 6);
      n = toNum(crosshairRaw.gap);
      if (n !== null) out.crosshair.gap = clampNum(n, 0, 14);
      n = toNum(crosshairRaw.opacity);
      if (n !== null) out.crosshair.opacity = clampNum(n, 0.2, 1);
      if (crosshairRaw.outline !== undefined) {
        out.crosshair.outline = toBool(crosshairRaw.outline, out.crosshair.outline);
      }
    }

    var audioRaw = raw.audio;
    if (audioRaw && typeof audioRaw === 'object' && !Array.isArray(audioRaw)) {
      if (audioRaw.enabled !== undefined) out.audio.enabled = toBool(audioRaw.enabled, out.audio.enabled);
      n = toNum(audioRaw.volume);
      if (n !== null) out.audio.volume = clampNum(n, 0, 1);
    }

    if (isModeId(raw.lastMode)) out.lastMode = raw.lastMode;
    return out;
  }

  /** 把一份合法设置写回 live 对象（保持 Store.settings 及其嵌套对象引用稳定）。 */
  function syncSettings(next) {
    settings.version = 1;
    settings.aimMode = next.aimMode;
    settings.sensitivity = next.sensitivity;
    settings.targetScale = next.targetScale;
    settings.effects = next.effects;
    settings.hdr = next.hdr;
    settings.crosshair.style = next.crosshair.style;
    settings.crosshair.color = next.crosshair.color;
    settings.crosshair.size = next.crosshair.size;
    settings.crosshair.thickness = next.crosshair.thickness;
    settings.crosshair.gap = next.crosshair.gap;
    settings.crosshair.opacity = next.crosshair.opacity;
    settings.crosshair.outline = next.crosshair.outline;
    settings.audio.enabled = next.audio.enabled;
    settings.audio.volume = next.audio.volume;
    settings.lastMode = next.lastMode;
  }

  /* -------- 2.4 设置存档读写 -------- */

  function saveSettings() {
    try {
      return safeSet(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      return false;
    }
  }

  /* -------- 2.5 成绩：结构校验与持久化 -------- */

  function saveRecords() {
    try {
      return safeSet(RECORDS_KEY, JSON.stringify(records));
    } catch (err) {
      return false;
    }
  }

  function sanitizeBest(raw, modeId) {
    var modeCfg = mode(modeId);
    var score = Math.max(0, Math.round(numOr(raw.score, 0)));
    return {
      score: score,
      accuracy: clampNum(numOr(raw.accuracy, 0), 0, 100),
      grade: isValidGrade(raw.grade) ? raw.grade : gradeFor(score, modeCfg || modeId),
      bestCombo: Math.max(0, Math.round(numOr(raw.bestCombo, 0))),
      date: safeDateString(raw.date),
    };
  }

  function sanitizeRunEntry(raw, modeId) {
    var modeCfg = mode(modeId);
    var score = Math.max(0, Math.round(numOr(raw.score, 0)));
    var hits = Math.max(0, Math.round(numOr(raw.hits, 0)));
    var shots = Math.max(hits, Math.round(numOr(raw.shots, hits)));
    return {
      modeId: modeId,
      score: score,
      accuracy: clampNum(numOr(raw.accuracy, 0), 0, 100),
      grade: isValidGrade(raw.grade) ? raw.grade : gradeFor(score, modeCfg || modeId),
      hits: hits,
      shots: shots,
      date: safeDateString(raw.date),
    };
  }

  /** 任意来源（存档 / 内存）的 records 整理成完整合法结构。 */
  function sanitizeRecords(raw) {
    var out = clone(DEFAULT_RECORDS);
    out.version = 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;

    var rawBests = raw.bests;
    if (rawBests && typeof rawBests === 'object' && !Array.isArray(rawBests)) {
      for (var i = 0; i < MODE_ID_LIST.length; i++) {
        var modeId = MODE_ID_LIST[i];
        var item = rawBests[modeId];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          out.bests[modeId] = sanitizeBest(item, modeId);
        }
      }
    }

    var rawHistory = raw.history;
    if (Array.isArray(rawHistory)) {
      var count = rawHistory.length > 400 ? 400 : rawHistory.length; // 防御超长脏数组
      for (var j = 0; j < count && out.history.length < MAX_HISTORY; j++) {
        var entry = rawHistory[j];
        if (!entry || typeof entry !== 'object') continue;
        var entryModeId = typeof entry.modeId === 'string' ? entry.modeId : '';
        if (!isModeId(entryModeId)) continue;
        out.history.push(sanitizeRunEntry(entry, entryModeId));
      }
    }
    return out;
  }

  /* -------- 2.6 live 数据（Store 的公开引用始终指向这两个对象） -------- */

  var settings = clone(DEFAULT_SETTINGS);
  var records = clone(DEFAULT_RECORDS);

  function applyRecords(next) {
    records.version = 1;
    records.bests = next.bests || {};
    records.history = Array.isArray(next.history) ? next.history : [];
  }

  /* -------- 2.7 设置 API -------- */

  function init() {
    var rawSettings = readRaw(SETTINGS_KEY);
    var rawRecords = readRaw(RECORDS_KEY);
    var hasSave = rawSettings !== null || rawRecords !== null;

    syncSettings(sanitizeSettings(parseJSON(rawSettings), DEFAULT_SETTINGS));
    applyRecords(sanitizeRecords(parseJSON(rawRecords)));
    syncAudio();
    return hasSave;
  }

  function updateSettings(patch) {
    var merged = deepMerge(clone(settings), patch);
    syncSettings(sanitizeSettings(merged, settings));
    saveSettings();
    syncAudio();
    return settings;
  }

  function resetSettings() {
    syncSettings(clone(DEFAULT_SETTINGS));
    var ok = saveSettings();
    syncAudio();
    return ok;
  }

  function resetAll() {
    var settingsOk = resetSettings();
    var recordsOk = clearRecords();
    return settingsOk && recordsOk;
  }

  /* -------- 2.8 成绩 API -------- */

  function resolveSummaryModeId(summary) {
    if (isModeId(summary.modeId)) return summary.modeId;
    var modeRef = summary.mode;
    if (modeRef && typeof modeRef === 'object' && isModeId(modeRef.id)) return modeRef.id;
    return null;
  }

  /**
   * 保存一局成绩。
   * @returns {{isBest:boolean, previousBest:number, best:object|null}}
   */
  function recordRun(summary) {
    var result = { isBest: false, previousBest: 0, best: null };
    if (!summary || typeof summary !== 'object') return result;

    var modeId = resolveSummaryModeId(summary);
    var modeCfg = modeId ? mode(modeId) : null;
    if (!modeCfg) return result;

    var score = Math.max(0, Math.round(numOr(summary.score, 0)));
    var accuracy = clampNum(numOr(summary.accuracy, 0), 0, 100);
    var hits = Math.max(0, Math.round(numOr(summary.hits, 0)));
    var shots = Math.max(hits, Math.round(numOr(summary.shots, hits)));
    var grade = isValidGrade(summary.grade) ? summary.grade : gradeFor(score, modeCfg);
    var bestCombo = Math.max(0, Math.round(numOr(summary.bestCombo, 0)));
    var date = recordDate(summary.date);

    var previous = records.bests[modeId];
    var previousBest = previous ? Math.max(0, Math.round(numOr(previous.score, 0))) : 0;
    var isBest = score > previousBest;

    var best;
    if (isBest) {
      best = { score: score, accuracy: accuracy, grade: grade, bestCombo: bestCombo, date: date };
      records.bests[modeId] = best;
    } else if (previous) {
      best = sanitizeBest(previous, modeId);
    } else {
      best = { score: 0, accuracy: 0, grade: 'D', bestCombo: 0, date: '' };
    }

    records.history.unshift({
      modeId: modeId,
      score: score,
      accuracy: accuracy,
      grade: grade,
      hits: hits,
      shots: shots,
      date: date,
    });
    if (records.history.length > MAX_HISTORY) records.history.length = MAX_HISTORY;
    saveRecords();

    return { isBest: isBest, previousBest: previousBest, best: clone(best) };
  }

  function clearRecords() {
    records.bests = {};
    records.history = [];
    records.version = 1;
    return saveRecords();
  }

  /* -------- 2.9 查询与统计 API -------- */

  function mode(id) {
    for (var i = 0; i < MODES.length; i++) {
      if (MODES[i].id === id) return MODES[i];
    }
    return null;
  }

  function normalizeLimit(limit, fallback) {
    if (limit === undefined || limit === null) return fallback;
    var n = toNum(limit);
    if (n === null) return fallback;
    n = Math.floor(n);
    return n < 0 ? 0 : n;
  }

  function stats() {
    var runs = records.history.length;
    var bestScore = 0;
    var bests = records.bests || {};
    Object.keys(bests).forEach(function (id) {
      var item = bests[id];
      var score = item ? Math.max(0, Math.round(numOr(item.score, 0))) : 0;
      if (score > bestScore) bestScore = score;
    });

    var accuracySum = 0;
    var totalHits = 0;
    for (var i = 0; i < records.history.length; i++) {
      var entry = records.history[i] || {};
      accuracySum += clampNum(numOr(entry.accuracy, 0), 0, 100);
      totalHits += Math.max(0, Math.round(numOr(entry.hits, 0)));
    }
    return {
      runs: runs,
      bestScore: bestScore,
      avgAccuracy: runs > 0 ? accuracySum / runs : 0,
      totalHits: totalHits,
    };
  }

  function recent(limit) {
    return records.history.slice(0, normalizeLimit(limit, 4));
  }

  /** 跨模式的个人最佳（来源为 bests），按 score 降序。 */
  function topRuns(limit) {
    var max = normalizeLimit(limit, 4);
    var list = [];
    var bests = records.bests || {};
    Object.keys(bests).forEach(function (modeId) {
      if (!isModeId(modeId)) return;
      var item = bests[modeId];
      if (!item || typeof item !== 'object') return;
      var score = Math.max(0, Math.round(numOr(item.score, 0)));
      list.push({
        modeId: modeId,
        score: score,
        accuracy: clampNum(numOr(item.accuracy, 0), 0, 100),
        grade: isValidGrade(item.grade) ? item.grade : gradeFor(score, modeId),
        bestCombo: Math.max(0, Math.round(numOr(item.bestCombo, 0))),
        date: typeof item.date === 'string' ? item.date : '',
      });
    });
    list.sort(function (a, b) { return b.score - a.score; });
    return list.slice(0, max);
  }

  function storageKB() {
    var ls = storage();
    if (ls) {
      var total = 0;
      var first = null;
      var second = null;
      try { first = ls.getItem(SETTINGS_KEY); } catch (err) { first = null; }
      try { second = ls.getItem(RECORDS_KEY); } catch (err) { second = null; }
      if (typeof first === 'string') total += first.length;
      if (typeof second === 'string') total += second.length;
      return Math.round((total / 1024) * 10) / 10;
    }
    /* 存储不可用：用内存中的 JSON 体积估算 */
    try {
      var size = JSON.stringify(settings).length + JSON.stringify(records).length;
      return Math.round((size / 1024) * 10) / 10;
    } catch (err) {
      return 0;
    }
  }

  /* -------- 2.10 评级 -------- */

  function resolveThresholds(modeRef) {
    if (!modeRef) return null;
    if (typeof modeRef === 'string') {
      var byId = mode(modeRef);
      return byId ? byId.thresholds : null;
    }
    if (typeof modeRef === 'object') {
      if (modeRef.thresholds && typeof modeRef.thresholds === 'object') return modeRef.thresholds;
      if (toNum(modeRef.S) !== null || toNum(modeRef.C) !== null) return modeRef;
    }
    return null;
  }

  function thresholdValue(thresholds, key) {
    if (!thresholds) return null;
    return toNum(thresholds[key]);
  }

  function gradeFor(score, modeRef) {
    var n = numOr(score, 0);
    var th = resolveThresholds(modeRef);
    if (!th) return 'D';
    var s = thresholdValue(th, 'S');
    if (s !== null && n >= s) return 'S';
    var a = thresholdValue(th, 'A');
    if (a !== null && n >= a) return 'A';
    var b = thresholdValue(th, 'B');
    if (b !== null && n >= b) return 'B';
    var c = thresholdValue(th, 'C');
    if (c !== null && n >= c) return 'C';
    return 'D';
  }

  /**
   * 结算页评级进度：当前档位（grade）、下一档（next/need）与档内进度（progress 0~1）。
   * 已是 S 时 next=null、need=0、progress=1。
   */
  function nextGrade(score, modeRef) {
    var n = numOr(score, 0);
    var grade = gradeFor(n, modeRef);
    if (grade === 'S') return { grade: 'S', next: null, need: 0, progress: 1 };

    var th = resolveThresholds(modeRef);
    if (!th) return { grade: grade, next: null, need: 0, progress: grade === 'S' ? 1 : 0 };

    var index = GRADES.indexOf(grade);
    if (index < 0) index = 0;
    var nextName = GRADES[index + 1];
    var lower = index === 0 ? 0 : thresholdValue(th, grade);
    if (lower === null) lower = 0;
    var upper = thresholdValue(th, nextName);
    if (upper === null) upper = lower;
    if (upper < lower) upper = lower;

    var progress = upper > lower ? (n - lower) / (upper - lower) : 1;
    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;

    var need = upper - n;
    if (!(need > 0)) need = 0;
    else need = Math.ceil(need);

    return { grade: grade, next: nextName, need: need, progress: progress };
  }

  /* -------- 2.11 通用工具（SPEC 5.1） -------- */

  function clamp(value, min, max) {
    var n = numOr(value, 0);
    var lo = numOr(min, 0);
    var hi = numOr(max, 1);
    if (hi < lo) {
      var tmp = lo;
      lo = hi;
      hi = tmp;
    }
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function lerp(a, b, t) {
    var x = numOr(a, 0);
    var y = numOr(b, 0);
    var k = numOr(t, 0);
    return x + (y - x) * k;
  }

  function rand(min, max) {
    var a = numOr(min, 0);
    var b = toNum(max);
    if (b === null) {
      b = a;
      a = 0;
    }
    if (b < a) {
      var tmp = a;
      a = b;
      b = tmp;
    }
    return a + Math.random() * (b - a);
  }

  function randInt(min, max) {
    var a = numOr(min, 0);
    var b = toNum(max);
    if (b === null) {
      b = a;
      a = 0;
    }
    a = Math.ceil(a);
    b = Math.floor(b);
    if (b < a) {
      var tmp = a;
      a = b;
      b = tmp;
    }
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function pick(list) {
    if (!list || typeof list.length !== 'number' || list.length === 0) return undefined;
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffle(list) {
    var out = list && typeof list.length === 'number' ? Array.prototype.slice.call(list) : [];
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** 12345 -> "12,345" */
  function fmtScore(n) {
    var value = Math.round(numOr(n, 0));
    var negative = value < 0;
    var text = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return negative ? '-' + text : text;
  }

  /** 87.345 -> "87.3"（默认 1 位小数） */
  function fmtPct(n, d) {
    var digits = toNum(d);
    if (digits === null) digits = 1;
    digits = Math.floor(digits);
    if (digits < 0) digits = 0;
    if (digits > 6) digits = 6;
    return numOr(n, 0).toFixed(digits);
  }

  /** 秒数保留 1 位小数：12.34 -> "12.3" */
  function fmtTime(sec) {
    var value = numOr(sec, 0);
    if (value < 0) value = 0;
    return value.toFixed(1);
  }

  /** 相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / M/D */
  function timeAgo(iso) {
    var timestamp = null;
    if (typeof iso === 'number') {
      timestamp = isFinite(iso) ? iso : null;
    } else if (typeof iso === 'string' && iso !== '') {
      timestamp = Date.parse(iso);
    } else if (iso && typeof iso === 'object' && typeof iso.getTime === 'function') {
      timestamp = iso.getTime();
    }
    if (timestamp === null || !isFinite(timestamp)) return '--';

    var now = Date.now();
    var diff = now - timestamp;
    if (diff < 0) diff = 0;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';

    var then = new Date(timestamp);
    var current = new Date(now);
    var sameDay = then.getFullYear() === current.getFullYear() &&
      then.getMonth() === current.getMonth() &&
      then.getDate() === current.getDate();
    if (sameDay) {
      var hours = Math.floor(diff / 3600000);
      if (hours < 1) hours = 1;
      return hours + ' 小时前';
    }

    var yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
    if (then.getFullYear() === yesterday.getFullYear() &&
        then.getMonth() === yesterday.getMonth() &&
        then.getDate() === yesterday.getDate()) {
      return '昨天';
    }
    return (then.getMonth() + 1) + '/' + then.getDate();
  }

  function escapeHtml(text) {
    return String(text === null || text === undefined ? '' : text).replace(/[&<>"']/g, function (ch) {
      switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    });
  }

  /* -------- 2.12 音效同步（settings.audio -> AudioFX） -------- */

  function syncAudio() {
    try {
      if (typeof AudioFX === 'undefined' || !AudioFX ||
          typeof AudioFX.setEnabled !== 'function' || typeof AudioFX.setVolume !== 'function') {
        return;
      }
      AudioFX.setEnabled(settings.audio.enabled);
      AudioFX.setVolume(settings.audio.volume);
    } catch (err) {
      /* 音频子系统异常不影响数据层 */
    }
  }

  /* -------- 2.13 公开 API（SPEC 5.1，勿增删语义） -------- */

  return {
    MODES: MODES,
    settings: settings,
    records: records,
    init: init,
    saveSettings: saveSettings,
    updateSettings: updateSettings,
    resetSettings: resetSettings,
    recordRun: recordRun,
    clearRecords: clearRecords,
    resetAll: resetAll,
    mode: mode,
    stats: stats,
    recent: recent,
    topRuns: topRuns,
    storageKB: storageKB,
    clamp: clamp,
    lerp: lerp,
    rand: rand,
    randInt: randInt,
    pick: pick,
    shuffle: shuffle,
    fmtScore: fmtScore,
    fmtPct: fmtPct,
    fmtTime: fmtTime,
    timeAgo: timeAgo,
    escapeHtml: escapeHtml,
    gradeFor: gradeFor,
    nextGrade: nextGrade,
  };
})();

/* ============================================================================
 * 三、AudioFX —— Web Audio 实时合成音效
 * 说明：首次播放必须在用户手势中调用 unlock()；无 Web Audio 时所有方法静默无效。
 * ========================================================================== */
const AudioFX = (function () {
  'use strict';

  var ROOT = (typeof window !== 'undefined' && window) ||
    (typeof globalThis !== 'undefined' ? globalThis : {});

  var ctx = null;
  var master = null;
  var compressor = null;

  var enabledCache = true;
  var volumeCache = 0.7;
  var testBypass = false;

  var MASTER_HEADROOM = 0.6; // 总音量留出余量，避免叠加音刺耳 / 削波

  /* -------- 3.1 配置读取（以 Store.settings.audio 为唯一真源） -------- */

  function audioSettings() {
    try {
      if (typeof Store !== 'undefined' && Store && Store.settings && Store.settings.audio) {
        return Store.settings.audio;
      }
    } catch (err) {
      /* Store 尚未就绪时退回内部缓存 */
    }
    return null;
  }

  function isEnabled() {
    var audio = audioSettings();
    if (audio && typeof audio.enabled === 'boolean') return audio.enabled;
    return enabledCache;
  }

  function currentVolume() {
    var audio = audioSettings();
    var value = audio ? Number(audio.volume) : Number(volumeCache);
    if (!isFinite(value)) value = volumeCache;
    if (!isFinite(value)) value = 0.7;
    if (value < 0) value = 0;
    if (value > 1) value = 1;
    return value;
  }

  function persistSettings() {
    try {
      if (typeof Store !== 'undefined' && Store && typeof Store.saveSettings === 'function') {
        Store.saveSettings();
      }
    } catch (err) {
      /* 持久化失败不影响本次播放 */
    }
  }

  function getAudioCtor() {
    try {
      if (typeof ROOT.AudioContext === 'function') return ROOT.AudioContext;
      if (typeof ROOT.webkitAudioContext === 'function') return ROOT.webkitAudioContext;
    } catch (err) {
      /* ignore */
    }
    return null;
  }

  /* -------- 3.2 上下文与总线 -------- */

  function applyVolume(immediate) {
    if (!ctx || !master || !master.gain) return;
    var target = currentVolume() * MASTER_HEADROOM;
    if (target < 0.0001) target = 0.0001; // exponentialRamp 不接受 0
    try {
      var gain = master.gain;
      var now = ctx.currentTime;
      if (immediate && typeof gain.cancelScheduledValues === 'function') gain.cancelScheduledValues(now);
      if (typeof gain.setTargetAtTime === 'function') gain.setTargetAtTime(target, now, 0.02);
      else gain.value = target;
    } catch (err) {
      /* ignore */
    }
  }

  function safeResume() {
    if (!ctx || typeof ctx.resume !== 'function') return;
    try {
      if (ctx.state !== 'suspended') return;
      var promise = ctx.resume();
      if (promise && typeof promise.then === 'function') {
        promise.then(function () {}, function () {});
      } else if (promise && typeof promise.catch === 'function') {
        promise.catch(function () {});
      }
    } catch (err) {
      /* 浏览器拒绝 resume（非手势）时静默忽略 */
    }
  }

  /**
   * 幂等创建 AudioContext。首次调用应发生在用户手势回调中（点击 / 键盘 / 触摸）。
   * @returns {boolean} 音频是否可用
   */
  function unlock() {
    var Ctor = getAudioCtor();
    if (!Ctor) return false;
    try {
      if (!ctx) {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = 0.0001;

        if (typeof ctx.createDynamicsCompressor === 'function') {
          try {
            compressor = ctx.createDynamicsCompressor();
            if (compressor.threshold) compressor.threshold.value = -16;
            if (compressor.knee) compressor.knee.value = 20;
            if (compressor.ratio) compressor.ratio.value = 6;
            if (compressor.attack) compressor.attack.value = 0.003;
            if (compressor.release) compressor.release.value = 0.25;
            master.connect(compressor);
            compressor.connect(ctx.destination);
          } catch (err) {
            compressor = null;
            master.connect(ctx.destination);
          }
        } else {
          master.connect(ctx.destination);
        }
        applyVolume(false);
      }
      safeResume();
      return true;
    } catch (err) {
      ctx = null;
      master = null;
      compressor = null;
      return false;
    }
  }

  /* -------- 3.3 单音合成器 -------- */

  /**
   * 排一个短促的音：oscillator + gain 包络。
   * @param {{freq:number, freqEnd?:number, type?:string, duration?:number,
   *          gain?:number, delay?:number, attack?:number}} options
   */
  function tone(options) {
    if (!ctx || !master) return;
    var opts = options || {};

    var freq = Number(opts.freq);
    if (!isFinite(freq) || freq < 20) freq = 440;
    var endFreq = Number(opts.freqEnd);
    if (!isFinite(endFreq) || endFreq < 20) endFreq = freq;

    var duration = Number(opts.duration);
    if (!isFinite(duration) || duration <= 0) duration = 0.12;
    if (duration > 1.5) duration = 1.5;

    var delay = Number(opts.delay);
    if (!isFinite(delay) || delay < 0) delay = 0;

    var peak = Number(opts.gain);
    if (!isFinite(peak) || peak <= 0) peak = 0.2;
    if (peak > 0.8) peak = 0.8;

    var attack = Number(opts.attack);
    if (!isFinite(attack) || attack <= 0.0005) attack = Math.min(0.012, duration * 0.3);

    var start = ctx.currentTime + 0.005 + delay;
    var end = start + duration;

    var oscillator = null;
    var gainNode = null;
    try {
      oscillator = ctx.createOscillator();
      gainNode = ctx.createGain();
      oscillator.type = opts.type || 'sine';
      oscillator.frequency.setValueAtTime(freq, start);
      if (endFreq !== freq) oscillator.frequency.exponentialRampToValueAtTime(endFreq, end);

      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.linearRampToValueAtTime(peak, Math.min(end, start + attack));
      gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gainNode);
      gainNode.connect(master);
      oscillator.start(start);
      oscillator.stop(end + 0.03);
      oscillator.onended = function () {
        try { oscillator.disconnect(); } catch (err) { /* ignore */ }
        try { gainNode.disconnect(); } catch (err) { /* ignore */ }
      };
    } catch (err) {
      try { if (oscillator) oscillator.disconnect(); } catch (e1) { /* ignore */ }
      try { if (gainNode) gainNode.disconnect(); } catch (e2) { /* ignore */ }
    }
  }

  /* -------- 3.4 音色定义（全部为短促干净的合成音） -------- */

  function soundClick() {
    tone({ freq: 1500, freqEnd: 1100, type: 'triangle', duration: 0.045, gain: 0.14 });
  }

  function soundToggle() {
    tone({ freq: 880, freqEnd: 620, type: 'sine', duration: 0.09, gain: 0.26 });
  }

  function soundHit() {
    /* 双音上行 ping：A5 -> E6 */
    tone({ freq: 880, type: 'triangle', duration: 0.07, gain: 0.5 });
    tone({ freq: 1320, type: 'sine', duration: 0.11, gain: 0.42, delay: 0.055 });
  }

  function soundMiss() {
    /* 低频短闷响 */
    tone({ freq: 150, freqEnd: 82, type: 'sine', duration: 0.17, gain: 0.55 });
    tone({ freq: 96, freqEnd: 70, type: 'triangle', duration: 0.12, gain: 0.28, delay: 0.012 });
  }

  function soundCombo() {
    /* 上行琶音：C5-E5-G5-C6 */
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < notes.length; i++) {
      tone({ freq: notes[i], type: 'triangle', duration: 0.1, gain: 0.24, delay: i * 0.052 });
    }
  }

  function soundCountdown() {
    tone({ freq: 620, type: 'triangle', duration: 0.075, gain: 0.34 });
  }

  function soundGo() {
    tone({ freq: 520, freqEnd: 1040, type: 'triangle', duration: 0.24, gain: 0.42 });
    tone({ freq: 780, type: 'sine', duration: 0.16, gain: 0.2, delay: 0.1 });
  }

  function soundFinish() {
    /* 柔和的大三和弦，带轻微延迟铺开 */
    var chord = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < chord.length; i++) {
      tone({ freq: chord[i], type: 'sine', duration: 0.6, gain: 0.18, delay: i * 0.014, attack: 0.02 });
    }
  }

  function soundRecord() {
    /* 小号角感上行三连 + 高音收尾 */
    var fanfare = [659.25, 830.61, 1046.5];
    for (var i = 0; i < fanfare.length; i++) {
      tone({ freq: fanfare[i], type: 'triangle', duration: 0.12, gain: 0.32, delay: i * 0.075 });
    }
    tone({ freq: 1318.51, type: 'triangle', duration: 0.4, gain: 0.26, delay: 0.24 });
  }

  /* -------- 3.5 公开 API（SPEC 5.1） -------- */

  /**
   * 播放一个音效。未解锁时先尝试创建上下文；不可用时返回 false。
   * @param {string} name click|hit|miss|combo|countdown|go|finish|record|toggle
   */
  function play(name) {
    if (!testBypass && !isEnabled()) return false;
    if (!ctx && !unlock()) return false;
    if (!ctx || !master) return false;
    safeResume();
    try {
      switch (name) {
        case 'click': soundClick(); return true;
        case 'hit': soundHit(); return true;
        case 'miss': soundMiss(); return true;
        case 'combo': soundCombo(); return true;
        case 'countdown': soundCountdown(); return true;
        case 'go': soundGo(); return true;
        case 'finish': soundFinish(); return true;
        case 'record': soundRecord(); return true;
        case 'toggle': soundToggle(); return true;
        default: return false;
      }
    } catch (err) {
      return false;
    }
  }

  function setEnabled(value) {
    var next = !!value;
    enabledCache = next;
    var audio = audioSettings();
    if (audio && audio.enabled !== next) {
      audio.enabled = next;
      persistSettings();
    }
    return next;
  }

  function setVolume(value) {
    var next = Number(value);
    if (!isFinite(next)) next = volumeCache;
    if (next < 0) next = 0;
    if (next > 1) next = 1;
    volumeCache = next;

    var audio = audioSettings();
    if (audio) {
      var current = Number(audio.volume);
      if (!isFinite(current) || Math.abs(current - next) > 0.000001) {
        audio.volume = next;
        persistSettings();
      }
    }
    applyVolume(true);
    return next;
  }

  /** 试听：确保音频上下文可用并播放一声 hit（即使总开关关闭也发声，便于确认设备音量）。 */
  function test() {
    if (!unlock()) return false;
    testBypass = true;
    try {
      return play('hit');
    } finally {
      testBypass = false;
    }
  }

  return {
    unlock: unlock,
    play: play,
    setEnabled: setEnabled,
    setVolume: setVolume,
    test: test,
  };
})();
