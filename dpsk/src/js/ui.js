/* ============================================================================
 * AIMLAB WEB · ui.js —— 菜单 / 设置 / HUD / 暂停 / 结算 / Toast / 确认框
 * ----------------------------------------------------------------------------
 * 职责：纯 UI 交互层。依赖全局 Store / AudioFX / Crosshair（由前置脚本提供），
 *       不依赖 Game：所有游戏动作都通过 main.js 注入的 handlers 转发。
 * 契约：SPEC 5.4 / 5.6。动态 DOM 一律按 5.6 模板生成。
 * 注意：本文件不写 CSS、不写游戏逻辑、不注入外部资源，图标全部为内联 SVG。
 * ========================================================================== */
const UI = (function () {
  'use strict';

  /* ==========================================================================
   * 0. 常量
   * ====================================================================== */

  var CH_STYLES = ['cross', 'dot', 'ring', 'x', 't'];
  var GRADE_CLASSES = ['grade-s', 'grade-a', 'grade-b', 'grade-c', 'grade-d'];
  var GRADE_ORDER = ['D', 'C', 'B', 'A', 'S'];
  var GRADE_RING_CIRCUMFERENCE = 666;   /* 评级环 r=106 的周长（与 styles.css 的 stroke-dasharray 对齐） */
  var GRADE_RING_FILL = { D: 0.22, C: 0.45, B: 0.68, A: 0.86, S: 1 };

  var DEFAULT_CROSSHAIR = {
    style: 'cross',
    color: '#2ce8ff',
    size: 14,
    thickness: 2,
    gap: 4,
    opacity: 0.95,
    outline: true
  };

  var RANK_TITLES = {
    S: { title: '绝对领域', subtitle: '准星与目标合二为一。这个状态，值得被记录。' },
    A: { title: '状态火热', subtitle: '节奏和精度都在线，把稳定度再拉满就是 S 级。' },
    B: { title: '稳定发挥', subtitle: '基础很扎实，减少无效移动，分数还能再往上走一截。' },
    C: { title: '渐入佳境', subtitle: '手感正在回来。放慢一点，先保证每一次点击都有效。' },
    D: { title: '继续热身', subtitle: '别急着追高分，先把稳定的节奏找回来。' }
  };

  var MODE_ICONS = {
    gridshot:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5z" fill="currentColor"/>' +
      '<circle cx="12" cy="12" r="1.7" fill="currentColor"/></svg>',
    spidershot:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<circle cx="12" cy="12" r="2" fill="currentColor"/>' +
      '<circle cx="12" cy="12" r="6.4" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '<path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    motion:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<circle cx="15" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<circle cx="15" cy="12" r="1" fill="currentColor"/>' +
      '<path d="M3 12h4.5M5 8.5 7.5 10.5M5 15.5 7.5 13.5M21.5 12H18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".85"/></svg>',
    flick:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<circle cx="9.5" cy="14" r="4.2" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<circle cx="9.5" cy="14" r="1" fill="currentColor"/>' +
      '<path d="M13.2 10.3 20 3.5M15.6 3.5H20V8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tracking:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<circle cx="13.5" cy="12" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<circle cx="13.5" cy="12" r="1.2" fill="currentColor"/>' +
      '<path d="M3 15.5c1.2-3.4 3.4-5.8 6.7-7M3 10.5c.6-1 1.4-1.9 2.4-2.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="1.6 2.6"/></svg>',
    precision:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="12" cy="12" r="1.5" fill="currentColor"/>' +
      '<circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" stroke-width="1" opacity=".55"/></svg>'
  };

  var ICON_FALLBACK =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="M12 2v4M12 18v4M2 12h4M18 12h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  var EMPTY_TIP_DEFAULT = '先求稳，再求快。把准星放在目标中心附近，连击倍率会放大你的每一次命中。';

  /* ==========================================================================
   * 1. 通用小工具
   * ====================================================================== */

  function clamp(value, min, max) {
    var v = Number(value);
    if (!isFinite(v)) v = min;
    return v < min ? min : (v > max ? max : v);
  }

  function round(value, digits) {
    var m = Math.pow(10, digits || 0);
    var v = Number(value);
    if (!isFinite(v)) return 0;
    return Math.round(v * m) / m;
  }

  /** 转数字；无法转换时返回 null（0 是合法值） */
  function toNum(value) {
    var n;
    if (typeof value === 'number') n = value;
    else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
    else return null;
    return isFinite(n) ? n : null;
  }

  function num(value) {
    var n = toNum(value);
    return n === null ? 0 : n;
  }

  function clampNum(value, min, max, fallback) {
    var n = toNum(value);
    if (n === null) return fallback;
    return clamp(n, min, max);
  }

  function pad2(n) {
    n = Math.round(num(n));
    return (n < 10 ? '0' : '') + n;
  }

  function fmtScore(value) {
    var n = toNum(value);
    if (n === null) n = 0;
    n = Math.round(n);
    var neg = n < 0;
    var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + s;
  }

  function fmtPct(value) {
    var n = toNum(value);
    if (n === null) n = 0;
    return n.toFixed(1);
  }

  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    var s = value.trim();
    if (s.charAt(0) !== '#') return null;
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return ('#' + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3)).toLowerCase();
    }
    return null;
  }

  function safeColor(value, fallback) {
    return normalizeHex(value) || normalizeHex(fallback) || '#2ce8ff';
  }

  function hexToRgba(hex, alpha) {
    var c = normalizeHex(hex) || '#2ce8ff';
    var r = parseInt(c.substr(1, 2), 16);
    var g = parseInt(c.substr(3, 2), 16);
    var b = parseInt(c.substr(5, 2), 16);
    var a = toNum(alpha);
    if (a === null) a = 1;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + clamp(a, 0, 1) + ')';
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number' && isFinite(value)) {
      var dn = new Date(value);
      return isNaN(dn.getTime()) ? null : dn;
    }
    if (typeof value !== 'string') return null;
    var d = new Date(value);
    if (!isNaN(d.getTime())) return d;
    var alt = new Date(value.replace(' ', 'T'));
    return isNaN(alt.getTime()) ? null : alt;
  }

  /** 最近训练时间：今天 12:40 / 昨天 21:03 / 10/16 09:20 */
  function formatRunTime(value) {
    var d = parseDate(value);
    if (!d) return '--';
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((today.getTime() - day.getTime()) / 86400000);
    var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (diff === 0) return '今天 ' + hm;
    if (diff === 1) return '昨天 ' + hm;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  }

  /** 结算页时间戳：2026/10/18 00:42 */
  function formatStamp(value) {
    var d = parseDate(value) || new Date();
    return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function validGrade(value) {
    if (typeof value !== 'string') return '';
    var g = value.trim().toUpperCase();
    return GRADE_ORDER.indexOf(g) >= 0 ? g : '';
  }

  function gradeFromThresholds(score, mode) {
    var thresholds = (mode && mode.thresholds) || {};
    var order = ['S', 'A', 'B', 'C'];
    for (var i = 0; i < order.length; i++) {
      var need = toNum(thresholds[order[i]]);
      if (need !== null && score >= need) return order[i];
    }
    return 'D';
  }

  function fallbackNextGrade(score, mode) {
    var thresholds = (mode && mode.thresholds) || {};
    var grade = gradeFromThresholds(score, mode);
    var idx = GRADE_ORDER.indexOf(grade);
    var next = idx >= 0 ? GRADE_ORDER[idx + 1] : '';
    var nextNeed = next ? toNum(thresholds[next]) : null;
    if (!next || nextNeed === null) {
      return { grade: grade, need: 0, next: null, progress: 1 };
    }
    var floor = 0;
    for (var i = 0; i < GRADE_ORDER.length; i++) {
      var t = toNum(thresholds[GRADE_ORDER[i]]);
      if (t !== null && t <= score && t > floor) floor = t;
    }
    var span = nextNeed - floor;
    return {
      grade: grade,
      need: Math.max(0, nextNeed - score),
      next: next,
      progress: span > 0 ? clamp((score - floor) / span, 0, 1) : 1
    };
  }

  /* ==========================================================================
   * 2. 运行状态
   * ====================================================================== */

  var handlers = {};
  var initialized = false;
  var settingsOpen = false;
  var currentSettingsTab = 'controls';
  var pendingConfirm = null;      // { resolve }
  var previewRaf = 0;
  var resizeRaf = 0;
  var lastResultsSummary = null;
  var countdownVisible = false;
  var lastComboMultiplier = 1;
  var domCache = Object.create(null);

  /* ==========================================================================
   * 3. 跨模块访问（带降级，避免某个前置脚本缺失时直接抛错）
   * ====================================================================== */

  function getStore() {
    try {
      return (typeof Store !== 'undefined' && Store) ? Store : null;
    } catch (err) {
      return null;
    }
  }

  function getAudio() {
    try {
      return (typeof AudioFX !== 'undefined' && AudioFX) ? AudioFX : null;
    } catch (err) {
      return null;
    }
  }

  function getCrosshair() {
    try {
      return (typeof Crosshair !== 'undefined' && Crosshair) ? Crosshair : null;
    } catch (err) {
      return null;
    }
  }

  function allModes() {
    var S = getStore();
    if (S && Array.isArray(S.MODES) && S.MODES.length) return S.MODES;
    try {
      if (typeof MODES !== 'undefined' && Array.isArray(MODES) && MODES.length) return MODES;
    } catch (err) { /* noop */ }
    return [];
  }

  function modeById(id) {
    if (!id) return null;
    var S = getStore();
    if (S && typeof S.mode === 'function') {
      try {
        var m = S.mode(id);
        if (m) return m;
      } catch (err) { /* noop */ }
    }
    var list = allModes();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  function reportError(where, err) {
    /* 保留一行可诊断信息，正常路径不会触发 */
    try {
      if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
        console.error('[AIMLAB UI] ' + where, err);
      }
    } catch (e) { /* noop */ }
  }

  /* ==========================================================================
   * 4. DOM 工具
   * ====================================================================== */

  function $(id) {
    if (!id) return null;
    var cached = domCache[id];
    if (cached && cached.isConnected === false) {
      cached = null;
      domCache[id] = null;
    }
    if (cached) return cached;
    var el = document.getElementById(id);
    if (el) domCache[id] = el;
    return el;
  }

  function qsa(selector, root) {
    var scope = root || document;
    if (!scope || typeof scope.querySelectorAll !== 'function') return [];
    return Array.prototype.slice.call(scope.querySelectorAll(selector));
  }

  function on(el, type, fn) {
    if (!el || typeof el.addEventListener !== 'function' || typeof fn !== 'function') return;
    el.addEventListener(type, fn, false);
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = (text === null || text === undefined) ? '' : String(text);
  }

  function esc(value) {
    var s = (value === null || value === undefined) ? '' : String(value);
    var S = getStore();
    if (S && typeof S.escapeHtml === 'function') {
      try {
        return String(S.escapeHtml(s));
      } catch (err) { /* fallthrough */ }
    }
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function closestEl(node, selector) {
    var el = node;
    while (el && el.nodeType !== 1) el = el.parentNode;
    if (!el || typeof el.closest !== 'function') return null;
    return el.closest(selector);
  }

  function restartAnimation(el) {
    if (!el) return;
    try {
      el.style.animation = 'none';
      /* 强制 reflow，让重新设置 animation 时能重新触发 CSS 动画 */
      void el.offsetWidth;
      el.style.animation = '';
      void el.offsetWidth;
    } catch (err) { /* noop */ }
  }

  /** 通过「移除 class → 强制 reflow → 重新加 class」重放一次 class 驱动的入场动画（如 .is-pop） */
  function popClass(el, className) {
    if (!el || !className) return;
    try {
      el.classList.remove(className);
      void el.offsetWidth;
      el.classList.add(className);
    } catch (err) { /* noop */ }
  }

  function consumeEvent(event) {
    if (!event) return;
    try { event.preventDefault(); } catch (e) { /* noop */ }
    try { event.stopPropagation(); } catch (e) { /* noop */ }
    try {
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    } catch (e) { /* noop */ }
  }

  function isEditableTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = String(target.tagName).toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return target.isContentEditable === true;
  }

  function callHandler(name, arg) {
    var fn = handlers[name];
    if (typeof fn !== 'function') return;
    try {
      fn(arg);
    } catch (err) {
      reportError('handler ' + name, err);
    }
  }

  /* ==========================================================================
   * 5. 页面 / 弹窗基础
   * ====================================================================== */

  function setScreen(name) {
    var screens = qsa('.screen');
    for (var i = 0; i < screens.length; i++) {
      var el = screens[i];
      var isTarget = el.getAttribute('data-screen') === name;
      el.classList.toggle('active', isTarget);
    }
  }

  function activeScreen() {
    var el = document.querySelector('.screen.active');
    return el ? (el.getAttribute('data-screen') || '') : '';
  }

  function syncBodyModalClass() {
    if (!document.body) return;
    var open = settingsOpen || !!pendingConfirm;
    document.body.classList.toggle('modal-open', open);
  }

  /* ==========================================================================
   * 6. 声音 / 全屏
   * ====================================================================== */

  function readAudioSettings() {
    var S = getStore();
    var raw = (S && S.settings && typeof S.settings === 'object' && S.settings.audio && typeof S.settings.audio === 'object')
      ? S.settings.audio : {};
    return {
      enabled: raw.enabled !== false,
      volume: clampNum(raw.volume, 0, 1, 0.7)
    };
  }

  function syncSoundButtons() {
    var enabled = readAudioSettings().enabled;
    var menuBtn = $('menu-sound-btn');
    if (menuBtn) {
      menuBtn.classList.toggle('is-off', !enabled);
      menuBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      menuBtn.setAttribute('title', enabled ? '音效开启 (M)' : '音效静音 (M)');
    }
    var testBtn = $('test-sound');
    if (testBtn) testBtn.classList.toggle('is-off', !enabled);
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function syncFullscreenButton() {
    var btn = $('menu-fullscreen-btn');
    if (!btn) return;
    var fs = isFullscreen();
    btn.classList.toggle('is-active', fs);
    btn.setAttribute('aria-pressed', fs ? 'true' : 'false');
    btn.setAttribute('title', fs ? '退出全屏 (F)' : '全屏 (F)');
  }

  function toggleFullscreen() {
    var el = document.documentElement;
    try {
      if (isFullscreen()) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) {
          var pExit = exit.call(document);
          if (pExit && typeof pExit.catch === 'function') pExit.catch(function () { /* noop */ });
        }
      } else {
        var request = el.requestFullscreen || el.webkitRequestFullscreen;
        if (typeof request !== 'function') {
          toast('当前环境不支持全屏模式', 'error');
          return;
        }
        var pReq = request.call(el);
        if (pReq && typeof pReq.catch === 'function') {
          pReq.catch(function () { toast('无法进入全屏模式', 'error'); });
        }
      }
    } catch (err) {
      toast('当前环境不支持全屏模式', 'error');
    }
    window.setTimeout(syncFullscreenButton, 120);
  }

  function toggleSound() {
    var audio = readAudioSettings();
    var next = !audio.enabled;
    patchSettings({ audio: { enabled: next, volume: audio.volume } });
    var A = getAudio();
    if (A && typeof A.setEnabled === 'function') {
      try { A.setEnabled(next); } catch (err) { reportError('AudioFX.setEnabled', err); }
    }
    if (next && A && typeof A.unlock === 'function') {
      try { A.unlock(); } catch (err) { /* noop */ }
    }
    syncSoundButtons();
    syncAudioControls();
    toast(next ? '音效已开启' : '音效已静音', next ? 'success' : 'info');
  }

  /* ==========================================================================
   * 7. 设置读取 / 写入
   * ====================================================================== */

  function normalizeCrosshair(raw) {
    var r = (raw && typeof raw === 'object') ? raw : {};
    return {
      style: CH_STYLES.indexOf(r.style) >= 0 ? r.style : DEFAULT_CROSSHAIR.style,
      color: normalizeHex(r.color) || DEFAULT_CROSSHAIR.color,
      size: clampNum(r.size, 6, 30, DEFAULT_CROSSHAIR.size),
      thickness: clampNum(r.thickness, 1, 6, DEFAULT_CROSSHAIR.thickness),
      gap: clampNum(r.gap, 0, 14, DEFAULT_CROSSHAIR.gap),
      opacity: clampNum(r.opacity, 0.2, 1, DEFAULT_CROSSHAIR.opacity),
      outline: r.outline !== false
    };
  }

  function readSettings() {
    var S = getStore();
    var raw = (S && S.settings && typeof S.settings === 'object') ? S.settings : {};
    var audio = readAudioSettings();
    return {
      aimMode: raw.aimMode === 'absolute' ? 'absolute' : 'relative',
      sensitivity: clampNum(raw.sensitivity, 0.2, 3, 1),
      targetScale: clampNum(raw.targetScale, 0.7, 1.4, 1),
      effects: raw.effects !== false,
      hdr: raw.hdr !== false,
      crosshair: normalizeCrosshair(raw.crosshair),
      audio: audio,
      lastMode: (typeof raw.lastMode === 'string' && raw.lastMode) ? raw.lastMode : 'gridshot'
    };
  }

  function patchSettings(patch) {
    var S = getStore();
    if (!S || typeof S.updateSettings !== 'function') return null;
    try {
      return S.updateSettings(patch) || null;
    } catch (err) {
      reportError('Store.updateSettings', err);
      return null;
    }
  }

  function patchCrosshair(patch) {
    var current = readSettings().crosshair;
    var next = normalizeCrosshair(mergeObjects(current, patch));
    patchSettings({ crosshair: next });
    schedulePreview();
    return next;
  }

  function mergeObjects(base, extra) {
    var out = {};
    var k;
    if (base && typeof base === 'object') {
      for (k in base) {
        if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
      }
    }
    if (extra && typeof extra === 'object') {
      for (k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
      }
    }
    return out;
  }

  function updateStorageCard() {
    var el = $('data-storage');
    if (!el) return;
    var S = getStore();
    var kb = 0;
    if (S && typeof S.storageKB === 'function') {
      try {
        var raw = S.storageKB();
        var v = toNum(raw);
        kb = v === null ? 0 : v;
      } catch (err) {
        kb = 0;
      }
    }
    el.textContent = (Math.round(kb * 10) / 10).toFixed(1) + ' KB';
  }

  /* ==========================================================================
   * 8. 主菜单
   * ====================================================================== */

  function emptyStateHtml(title, sub, small, iconId) {
    var cls = 'empty-state' + (small ? ' empty-state-sm' : '');
    var svg = iconId
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#' + iconId + '"/></svg>'
      : '';
    return '<div class="' + cls + '">' + svg + '<b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div>';
  }

  function renderModeCards() {
    var grid = $('mode-grid');
    if (!grid) return;
    var modes = allModes();
    if (!modes.length) {
      grid.innerHTML = emptyStateHtml('模式数据未就绪', '请刷新页面重新载入训练模块。', false, 'i-target');
      return;
    }
    var S = getStore();
    var bests = (S && S.records && S.records.bests && typeof S.records.bests === 'object')
      ? S.records.bests : {};

    var html = '';
    for (var i = 0; i < modes.length; i++) {
      var m = modes[i] || {};
      var id = m.id ? String(m.id) : ('mode-' + i);
      var accent = safeColor(m.accent, '#2ce8ff');
      var best = bests[id];
      var bestScore = best ? toNum(best.score) : null;
      var hasBest = bestScore !== null && bestScore > 0;
      var grade = '';
      if (hasBest) grade = validGrade(best.grade) || gradeFromThresholds(bestScore, m);
      var bestText = hasBest ? fmtScore(bestScore) : '--';
      var chip = grade
        ? '<span class="rank-chip ' + ('grade-' + grade.toLowerCase()) + '">' + grade + '</span>'
        : '<span class="rank-chip is-empty">--</span>';
      var duration = toNum(m.duration);
      var icon = MODE_ICONS[id] || ICON_FALLBACK;

      html += '<button class="mode-card" type="button" data-mode="' + esc(id) + '" style="--accent:' + accent + '">' +
        '<span class="mode-card-glow" aria-hidden="true"></span>' +
        '<span class="mode-card-top">' +
        '<span class="mode-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="mode-index mono">' + esc(m.index || pad2(i + 1)) + '</span>' +
        '</span>' +
        '<span class="mode-card-body">' +
        '<span class="mode-en mono">' + esc(m.en || id) + '</span>' +
        '<span class="mode-name">' + esc(m.name || '训练模式') + '</span>' +
        '<span class="mode-tagline">' + esc(m.tagline || '') + '</span>' +
        '</span>' +
        '<span class="mode-card-foot">' +
        '<span class="mode-best"><i>BEST</i><b>' + bestText + '</b></span>' +
        chip +
        '<span class="mode-go" aria-hidden="true">\u2192</span>' +
        '</span>' +
        '<span class="mode-duration mono">' + (duration !== null ? Math.round(duration) + 'S' : '--') + '</span>' +
        '</button>';
    }
    grid.innerHTML = html;
  }

  function renderRecent() {
    var host = $('recent-runs');
    if (!host) return;
    var S = getStore();
    var list = [];
    if (S && typeof S.recent === 'function') {
      try { list = S.recent(4) || []; } catch (err) { list = []; }
    }
    if ((!list || !list.length) && S && S.records && Array.isArray(S.records.history)) {
      list = S.records.history.slice(0, 4);
    }
    if (!list || !list.length) {
      host.innerHTML = emptyStateHtml('还没有训练记录', '选择上方模式，开始第一轮。', false, 'i-target');
      return;
    }
    var html = '';
    for (var i = 0; i < list.length && i < 4; i++) {
      var run = list[i] || {};
      var mode = modeById(run.modeId) || {
        id: run.modeId,
        name: '未知模式',
        en: 'UNKNOWN',
        accent: '#2ce8ff',
        duration: null
      };
      var accent = safeColor(mode.accent, '#2ce8ff');
      var score = fmtScore(run.score);
      var grade = validGrade(run.grade) || gradeFromThresholds(num(run.score), mode);
      var rank = grade
        ? '<small class="rank-text grade-' + grade.toLowerCase() + '">' + grade + '</small>'
        : '<small class="rank-text">--</small>';
      var duration = toNum(mode.duration);
      var small = formatRunTime(run.date) + (duration !== null ? ' \u00B7 ' + Math.round(duration) + 'S' : '');
      html += '<button class="recent-item" type="button" data-mode="' + esc(run.modeId || '') + '" style="--accent:' + accent + '">' +
        '<span class="recent-accent" aria-hidden="true"></span>' +
        '<span class="recent-main">' +
        '<b class="recent-mode">' + esc(mode.name || '训练模式') + '</b>' +
        '<small class="mono">' + esc(small) + '</small>' +
        '</span>' +
        '<span class="recent-score"><b>' + score + '</b>' + rank + '</span>' +
        '</button>';
    }
    host.innerHTML = html;
  }

  function renderTopRuns() {
    var host = $('top-runs');
    if (!host) return;
    var S = getStore();
    var list = [];
    if (S && typeof S.topRuns === 'function') {
      try { list = S.topRuns(4) || []; } catch (err) { list = []; }
    }
    if ((!list || !list.length) && S && S.records && Array.isArray(S.records.history)) {
      list = S.records.history.slice().sort(function (a, b) {
        return num(b && b.score) - num(a && a.score);
      }).slice(0, 4);
    }
    if (!list || !list.length) {
      host.innerHTML = emptyStateHtml('等待第一条数据', '本机记录，不会上传。', true, 'i-trophy');
      return;
    }
    var html = '';
    for (var i = 0; i < list.length && i < 4; i++) {
      var run = list[i] || {};
      var mode = modeById(run.modeId) || { name: '未知模式', labels: {} };
      var label = (mode.labels && mode.labels.accuracy) ? mode.labels.accuracy : '命中率';
      html += '<div class="top-run">' +
        '<span class="top-rank mono">' + pad2(i + 1) + '</span>' +
        '<span class="top-mode"><b>' + esc(mode.name || '训练模式') + '</b>' +
        '<small>' + esc(label) + ' ' + fmtPct(run.accuracy) + '%</small></span>' +
        '<b class="top-score">' + fmtScore(run.score) + '</b>' +
        '</div>';
    }
    host.innerHTML = html;
  }

  function refreshMenu() {
    var S = getStore();
    var modes = allModes();
    renderModeCards();

    var settings = readSettings();
    var last = modeById(settings.lastMode) || modes[0] || null;

    var quickMode = $('quick-start-mode');
    if (quickMode) {
      if (last) {
        var duration = toNum(last.duration);
        quickMode.textContent = (last.en || '') + ' \u00B7 ' + (duration !== null ? Math.round(duration) : '--') + 'S';
      } else {
        quickMode.textContent = '选择模式';
      }
    }

    var tip = $('menu-tip');
    if (tip) tip.textContent = (last && last.tip) ? last.tip : EMPTY_TIP_DEFAULT;

    var stats = null;
    if (S && typeof S.stats === 'function') {
      try { stats = S.stats(); } catch (err) { stats = null; }
    }
    var runs = stats ? num(stats.runs) : 0;
    var best = stats ? num(stats.bestScore) : 0;
    var avg = stats ? toNum(stats.avgAccuracy) : null;

    setText($('stat-runs'), String(Math.round(runs)));
    setText($('stat-best'), runs > 0 && best > 0 ? fmtScore(best) : '0');
    setText($('stat-acc'), runs > 0 && avg !== null ? fmtPct(avg) + '%' : '--');

    renderRecent();
    renderTopRuns();
    syncSoundButtons();
  }

  /* ==========================================================================
   * 9. 设置弹窗
   * ====================================================================== */

  function openSettings(tab) {
    var modal = $('settings-modal');
    if (!modal) return;
    syncSettingsUI();
    var selectedTab = selectSettingsTab(tab || 'controls');
    modal.classList.remove('hidden');
    settingsOpen = true;
    syncBodyModalClass();
    /* 弹窗显示后再次归零滚动位置：元素在 display:none 时设置 scrollTop 可能被浏览器忽略，
       再次打开时会恢复上一次长页签的滚动位置。 */
    try {
      var panesWrap = modal.querySelector('.settings-panes');
      if (panesWrap) {
        panesWrap.scrollTop = 0;
        var raf = window.requestAnimationFrame || function (fn) { return window.setTimeout(fn, 16); };
        raf(function () {
          if (settingsOpen && panesWrap) panesWrap.scrollTop = 0;
        });
      }
    } catch (err) { /* 滚动复位失败不影响设置面板 */ }
    restartAnimation(modal.querySelector('.modal-panel'));
    /* 打开后立刻画一次，再在下一帧补画（此时布局尺寸已稳定） */
    drawCrosshairPreview();
    schedulePreview();
    /* 通知扩展模块（MemeFX / MemeUI 等）设置面板已打开，由它们同步自己的控件 */
    emitSettingsEvent('aimlab:settings-open', { tab: selectedTab });
  }

  function closeSettings() {
    var modal = $('settings-modal');
    if (modal) modal.classList.add('hidden');
    settingsOpen = false;
    syncBodyModalClass();
    emitSettingsEvent('aimlab:settings-close', { tab: currentSettingsTab });
    if (activeScreen() === 'menu') refreshMenu();
  }

  /**
   * 设置页签切换。数据驱动：只要某个 [data-tab] 按钮或 [data-pane] 存在即可，
   * 这样后续新增页签（如整活 meme）时 UI 不需要硬编码白名单。
   * @returns {string} 实际选中的页签名
   */
  function selectSettingsTab(tab) {
    var requested = (typeof tab === 'string' && tab) ? tab : 'controls';
    var tabs = qsa('.settings-tab');
    var panes = qsa('.settings-pane');
    var exists = false;
    var i;
    for (i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('data-tab') === requested) { exists = true; break; }
    }
    if (!exists) {
      for (i = 0; i < panes.length; i++) {
        if (panes[i].getAttribute('data-pane') === requested) { exists = true; break; }
      }
    }
    var name = exists ? requested : 'controls';

    for (i = 0; i < tabs.length; i++) {
      var isActive = tabs[i].getAttribute('data-tab') === name;
      tabs[i].classList.toggle('active', isActive);
      tabs[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    for (i = 0; i < panes.length; i++) {
      panes[i].classList.toggle('active', panes[i].getAttribute('data-pane') === name);
    }

    /* 切换页签时回到顶部：否则从较长的「准星/整活」页切回来会保留旧滚动位置，
       页面看起来像从中段开始。 */
    try {
      var panesWrap = $('settings-modal') ? $('settings-modal').querySelector('.settings-panes') : null;
      if (panesWrap && 'scrollTop' in panesWrap) panesWrap.scrollTop = 0;
      for (i = 0; i < panes.length; i++) {
        if (panes[i].classList.contains('active') && 'scrollTop' in panes[i]) panes[i].scrollTop = 0;
      }
    } catch (err) { /* 滚动复位失败不影响设置面板 */ }

    currentSettingsTab = name;
    if (name === 'data') updateStorageCard();
    if (name === 'crosshair') {
      drawCrosshairPreview();
      schedulePreview();
    }
    emitSettingsEvent('aimlab:settings-tab', { tab: name });
    return name;
  }

  /** 派发设置弹窗生命周期事件，方便后续模块（MemeFX 等）自行同步面板 */
  function emitSettingsEvent(name, detail) {
    try {
      var event;
      if (typeof window.CustomEvent === 'function') {
        event = new window.CustomEvent(name, { detail: detail || {} });
      } else if (document.createEvent) {
        event = document.createEvent('CustomEvent');
        event.initCustomEvent(name, false, false, detail || {});
      } else {
        return;
      }
      document.dispatchEvent(event);
    } catch (err) { /* 扩展事件失败不影响主流程 */ }
  }

  function updateRangeProgress(input) {
    if (!input) return;
    var min = toNum(input.min);
    var max = toNum(input.max);
    var value = toNum(input.value);
    if (min === null) min = 0;
    if (max === null) max = 100;
    if (value === null) value = min;
    var ratio = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
    var pct = (ratio * 100).toFixed(2) + '%';
    try {
      input.style.setProperty('--range-progress', pct);
      var wrapParent = input.closest ? input.closest('.range-control') : null;
      if (wrapParent) wrapParent.style.setProperty('--range-progress', pct);
    } catch (err) { /* noop */ }
  }

  function updateAllRangeProgress() {
    qsa('input[type="range"]').forEach(updateRangeProgress);
  }

  function syncRangeInput(inputId, value, outputId, outputText) {
    var input = $(inputId);
    if (input) {
      input.value = String(value);
      updateRangeProgress(input);
    }
    var output = outputId ? $(outputId) : null;
    if (output) output.textContent = outputText;
  }

  function syncColorSwatches(color) {
    var target = normalizeHex(color) || DEFAULT_CROSSHAIR.color;
    qsa('[data-ch-color]').forEach(function (btn) {
      var swatchColor = normalizeHex(btn.getAttribute('data-ch-color'));
      var active = swatchColor === target;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var colorInput = $('set-ch-color');
    if (colorInput && /^#[0-9a-f]{6}$/i.test(target)) colorInput.value = target;
  }

  function syncCrosshairControls(crosshair) {
    var ch = crosshair || readSettings().crosshair;
    qsa('[data-ch-style]').forEach(function (btn) {
      var active = btn.getAttribute('data-ch-style') === ch.style;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    syncColorSwatches(ch.color);
    syncRangeInput('set-ch-size', Math.round(ch.size), 'ch-size-value', String(Math.round(ch.size)));
    syncRangeInput('set-ch-thickness', ch.thickness, 'ch-thickness-value', num(ch.thickness).toFixed(1));
    syncRangeInput('set-ch-gap', Math.round(ch.gap), 'ch-gap-value', String(Math.round(ch.gap)));
    syncRangeInput('set-ch-opacity', ch.opacity, 'ch-opacity-value', Math.round(ch.opacity * 100) + '%');
    var outline = $('set-ch-outline');
    if (outline) outline.checked = !!ch.outline;
  }

  function syncAudioControls() {
    var audio = readAudioSettings();
    var enabled = $('set-audio-enabled');
    if (enabled) enabled.checked = audio.enabled;
    syncRangeInput('set-audio-volume', audio.volume, 'set-volume-value', Math.round(audio.volume * 100) + '%');
    syncSoundButtons();
  }

  function syncSettingsUI() {
    var settings = readSettings();

    qsa('[data-aim-mode]').forEach(function (btn) {
      var active = btn.getAttribute('data-aim-mode') === settings.aimMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    syncRangeInput('set-sensitivity', settings.sensitivity, 'set-sens-value', settings.sensitivity.toFixed(2));
    syncRangeInput('set-target-scale', settings.targetScale, 'set-target-value', settings.targetScale.toFixed(2) + '\u00D7');

    var effects = $('set-effects');
    if (effects) effects.checked = !!settings.effects;

    var hdrSwitch = $('set-hdr');
    var hdrNote = $('set-hdr-note');
    var hdrSupported = !!(window.matchMedia && window.matchMedia('(dynamic-range: high)').matches);
    if (hdrSwitch) {
      hdrSwitch.checked = settings.hdr !== false;
      hdrSwitch.disabled = !hdrSupported;
    }
    if (hdrNote) {
      hdrNote.textContent = hdrSupported
        ? '在支持的显示器上启用峰值高光和广色域；关闭后普通渲染'
        : '当前设备/浏览器未声明 HDR，保持普通渲染';
    }

    syncCrosshairControls(settings.crosshair);
    syncAudioControls();
    updateStorageCard();
    updateAllRangeProgress();
  }

  function drawCrosshairPreview() {
    var canvas = $('crosshair-preview');
    var C = getCrosshair();
    if (!canvas || !C || typeof C.drawPreview !== 'function') return;
    try {
      C.drawPreview(canvas, readSettings().crosshair);
    } catch (err) {
      reportError('Crosshair.drawPreview', err);
    }
  }

  function schedulePreview() {
    if (previewRaf) return;
    var raf = window.requestAnimationFrame || function (fn) { return window.setTimeout(fn, 16); };
    previewRaf = raf(function () {
      previewRaf = 0;
      drawCrosshairPreview();
    });
  }

  function onWindowResize() {
    if (resizeRaf) return;
    var raf = window.requestAnimationFrame || function (fn) { return window.setTimeout(fn, 16); };
    resizeRaf = raf(function () {
      resizeRaf = 0;
      if (settingsOpen) drawCrosshairPreview();
      if (activeScreen() === 'results' && lastResultsSummary) {
        drawResultsChart($('result-chart'), lastResultsSummary);
      }
    });
  }

  /* ---- 设置控件绑定 ------------------------------------------------------ */

  function bindSettingsControls() {
    qsa('.settings-tab').forEach(function (btn) {
      on(btn, 'click', function () {
        selectSettingsTab(btn.getAttribute('data-tab'));
      });
    });

    qsa('[data-aim-mode]').forEach(function (btn) {
      on(btn, 'click', function () {
        var aimMode = btn.getAttribute('data-aim-mode') === 'absolute' ? 'absolute' : 'relative';
        patchSettings({ aimMode: aimMode });
        qsa('[data-aim-mode]').forEach(function (item) {
          var active = item === btn;
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      });
    });

    bindRange('set-sensitivity', 'set-sens-value', function (v) {
      patchSettings({ sensitivity: round(v, 2) });
      return v.toFixed(2);
    });
    bindRange('set-target-scale', 'set-target-value', function (v) {
      patchSettings({ targetScale: round(v, 2) });
      return v.toFixed(2) + '\u00D7';
    });

    var effects = $('set-effects');
    on(effects, 'change', function () {
      patchSettings({ effects: !!effects.checked });
    });

    var hdrSwitch = $('set-hdr');
    on(hdrSwitch, 'change', function () {
      var enabled = !!hdrSwitch.checked;
      patchSettings({ hdr: enabled });
      try {
        document.dispatchEvent(new window.CustomEvent('aimlab:hdr-change', { detail: { enabled: enabled } }));
      } catch (err) { /* 忽略事件派发失败 */ }
    });

    /* 准星控件 */
    qsa('[data-ch-style]').forEach(function (btn) {
      on(btn, 'click', function () {
        var style = btn.getAttribute('data-ch-style');
        if (CH_STYLES.indexOf(style) < 0) return;
        patchCrosshair({ style: style });
        qsa('[data-ch-style]').forEach(function (item) {
          item.classList.toggle('active', item === btn);
          item.setAttribute('aria-pressed', item === btn ? 'true' : 'false');
        });
      });
    });

    qsa('[data-ch-color]').forEach(function (btn) {
      on(btn, 'click', function () {
        var color = normalizeHex(btn.getAttribute('data-ch-color'));
        if (!color) return;
        patchCrosshair({ color: color });
        syncColorSwatches(color);
      });
    });

    var colorInput = $('set-ch-color');
    on(colorInput, 'input', function () {
      var color = normalizeHex(colorInput.value);
      if (!color) return;
      patchCrosshair({ color: color });
      syncColorSwatches(color);
    });

    bindRange('set-ch-size', 'ch-size-value', function (v) {
      patchCrosshair({ size: round(v, 0) });
      return String(Math.round(v));
    });
    bindRange('set-ch-thickness', 'ch-thickness-value', function (v) {
      patchCrosshair({ thickness: round(v, 1) });
      return v.toFixed(1);
    });
    bindRange('set-ch-gap', 'ch-gap-value', function (v) {
      patchCrosshair({ gap: round(v, 0) });
      return String(Math.round(v));
    });
    bindRange('set-ch-opacity', 'ch-opacity-value', function (v) {
      patchCrosshair({ opacity: round(v, 2) });
      return Math.round(v * 100) + '%';
    });

    var outline = $('set-ch-outline');
    on(outline, 'change', function () {
      patchCrosshair({ outline: !!outline.checked });
    });

    on($('reset-crosshair'), 'click', resetCrosshair);

    /* 音效控件 */
    var audioEnabled = $('set-audio-enabled');
    on(audioEnabled, 'change', function () {
      var enabled = !!audioEnabled.checked;
      patchSettings({ audio: { enabled: enabled, volume: readAudioSettings().volume } });
      var A = getAudio();
      if (A && typeof A.setEnabled === 'function') {
        try { A.setEnabled(enabled); } catch (err) { reportError('AudioFX.setEnabled', err); }
      }
      if (enabled && A && typeof A.unlock === 'function') {
        try { A.unlock(); } catch (err) { /* noop */ }
      }
      syncSoundButtons();
    });

    bindRange('set-audio-volume', 'set-volume-value', function (v) {
      var volume = round(v, 2);
      patchSettings({ audio: { volume: volume, enabled: readAudioSettings().enabled } });
      var A = getAudio();
      if (A && typeof A.setVolume === 'function') {
        try { A.setVolume(volume); } catch (err) { reportError('AudioFX.setVolume', err); }
      }
      return Math.round(v * 100) + '%';
    });

    on($('test-sound'), 'click', function () {
      var A = getAudio();
      if (!A || typeof A.test !== 'function') return;
      var ok = false;
      try {
        /* AudioFX.test() 内部会 unlock，且即使总开关关闭也会发声（便于确认设备音量） */
        ok = A.test();
      } catch (err) {
        reportError('AudioFX.test', err);
      }
      if (!ok) toast('当前环境无法播放音效', 'error');
    });

    /* 数据操作 */
    on($('clear-data'), 'click', clearRecords);
    on($('reset-settings'), 'click', resetSettings);

    /* 关闭 */
    qsa('[data-close-settings]').forEach(function (btn) {
      on(btn, 'click', function () {
        closeSettings();
      });
    });
    on($('settings-done'), 'click', closeSettings);
  }

  function bindRange(inputId, outputId, apply) {
    var input = $(inputId);
    if (!input) return;
    var output = outputId ? $(outputId) : null;
    on(input, 'input', function () {
      var value = toNum(input.value);
      if (value === null) return;
      updateRangeProgress(input);
      var text = apply(value);
      if (output && text !== undefined && text !== null) output.textContent = text;
    });
  }

  function resetCrosshair() {
    var next = patchCrosshair(DEFAULT_CROSSHAIR);
    syncCrosshairControls(next);
    drawCrosshairPreview();
    toast('准星已恢复默认', 'success');
  }

  function clearRecords() {
    confirm({
      title: '清除全部训练记录？',
      text: '所有模式的最佳成绩与最近训练历史都会被删除，此操作无法撤销。设置不会受影响。',
      okText: '清除记录',
      cancelText: '取消',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      var S = getStore();
      if (S && typeof S.clearRecords === 'function') {
        try { S.clearRecords(); } catch (err) { reportError('Store.clearRecords', err); }
      }
      refreshMenu();
      updateStorageCard();
      toast('训练记录已清除', 'success');
    });
  }

  function resetSettings() {
    confirm({
      title: '恢复默认设置？',
      text: '灵敏度、准星与音效都会恢复默认值，训练记录不会受到影响。',
      okText: '恢复默认',
      cancelText: '取消',
      danger: false
    }).then(function (ok) {
      if (!ok) return;
      var S = getStore();
      if (S && typeof S.resetSettings === 'function') {
        try { S.resetSettings(); } catch (err) { reportError('Store.resetSettings', err); }
      }
      var settings = readSettings();
      var A = getAudio();
      if (A && typeof A.setEnabled === 'function') {
        try { A.setEnabled(settings.audio.enabled); } catch (err) { /* noop */ }
      }
      if (A && typeof A.setVolume === 'function') {
        try { A.setVolume(settings.audio.volume); } catch (err) { /* noop */ }
      }
      syncSettingsUI();
      drawCrosshairPreview();
      refreshMenu();
      toast('设置已恢复默认', 'success');
    });
  }

  /* ==========================================================================
   * 10. 游戏 HUD / 倒计时 / 暂停
   * ====================================================================== */

  function pointerIsCoarse() {
    try {
      return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (err) {
      return false;
    }
  }

  function showGame(mode) {
    var m = mode || modeById(readSettings().lastMode) || null;
    var fallback = {
      id: m && m.id ? m.id : 'unknown',
      en: 'AIMLAB',
      name: '训练',
      duration: 60,
      labels: {}
    };
    var current = m || fallback;

    setScreen('game');
    hidePause();
    setCountdown(null);
    if (document.body) document.body.classList.remove('is-paused');
    syncBodyModalClass();

    setText($('hud-mode-en'), current.en || 'AIMLAB');
    setText($('hud-mode-name'), current.name || '训练');

    var isTracking = current.id === 'tracking';
    var labels = (current && current.labels) || {};
    setText($('hud-hits-label'), isTracking ? (labels.hits || '在靶时间') : 'HITS');

    var duration = toNum(current.duration);
    setText($('hud-timer'), (duration !== null ? duration : 0).toFixed(1));
    setText($('hud-score'), '0');
    setText($('hud-acc'), '--');
    setText($('hud-hits'), '0');
    setText($('hud-streak'), '0');

    var timerWrap = $('hud-timer-wrap');
    if (timerWrap) timerWrap.classList.remove('low');

    var progress = $('hud-progress');
    if (progress) progress.style.width = '0%';

    var combo = $('hud-combo');
    if (combo) {
      combo.classList.add('hidden');
      combo.classList.remove('is-pop');
    }
    lastComboMultiplier = 1;
    countdownVisible = false;
    var comboFill = $('hud-combo-fill');
    if (comboFill) comboFill.style.width = '0%';
    var comboMult = $('hud-combo-mult');
    if (comboMult) comboMult.textContent = '\u00D71.0';

    var settings = readSettings();
    var aimLabel = (pointerIsCoarse() || settings.aimMode === 'absolute') ? 'ABSOLUTE AIM' : 'RELATIVE AIM';
    setText($('hud-aim-mode'), aimLabel);

    var hint = $('hud-hint');
    if (hint) {
      var isRelative = settings.aimMode === 'relative' && !pointerIsCoarse();
      if (isTracking) {
        hint.textContent = isRelative
          ? '移动鼠标转动视角 \u00B7 保持目标在准星内 \u00B7 ESC 暂停'
          : '保持准星在靶内 \u00B7 ESC 暂停';
      } else {
        hint.textContent = isRelative
          ? '移动鼠标转动视角 \u00B7 左键射击 \u00B7 ESC 暂停'
          : '移动瞄准 \u00B7 左键射击 \u00B7 ESC 暂停';
      }
    }

    syncFullscreenButton();
  }

  function updateHud(hud) {
    if (!hud || typeof hud !== 'object') return;

    var timeLeft = toNum(hud.timeLeft);
    var duration = toNum(hud.duration);
    if (timeLeft !== null) setText($('hud-timer'), Math.max(0, timeLeft).toFixed(1));

    var timerWrap = $('hud-timer-wrap');
    if (timerWrap) timerWrap.classList.toggle('low', timeLeft !== null && timeLeft < 5);

    var progressValue = toNum(hud.progress);
    if (progressValue === null && timeLeft !== null && duration !== null && duration > 0) {
      progressValue = 1 - timeLeft / duration;
    }
    var progressEl = $('hud-progress');
    if (progressEl) progressEl.style.width = (clamp(progressValue === null ? 0 : progressValue, 0, 1) * 100).toFixed(2) + '%';

    setText($('hud-score'), fmtScore(hud.score));

    var accuracy = toNum(hud.accuracy);
    setText($('hud-acc'), accuracy === null ? '--' : fmtPct(accuracy) + '%');

    setText($('hud-hits'), hud.tracking ? num(hud.hits).toFixed(1) : String(Math.round(num(hud.hits))));
    setText($('hud-streak'), String(Math.round(num(hud.streak))));

    setText($('hud-aim-mode'), hud.aimMode === 'absolute' ? 'ABSOLUTE AIM' : 'RELATIVE AIM');

    var multiplier = toNum(hud.multiplier);
    if (multiplier === null) {
      var streak = num(hud.streak);
      multiplier = Math.min(2, 1 + Math.max(0, streak - 1) * 0.02);
    }
    var comboVisible = multiplier > 1.001;
    var combo = $('hud-combo');
    if (combo) {
      combo.classList.toggle('hidden', !comboVisible);
      /* 倍率上涨时给连击区一个 pop（styles.css: .hud-combo.is-pop） */
      if (comboVisible && multiplier > lastComboMultiplier + 0.0001) {
        popClass(combo, 'is-pop');
      }
    }
    lastComboMultiplier = comboVisible ? multiplier : 1;
    var comboMult = $('hud-combo-mult');
    if (comboMult) comboMult.textContent = '\u00D7' + num(multiplier).toFixed(1);
    var comboFill = $('hud-combo-fill');
    if (comboFill) comboFill.style.width = (clamp(multiplier - 1, 0, 1) * 100).toFixed(1) + '%';
  }

  function setCountdown(value, label) {
    var wrap = $('countdown');
    var valueEl = $('countdown-value');
    var labelEl = $('countdown-label');

    if (value === null || value === undefined || value === '') {
      countdownVisible = false;
      if (wrap) {
        wrap.classList.add('hidden');
        wrap.classList.remove('is-go', 'is-pop');
      }
      if (valueEl) {
        valueEl.textContent = '';
        valueEl.classList.remove('is-pop');
      }
      if (labelEl) labelEl.textContent = 'GET READY';
      return;
    }

    if (!wrap) return;
    var text = String(value);
    var isGo = text.toUpperCase() === 'GO';
    var wasVisible = countdownVisible;
    countdownVisible = true;
    wrap.classList.remove('hidden');
    wrap.classList.toggle('is-go', isGo);
    if (labelEl) labelEl.textContent = label || (isGo ? 'GO' : 'GET READY');
    if (valueEl) {
      valueEl.textContent = text;
      /* 数字弹入：styles.css 的 .countdown-value.is-pop / .countdown.is-pop */
      popClass(valueEl, 'is-pop');
    }
    if (!wasVisible) restartAnimation(wrap);
  }

  function showPause(info) {
    var overlay = $('pause-overlay');
    if (!overlay) return;
    var data = (info && typeof info === 'object') ? info : {};
    setText($('pause-score'), fmtScore(data.score));
    var timeLeft = toNum(data.timeLeft);
    setText($('pause-time'), (timeLeft === null ? 0 : Math.max(0, timeLeft)).toFixed(1));
    overlay.classList.remove('hidden');
    if (document.body) document.body.classList.add('is-paused');
    var gameScreen = $('screen-game');
    if (gameScreen) gameScreen.classList.add('is-paused');
    restartAnimation(overlay.querySelector('.pause-panel'));
  }

  function hidePause() {
    var overlay = $('pause-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (document.body) document.body.classList.remove('is-paused');
    var gameScreen = $('screen-game');
    if (gameScreen) gameScreen.classList.remove('is-paused');
  }

  function bindHudControls() {
    on($('hud-pause'), 'click', function (event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      /* main.js 的 handlers 提供 pause: () => Game.togglePause() */
      callHandler('pause');
    });

    on($('pause-resume'), 'click', function (event) {
      if (event) event.stopPropagation();
      callHandler('resume');
    });
    on($('pause-restart'), 'click', function (event) {
      if (event) event.stopPropagation();
      callHandler('restart');
    });
    on($('pause-quit'), 'click', function (event) {
      if (event) event.stopPropagation();
      callHandler('quit');
      /* 兜底：若 Game 没有自己切回菜单，则由 UI 收回菜单页 */
      if (activeScreen() === 'game') showMenu();
    });

    var overlay = $('pause-overlay');
    on(overlay, 'pointerdown', function (event) {
      if (event) event.stopPropagation();
    });
    on(overlay, 'click', function (event) {
      if (event) event.stopPropagation();
    });
  }

  /* ==========================================================================
   * 11. 结算页
   * ====================================================================== */

  function statTile(label, mainText, unit, barPercent) {
    var valueHtml = esc(mainText);
    if (unit) valueHtml += '<span>' + esc(unit) + '</span>';
    var width = clamp(toNum(barPercent) === null ? 0 : toNum(barPercent), 0, 100);
    return '<div class="result-stat">' +
      '<span class="result-stat-label">' + esc(label) + '</span>' +
      '<b class="result-stat-value">' + valueHtml + '</b>' +
      '<span class="result-stat-bar"><i style="width:' + width.toFixed(1) + '%"></i></span>' +
      '</div>';
  }

  function renderResultStats(summary, mode) {
    var host = $('result-stats');
    if (!host) return;
    summary = summary || {};
    mode = mode || {};
    var labels = mode.labels || {};
    var isTracking = !!summary.tracking || (mode && mode.id === 'tracking');

    var accuracy = clamp(num(summary.accuracy), 0, 100);
    var score = num(summary.score);
    var elapsed = toNum(summary.elapsed);
    if (elapsed === null || elapsed <= 0) elapsed = toNum(summary.duration);
    if (elapsed === null || elapsed <= 0) elapsed = 1;

    var hits = num(summary.hits);
    var misses = num(summary.misses);
    var shots = toNum(summary.shots);
    if (shots === null || shots <= 0) shots = hits + misses;
    var bestCombo = num(summary.bestCombo);
    var avgTtk = num(summary.avgTtk);

    var html = '';
    if (isTracking) {
      var onTarget = num(summary.onTargetTime);
      var offTarget = num(summary.offTargetTime);
      var totalTarget = onTarget + offTarget;
      var onRatio = totalTarget > 0 ? clamp(onTarget / totalTarget * 100, 0, 100) : 0;
      var offset = num(summary.avgOffset);
      var rate = score / Math.max(0.001, elapsed);
      html += statTile(labels.accuracy || '跟枪率', fmtPct(accuracy), '%', accuracy);
      html += statTile(labels.hits || '在靶时间', onTarget.toFixed(1), 's', onRatio);
      html += statTile(labels.misses || '脱靶时间', offTarget.toFixed(1), 's', totalTarget > 0 ? (100 - onRatio) : 0);
      html += statTile(labels.ttk || '平均偏离', String(Math.round(offset)), 'px', clamp(100 - offset * 0.5, 0, 100));
      html += statTile(labels.streak || '最高连击', String(Math.round(bestCombo)), '', clamp(bestCombo * 8, 0, 100));
      html += statTile(labels.rate || '得分效率', rate.toFixed(1), 'pts/s', clamp(rate / 3, 0, 100));
    } else {
      var kps = toNum(summary.kps);
      if (kps === null) kps = hits / Math.max(0.001, elapsed);
      var ttkText = hits > 0 ? String(Math.round(avgTtk)) : '--';
      var ttkBar = hits > 0 ? clamp(100 - avgTtk / 30, 0, 100) : 0;
      html += statTile(labels.accuracy || '命中率', fmtPct(accuracy), '%', accuracy);
      html += statTile(labels.hits || '命中', String(Math.round(hits)), '', clamp(hits / Math.max(1, shots) * 100, 0, 100));
      html += statTile(labels.misses || '失误', String(Math.round(misses)), '', clamp(misses / Math.max(1, shots) * 100, 0, 100));
      html += statTile(labels.ttk || '平均 TTK', ttkText, hits > 0 ? 'ms' : '', ttkBar);
      html += statTile(labels.streak || '最高连击', String(Math.round(bestCombo)), '', clamp(bestCombo * 8, 0, 100));
      html += statTile(labels.rate || '每秒命中', kps.toFixed(1), '/s', clamp(kps * 10, 0, 100));
    }
    host.innerHTML = html;
  }

  /** 评级环填充：styles.css 里 .grade-ring-accent 的 stroke-dasharray 为 666 */
  function updateGradeRing(grade) {
    var ring = $('result-grade-ring');
    if (!ring) return;
    var fraction = GRADE_RING_FILL[grade];
    if (typeof fraction !== 'number') fraction = GRADE_RING_FILL.D;
    var offset = GRADE_RING_CIRCUMFERENCE * (1 - clamp(fraction, 0, 1));
    try {
      ring.style.strokeDashoffset = offset.toFixed(1);
    } catch (err) { /* noop */ }
  }

  function updateRankProgress(score, mode) {
    var S = getStore();
    var info = null;
    if (S && typeof S.nextGrade === 'function') {
      try { info = S.nextGrade(score, mode); } catch (err) { info = null; }
    }
    if (!info || typeof info !== 'object') info = fallbackNextGrade(score, mode);

    var grade = validGrade(info.grade) || gradeFromThresholds(score, mode);
    var progress = toNum(info.progress);
    if (progress === null) progress = 0;

    var bar = $('result-rank-bar');
    if (bar) bar.style.width = (clamp(progress, 0, 1) * 100).toFixed(1) + '%';

    var note = $('result-rank-note');
    if (!note) return;
    var next = validGrade(info.next);
    var need = toNum(info.need);
    if (!next || need === null || need <= 0) {
      note.textContent = '已达最高评级 ' + grade;
    } else {
      note.textContent = '距 ' + next + ' 级还差 ' + fmtScore(need) + ' 分';
    }
  }

  function updateChartMeta(summary) {
    var el = $('result-chart-meta');
    if (!el) return;
    var buckets = (summary && Array.isArray(summary.buckets)) ? summary.buckets : [];
    var max = 0;
    for (var i = 0; i < buckets.length; i++) {
      var v = toNum(buckets[i]);
      if (v !== null && v > max) max = v;
    }
    el.textContent = max > 0 ? ('峰值 ' + fmtScore(max) + ' / SEC') : 'SCORE / SEC';
  }

  function showResults(summary) {
    if (!summary || typeof summary !== 'object') return;
    lastResultsSummary = summary;

    var mode = summary.mode || modeById(summary.modeId) || {};
    var score = num(summary.score);
    var grade = validGrade(summary.grade) || gradeFromThresholds(score, mode);
    var rank = RANK_TITLES[grade] || RANK_TITLES.D;

    setScreen('results');
    hidePause();
    setCountdown(null);
    if (document.body) document.body.classList.remove('is-paused');
    syncBodyModalClass();

    var root = $('screen-results');
    if (root) {
      GRADE_CLASSES.forEach(function (cls) { root.classList.remove(cls); });
      root.classList.add('grade-' + grade.toLowerCase());
    }
    updateGradeRing(grade);

    setText($('result-mode-en'), mode.en || 'AIMLAB');
    setText($('result-mode-name'), mode.name || '训练模式');
    setText($('result-grade'), grade);
    setText($('result-title'), rank.title);
    setText($('result-subtitle'), rank.subtitle);
    setText($('result-score'), fmtScore(score));
    setText($('result-date'), formatStamp(summary.date));

    var S = getStore();
    var record = (S && S.records && S.records.bests && S.records.bests[summary.modeId])
      ? S.records.bests[summary.modeId] : null;
    var personalBest = record ? toNum(record.score) : null;
    if (personalBest === null || personalBest <= 0) personalBest = score;
    /* 新纪录以本局分数为准（正常流程 Game 已先 recordRun，两者相同；
       即使存档写入失败也不至于把 NEW RECORD 显示成旧分数） */
    if (summary.newBest) personalBest = Math.max(personalBest, score);
    var notePrefix = summary.newBest ? 'NEW RECORD \u00B7 ' : 'PERSONAL BEST \u00B7 ';
    setText($('result-score-note'), notePrefix + fmtScore(personalBest));

    var newBest = $('new-best');
    if (newBest) {
      newBest.classList.toggle('hidden', !summary.newBest);
      if (summary.newBest) restartAnimation(newBest);
    }

    renderResultStats(summary, mode);
    updateRankProgress(score, mode);
    updateChartMeta(summary);

    drawResultsChart($('result-chart'), summary);
    /* 切换屏幕后布局可能尚未完成，下一帧再补画一次 */
    var raf = window.requestAnimationFrame || function (fn) { return window.setTimeout(fn, 16); };
    raf(function () {
      if (lastResultsSummary === summary && activeScreen() === 'results') {
        drawResultsChart($('result-chart'), summary);
      }
    });
  }

  /* ==========================================================================
   * 12. 结算图表（每秒得分柱状 + 累计折线）
   * ====================================================================== */

  function drawResultsChart(canvas, summary) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    var ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (err) { ctx = null; }
    if (!ctx) return;

    var data = (summary && typeof summary === 'object') ? summary : {};
    var mode = data.mode || modeById(data.modeId) || {};
    var accent = safeColor(mode.accent, '#2ce8ff');
    var dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));

    var rect = null;
    try { rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null; } catch (err) { rect = null; }
    var cssW = Math.round((rect && rect.width) || canvas.clientWidth || 640) || 640;
    var cssH = Math.round((rect && rect.height) || canvas.clientHeight || 190) || 190;
    if (cssW < 60) cssW = 640;
    if (cssH < 40) cssH = 190;

    var backingW = Math.max(1, Math.round(cssW * dpr));
    var backingH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== backingW) canvas.width = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var rawBuckets = Array.isArray(data.buckets) ? data.buckets : [];
    var count = rawBuckets.length;
    var buckets = new Array(count);
    for (var i = 0; i < count; i++) {
      var v = toNum(rawBuckets[i]);
      buckets[i] = (v !== null && v > 0) ? v : 0;
    }

    var padL = 8;
    var padR = 8;
    var padT = 10;
    var padB = 20;
    var plotW = Math.max(1, cssW - padL - padR);
    var plotH = Math.max(1, cssH - padT - padB);

    if (!count) {
      ctx.fillStyle = 'rgba(139,162,189,.65)';
      ctx.font = '11px "Cascadia Mono", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无逐秒数据', cssW / 2, cssH / 2);
      return;
    }

    var maxScore = 0;
    var cumulative = new Array(count);
    var running = 0;
    for (i = 0; i < count; i++) {
      if (buckets[i] > maxScore) maxScore = buckets[i];
      running += buckets[i];
      cumulative[i] = running;
    }
    if (maxScore <= 0) maxScore = 1;
    var maxCumulative = running > 0 ? running : 1;

    var step = plotW / count;

    /* 水平参考线 */
    ctx.strokeStyle = 'rgba(120,180,230,.10)';
    ctx.lineWidth = 1;
    for (var g = 1; g <= 3; g++) {
      var gy = Math.round(padT + plotH * g / 4) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + plotW, gy);
      ctx.stroke();
    }

    /* 基线 */
    ctx.strokeStyle = 'rgba(140,190,235,.22)';
    ctx.beginPath();
    ctx.moveTo(padL, Math.round(padT + plotH) + 0.5);
    ctx.lineTo(padL + plotW, Math.round(padT + plotH) + 0.5);
    ctx.stroke();

    /* 每秒得分柱 */
    var barW = Math.max(1.2, Math.min(step * 0.62, 16));
    for (i = 0; i < count; i++) {
      var h = buckets[i] / maxScore * plotH;
      if (h <= 0) continue;
      var x = padL + step * i + (step - barW) / 2;
      var y = padT + plotH - h;
      ctx.fillStyle = hexToRgba(accent, 0.42);
      ctx.fillRect(x, y, barW, h);
      ctx.fillStyle = hexToRgba(accent, 0.9);
      ctx.fillRect(x, y, barW, Math.min(2, h));
    }

    /* 累计折线 + 渐变面积 */
    var points = new Array(count);
    for (i = 0; i < count; i++) {
      var px = padL + step * i + step / 2;
      var py = padT + plotH - (cumulative[i] / maxCumulative) * (plotH * 0.94);
      points[i] = [px, py];
    }

    var gradient = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    gradient.addColorStop(0, hexToRgba(accent, 0.18));
    gradient.addColorStop(1, hexToRgba(accent, 0));
    ctx.beginPath();
    ctx.moveTo(points[0][0], padT + plotH);
    for (i = 0; i < count; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.lineTo(points[count - 1][0], padT + plotH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (i = 1; i < count; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = 'rgba(233,244,255,.82)';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    /* 失误标记 */
    var missesAt = Array.isArray(data.missesAt) ? data.missesAt : [];
    ctx.fillStyle = 'rgba(255,84,112,.85)';
    for (var k = 0; k < missesAt.length; k++) {
      var second = toNum(missesAt[k]);
      if (second === null) continue;
      var idx = Math.round(second);
      if (idx < 0) idx = 0;
      if (idx > count - 1) idx = count - 1;
      var mx = padL + step * idx + step / 2;
      ctx.fillRect(mx - 0.75, cssH - padB + 3, 1.5, 5);
    }

    /* 坐标文字 */
    ctx.font = '10px "Cascadia Mono", Consolas, monospace';
    ctx.fillStyle = 'rgba(139,162,189,.6)';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('0S', padL, cssH - 12);
    ctx.textAlign = 'right';
    ctx.fillText(count + 'S', padL + plotW, cssH - 12);
  }

  /* ==========================================================================
   * 13. 分享
   * ====================================================================== */

  function buildShareText(summary) {
    var mode = summary.mode || modeById(summary.modeId) || {};
    var score = num(summary.score);
    var grade = validGrade(summary.grade) || gradeFromThresholds(score, mode);
    var rank = RANK_TITLES[grade] || RANK_TITLES.D;
    var accLabel = (mode.labels && mode.labels.accuracy) ? mode.labels.accuracy : '命中率';
    var acc = toNum(summary.accuracy);
    var lines = [];
    lines.push('AIMLAB WEB \u00B7 ' + (mode.name || '训练模式') + (mode.en ? '\uFF08' + mode.en + '\uFF09' : ''));
    lines.push('得分 ' + fmtScore(score) + ' \u00B7 ' + accLabel + ' ' + fmtPct(acc === null ? 0 : acc) + '% \u00B7 评级 ' + grade);
    lines.push(rank.title + ' \u2014\u2014 ' + rank.subtitle);
    return lines.join('\n');
  }

  function fallbackCopyText(text) {
    var textarea = null;
    try {
      textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      textarea.style.left = '-1000px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      if (typeof textarea.setSelectionRange === 'function') {
        textarea.setSelectionRange(0, textarea.value.length);
      }
      var ok = typeof document.execCommand === 'function' && document.execCommand('copy');
      document.body.removeChild(textarea);
      return !!ok;
    } catch (err) {
      if (textarea && textarea.parentNode) textarea.parentNode.removeChild(textarea);
      return false;
    }
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      var clipboard = (typeof navigator !== 'undefined') ? navigator.clipboard : null;
      if (clipboard && typeof clipboard.writeText === 'function') {
        try {
          clipboard.writeText(text).then(function () {
            resolve(true);
          }, function () {
            resolve(fallbackCopyText(text));
          });
          return;
        } catch (err) { /* fallthrough */ }
      }
      resolve(fallbackCopyText(text));
    });
  }

  function shareResults() {
    if (!lastResultsSummary) {
      toast('暂无可分享的成绩', 'info');
      return;
    }
    var text = buildShareText(lastResultsSummary);
    copyText(text).then(function (ok) {
      toast(ok ? '成绩已复制到剪贴板' : '复制失败，请手动截图分享', ok ? 'success' : 'error');
    });
  }

  function bindResultsControls() {
    on($('results-retry'), 'click', function () { callHandler('retry'); });
    on($('results-menu'), 'click', function () {
      callHandler('exitToMenu');
      /* 兜底：若 Game 没自己切回菜单，UI 负责收回菜单页（重复调用无害） */
      if (activeScreen() === 'results') showMenu();
    });
    on($('results-share'), 'click', function () { shareResults(); });
  }

  /* ==========================================================================
   * 14. Toast
   * ====================================================================== */

  var TOAST_LIFE = 2600;
  var TOAST_LEAVE = 240;
  var TOAST_MAX = 4;

  function toast(message, type) {
    var root = $('toast-root');
    if (!root) return;
    var toastType = (type === 'success' || type === 'error') ? type : 'info';

    var el = document.createElement('div');
    el.className = 'toast toast-' + toastType;

    var dot = document.createElement('span');
    dot.className = 'toast-dot';
    var msg = document.createElement('span');
    msg.className = 'toast-msg';
    msg.textContent = (message === null || message === undefined) ? '' : String(message);
    el.appendChild(dot);
    el.appendChild(msg);
    root.appendChild(el);

    while (root.children && root.children.length > TOAST_MAX) {
      var oldest = root.firstChild;
      if (!oldest) break;
      root.removeChild(oldest);
    }

    window.setTimeout(function () {
      el.classList.add('is-leaving');
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, TOAST_LEAVE);
    }, TOAST_LIFE);
  }

  /* ==========================================================================
   * 15. 确认框（Promise）
   * ====================================================================== */

  function isConfirmOpen() {
    return !!pendingConfirm;
  }

  function settleConfirm(result) {
    if (!pendingConfirm) return;
    var state = pendingConfirm;
    pendingConfirm = null;
    var modal = $('confirm-modal');
    if (modal) modal.classList.add('hidden');
    syncBodyModalClass();
    try {
      state.resolve(!!result);
    } catch (err) {
      reportError('confirm resolve', err);
    }
  }

  function confirm(options) {
    var opts = (options && typeof options === 'object') ? options : {};
    return new Promise(function (resolve) {
      var modal = $('confirm-modal');
      if (!modal) {
        resolve(false);
        return;
      }
      /* 前一个确认框若还没关，先按取消结算，避免 Promise 悬挂 */
      if (pendingConfirm) settleConfirm(false);

      setText($('confirm-title'), opts.title || '确定要执行吗？');
      setText($('confirm-text'), opts.text || '此操作无法撤销。');

      var cancelBtn = $('confirm-cancel');
      var okBtn = $('confirm-ok');
      if (cancelBtn) setText(cancelBtn, opts.cancelText || '取消');
      if (okBtn) {
        setText(okBtn, opts.okText || '确定');
        var danger = !!opts.danger;
        okBtn.classList.toggle('btn-danger', danger);
        okBtn.classList.toggle('btn-primary', !danger);
      }

      modal.classList.remove('hidden');
      pendingConfirm = { resolve: resolve };
      syncBodyModalClass();
      restartAnimation(modal.querySelector('.modal-panel'));
      try {
        if (opts.danger && cancelBtn && typeof cancelBtn.focus === 'function') cancelBtn.focus();
        else if (okBtn && typeof okBtn.focus === 'function') okBtn.focus();
      } catch (err) { /* noop */ }
    });
  }

  function bindConfirmControls() {
    on($('confirm-ok'), 'click', function (event) {
      if (event) event.stopPropagation();
      settleConfirm(true);
    });
    on($('confirm-cancel'), 'click', function (event) {
      if (event) event.stopPropagation();
      settleConfirm(false);
    });
    qsa('[data-confirm-cancel]').forEach(function (el) {
      on(el, 'click', function () { settleConfirm(false); });
    });
  }

  /* ==========================================================================
   * 16. 键盘快捷键
   * ====================================================================== */

  function isEscapeKey(key) {
    return key === 'Escape' || key === 'Esc';
  }

  function onKeyDown(event) {
    if (!event || typeof event.key !== 'string') return;
    var key = event.key;

    /* 确认框打开：只处理 Esc（关闭确认框） */
    if (isConfirmOpen()) {
      if (isEscapeKey(key)) {
        consumeEvent(event);
        settleConfirm(false);
      }
      return;
    }

    /* 设置弹窗打开：只处理 Esc（关闭设置） */
    if (settingsOpen) {
      if (isEscapeKey(key)) {
        consumeEvent(event);
        closeSettings();
      }
      return;
    }

    if (isEditableTarget(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.repeat) return;

    var screen = activeScreen();

    if (screen === 'menu') {
      if (key === 'Enter') {
        consumeEvent(event);
        callHandler('quickStart');
        return;
      }
      if (key.length === 1 && key >= '1' && key <= '6') {
        var modes = allModes();
        var idx = parseInt(key, 10) - 1;
        var mode = modes[idx];
        if (mode && mode.id) {
          consumeEvent(event);
          callHandler('startMode', mode.id);
        }
        return;
      }
      if (key === 's' || key === 'S') {
        consumeEvent(event);
        openSettings('controls');
        return;
      }
      if (key === 'm' || key === 'M') {
        consumeEvent(event);
        toggleSound();
        return;
      }
      if (key === 'f' || key === 'F') {
        consumeEvent(event);
        toggleFullscreen();
        return;
      }
      return;
    }

    if (screen === 'results') {
      if (key === 'r' || key === 'R' || key === 'Enter') {
        consumeEvent(event);
        callHandler('retry');
        return;
      }
      if (isEscapeKey(key)) {
        consumeEvent(event);
        callHandler('exitToMenu');
        if (activeScreen() === 'results') showMenu();
      }
      return;
    }

    /* 游戏内 Esc / 其他按键交给 Game，UI 不抢 */
  }

  /* ==========================================================================
   * 17. 菜单 / 静态交互绑定
   * ====================================================================== */

  function startModeFromElement(target) {
    var el = target;
    while (el && el.nodeType !== 1) el = el.parentNode;
    if (!el || typeof el.closest !== 'function') return false;
    var card = el.closest('.mode-card, .recent-item');
    if (!card) return false;
    var modeId = card.getAttribute('data-mode');
    if (!modeId) return false;
    callHandler('startMode', modeId);
    return true;
  }

  function scrollToModes() {
    var section = $('modes');
    if (!section || typeof section.scrollIntoView !== 'function') return;
    var reduce = false;
    try {
      reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) {
      reduce = false;
    }
    try {
      section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    } catch (err) {
      section.scrollIntoView();
    }
  }

  function bindStaticControls() {
    on($('quick-start'), 'click', function (event) {
      if (event) event.preventDefault();
      callHandler('quickStart');
    });
    on($('scroll-modes'), 'click', scrollToModes);
    on($('menu-sound-btn'), 'click', function (event) {
      if (event) event.preventDefault();
      toggleSound();
    });
    on($('menu-fullscreen-btn'), 'click', function (event) {
      if (event) event.preventDefault();
      toggleFullscreen();
    });

    qsa('[data-open-settings]').forEach(function (btn) {
      on(btn, 'click', function (event) {
        if (event) event.preventDefault();
        openSettings(btn.getAttribute('data-settings-tab') || 'controls');
      });
    });

    qsa('[data-brand-home]').forEach(function (link) {
      on(link, 'click', function (event) {
        if (event) event.preventDefault();
      });
    });

    /* 动态生成内容用事件委托 */
    var modeGrid = $('mode-grid');
    on(modeGrid, 'click', function (event) {
      if (event) event.preventDefault();
      startModeFromElement(event ? event.target : null);
    });
    var recent = $('recent-runs');
    on(recent, 'click', function (event) {
      startModeFromElement(event ? event.target : null);
    });
  }

  function bindGlobalEvents() {
    on(document, 'keydown', onKeyDown);
    on(document, 'fullscreenchange', syncFullscreenButton);
    on(document, 'webkitfullscreenchange', syncFullscreenButton);
    on(window, 'resize', onWindowResize);
    on(window, 'orientationchange', onWindowResize);
  }

  /* ==========================================================================
   * 18. 初始化
   * ====================================================================== */

  var CACHE_IDS = [
    'screen-menu', 'screen-game', 'screen-results',
    'mode-grid', 'stat-runs', 'stat-best', 'stat-acc', 'quick-start-mode',
    'recent-runs', 'top-runs', 'menu-tip',
    'menu-sound-btn', 'menu-fullscreen-btn',
    'hud-mode-en', 'hud-mode-name', 'hud-hits-label', 'hud-timer-wrap', 'hud-timer',
    'hud-score', 'hud-acc', 'hud-hits', 'hud-streak', 'hud-progress', 'hud-aim-mode',
    'hud-combo', 'hud-combo-mult', 'hud-combo-fill', 'hud-hint', 'hud-pause',
    'countdown', 'countdown-label', 'countdown-value',
    'pause-overlay', 'pause-score', 'pause-time', 'pause-resume', 'pause-restart', 'pause-quit',
    'result-mode-en', 'result-mode-name', 'result-grade', 'result-title', 'result-subtitle',
    'result-score', 'result-score-note', 'result-date', 'new-best', 'result-stats',
    'result-chart', 'result-chart-meta', 'result-rank-note', 'result-rank-bar', 'result-grade-ring',
    'results-retry', 'results-menu', 'results-share',
    'settings-modal', 'crosshair-preview', 'set-sensitivity', 'set-sens-value',
    'set-target-scale', 'set-target-value', 'set-effects', 'set-hdr', 'set-hdr-note',
    'set-ch-color', 'set-ch-size', 'ch-size-value', 'set-ch-thickness', 'ch-thickness-value',
    'set-ch-gap', 'ch-gap-value', 'set-ch-opacity', 'ch-opacity-value',
    'set-ch-outline', 'reset-crosshair',
    'set-audio-enabled', 'set-audio-volume', 'set-volume-value', 'test-sound',
    'data-storage', 'clear-data', 'reset-settings', 'settings-done',
    'confirm-modal', 'confirm-title', 'confirm-text', 'confirm-ok', 'confirm-cancel',
    'toast-root'
  ];

  function warmCache() {
    for (var i = 0; i < CACHE_IDS.length; i++) $(CACHE_IDS[i]);
  }

  function init(injectedHandlers) {
    handlers = (injectedHandlers && typeof injectedHandlers === 'object') ? injectedHandlers : {};

    if (initialized) {
      refreshMenu();
      syncSettingsUI();
      return;
    }
    initialized = true;

    warmCache();
    bindStaticControls();
    bindSettingsControls();
    bindHudControls();
    bindResultsControls();
    bindConfirmControls();
    bindGlobalEvents();

    refreshMenu();
    syncSettingsUI();
    syncFullscreenButton();
    syncSoundButtons();
    updateAllRangeProgress();
  }

  /* ==========================================================================
   * 19. 页面切换
   * ====================================================================== */

  function showMenu() {
    setScreen('menu');
    hidePause();
    setCountdown(null);
    if (document.body) document.body.classList.remove('is-paused');
    syncBodyModalClass();
    refreshMenu();
    syncFullscreenButton();
  }

  /* ==========================================================================
   * 20. 对外 API（SPEC 5.4）
   * ====================================================================== */

  return {
    init: init,
    showMenu: showMenu,
    showGame: showGame,
    updateHud: updateHud,
    setCountdown: setCountdown,
    showPause: showPause,
    hidePause: hidePause,
    showResults: showResults,
    toast: toast,
    confirm: confirm,
    openSettings: openSettings,
    closeSettings: closeSettings,
    refreshMenu: refreshMenu,
    drawResultsChart: drawResultsChart
  };
})();
