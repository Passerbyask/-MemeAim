/* ==========================================================================
   AIMLAB WEB · Game
   游戏引擎：Canvas 渲染 / 六种模式 / 相对与绝对瞄准 / 指针锁定 / 计分结算
   约定：
   - classic script，IIFE 包裹并开启严格模式；对外只暴露 global `Game`
   - 除画布（canvas）外不操作任何 UI DOM，全部通过 hooks 通知
   - 依赖外部模块 Store / AudioFX / Crosshair（均做判空保护，缺失时不崩溃）
   ========================================================================== */
const Game = (() => {
  'use strict';

  /* ==========================================================================
   * 01 · 常量与工具
   * ====================================================================== */

  const COUNTDOWN_SECONDS = 3;   // 3 - 2 - 1 倒计时
  const GO_HOLD = 0.55;          // "GO" 停留时长（秒）
  const MAX_DT = 0.05;           // 单帧 dt 上限，后台恢复不跳帧
  const HIT_TOLERANCE = 8;       // 点击命中容错（px）
  const FLICK_LIFE = 1.7;        // 甩枪靶存活时间（秒）
  const DPR_MAX = 2;             // 高 DPI 上限，兼顾清晰度与性能
  const HUD_INTERVAL = 0.05;     // HUD 约 20Hz
  const LOCK_WATCHDOG = 1200;    // 指针锁定请求看门狗（ms）
  const LOCK_RETRY_DELAY = 1350; // 失锁后重试请求的间隔（ms）
  const MAX_PARTICLES = 220;
  const MAX_FLOATERS = 48;
  const MAX_HITMARKERS = 24;
  const MAX_RIPPLES = 14;
  const MAX_MISS_MARKS = 400;

  const FALLBACK_SETTINGS = {
    aimMode: 'relative',
    sensitivity: 1,
    targetScale: 1,
    effects: true,
    crosshair: {
      style: 'cross',
      color: '#2ce8ff',
      size: 14,
      thickness: 2,
      gap: 4,
      opacity: 0.95,
      outline: true,
    },
  };

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function distance(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function easeOutCubic(t) {
    const x = clamp(t, 0, 1);
    return 1 - Math.pow(1 - x, 3);
  }

  function easeOutBack(t) {
    const x = clamp(t, 0, 1);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function nowMs() {
    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function hexToRgb(hex) {
    let value = String(hex || '').replace('#', '');
    if (value.length === 3) {
      value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }
    const n = parseInt(value, 16);
    if (!isFinite(n) || value.length !== 6) return { r: 44, g: 232, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgba(rgb, alpha) {
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
  }

  /* ==========================================================================
   * 02 · 外部模块访问（全部判空，开发期模块缺失也不崩）
   * ====================================================================== */

  function getStore() {
    return (typeof Store !== 'undefined' && Store) ? Store : null;
  }

  function getAudio() {
    return (typeof AudioFX !== 'undefined' && AudioFX) ? AudioFX : null;
  }

  function getCrosshair() {
    return (typeof Crosshair !== 'undefined' && Crosshair) ? Crosshair : null;
  }

  function getSettings() {
    const store = getStore();
    if (store && store.settings && typeof store.settings === 'object') return store.settings;
    return FALLBACK_SETTINGS;
  }

  function effectsOn() {
    return getSettings().effects !== false;
  }

  function crosshairCfg() {
    const cfg = getSettings().crosshair;
    return (cfg && typeof cfg === 'object') ? cfg : FALLBACK_SETTINGS.crosshair;
  }

  function targetScale() {
    const raw = Number(getSettings().targetScale);
    if (!isFinite(raw)) return 1;
    return clamp(raw, 0.7, 1.4);
  }

  function sensitivity() {
    const raw = Number(getSettings().sensitivity);
    if (!isFinite(raw)) return 1;
    return clamp(raw, 0.2, 3);
  }

  function allModes() {
    const store = getStore();
    return (store && Array.isArray(store.MODES)) ? store.MODES : [];
  }

  function resolveMode(id) {
    const store = getStore();
    if (store && typeof store.mode === 'function') {
      const found = store.mode(id);
      if (found) return found;
    }
    const list = allModes();
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  function sfx(name) {
    const audio = getAudio();
    if (!audio || typeof audio.play !== 'function') return;
    try { audio.play(name); } catch (err) { /* 声音不可用时静默 */ }
  }

  function unlockAudio() {
    const audio = getAudio();
    if (!audio || typeof audio.unlock !== 'function') return;
    try { audio.unlock(); } catch (err) { /* 静默 */ }
  }

  function toast(message, type) {
    emit('onToast', message, type || 'info');
  }

  /* ==========================================================================
   * 03 · 模块状态
   * ====================================================================== */

  // 画布 / 环境
  let canvas = null;
  let ctx = null;
  let hooks = {};
  let events = null;
  let dpr = 1;
  let viewW = 1;
  let viewH = 1;
  let bounds = { left: 0, top: 0, width: 1, height: 1 };
  let rafId = 0;
  let loopRunning = false;
  let lastTs = 0;
  let ambientTime = 0;

  // 会话 / 流程
  let phase = 'idle';            // 'idle' | 'countdown' | 'playing' | 'paused' | 'over'
  let pausedFrom = 'playing';
  let mode = null;
  let modeId = null;
  let duration = 60;
  let elapsed = 0;               // 累计 activeTime（真正在玩的时间）
  let countdownTime = 0;
  let countdownShown = 3;
  let goTimer = 0;
  let finishing = false;

  // 瞄准 / 指针锁定
  let aim = { x: 0, y: 0 };
  let requestedAimMode = 'relative';   // 设置里请求的模式
  let degraded = false;                // 请求相对模式但环境不可用 → 实际绝对
  let pointerLocked = false;
  let lockPending = false;
  let lockAttemptAt = 0;
  let lockAttemptGraceful = false;
  let lockRetryAt = 0;
  let lockRetryCount = 0;
  let recenterOnLock = false;
  let degradeToastShown = false;
  let escGuardUntil = 0;
  let kick = 0;
  let shake = 0;
  // 第一人称持枪视图：开火后坐与枪口焰独立于准星扩散
  let weaponKick = 0;
  let muzzleFlash = 0;
  let weaponSwayT = 0;

  // ── 真·第一人称 3D 相机 ─────────────────────────────────────
  // 目标仍使用原有的逻辑屏幕坐标存储，每帧投影到 3D 相机中；
  // 相对/指针锁定模式下鼠标转动 yaw/pitch，准星固定在屏幕中心。
  const CAM_FOV = 64 * Math.PI / 180;
  const CAM_NEAR = 0.12;
  // 限制略大于目标安全区所需的转角，保证每个刷新点都能被准星够到
  const CAM_YAW_LIMIT = 0.95;
  const CAM_PITCH_LIMIT = 0.52;
  const TARGET_PLANE_Z = 6;
  const CAM_SENS = 0.0021;
  let camYaw = 0;
  let camPitch = 0;
  let camTurnSpeedX = 0;
  let camTurnSpeedY = 0;
  let camEyeY = 0;
  let camViewKick = 0;

  // 计分 / 统计
  let scoreF = 0;
  let hits = 0;
  let shots = 0;
  let misses = 0;
  let combo = 1;                 // 连击从 1 开始
  let bestCombo = 0;             // 最高连击（= 最大 combo - 1）
  let ttkSum = 0;
  let ttkCount = 0;
  let lockTime = 0;              // tracking：连续在靶时长
  let onTargetTime = 0;
  let offTargetTime = 0;
  let offsetSum = 0;
  let offsetCount = 0;
  let trackingOnTarget = false;
  let buckets = [];
  let missesAt = [];
  let hudAcc = 0;

  // 实体
  let targets = [];
  let nextTargetId = 1;
  let particles = [];
  let floaters = [];
  let hitmarkers = [];
  let ripples = [];
  let dust = [];

  // 视觉缓存
  let accentHex = '#2ce8ff';
  let accent = { r: 44, g: 232, b: 255 };
  let bgGrad = null;
  let glowGrad = null;
  let vignetteGrad = null;
  let gradKey = '';
  let crosshairBroken = false;

  /* ==========================================================================
   * 04 · 事件 / 画布尺寸 / 安全区
   * ====================================================================== */

  function emit(name) {
    if (!hooks) return;
    const fn = hooks[name];
    if (typeof fn !== 'function') return;
    const args = Array.prototype.slice.call(arguments, 1);
    try {
      fn.apply(null, args);
    } catch (err) {
      // 不让 UI 异常拖垮游戏循环
    }
  }

  function rafSchedule(cb) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(cb);
    }
    return setTimeout(function () { cb(nowMs()); }, 16);
  }

  function rafCancel(id) {
    if (!id) return;
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(id);
      return;
    }
    clearTimeout(id);
  }

  function measureBounds() {
    let width = 0;
    let height = 0;
    let left = 0;
    let top = 0;
    if (canvas && typeof canvas.getBoundingClientRect === 'function') {
      const rect = canvas.getBoundingClientRect();
      width = rect.width || 0;
      height = rect.height || 0;
      left = rect.left || 0;
      top = rect.top || 0;
    }
    if (!(width > 0) || !(height > 0)) {
      // 画布隐藏（尚未切屏）时退回视口尺寸，保证第一次 resize 有有效值
      width = (typeof window !== 'undefined' ? window.innerWidth : 0) || viewW || 1280;
      height = (typeof window !== 'undefined' ? window.innerHeight : 0) || viewH || 800;
      left = 0;
      top = 0;
    }
    bounds = { left: left, top: top, width: width, height: height };
    return bounds;
  }

  function resize() {
    if (!canvas || !ctx) return;
    const box = measureBounds();
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    let ratio = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    ratio = clamp(ratio, 1, DPR_MAX);

    if (w === viewW && h === viewH && ratio === dpr &&
        canvas.width === Math.round(w * ratio) && canvas.height === Math.round(h * ratio)) {
      return;
    }

    viewW = w;
    viewH = h;
    dpr = ratio;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    try { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (err) { /* 静默 */ }

    aim.x = isFinite(aim.x) ? clamp(aim.x, 2, viewW - 2) : viewW / 2;
    aim.y = isFinite(aim.y) ? clamp(aim.y, 2, viewH - 2) : viewH / 2;
    clampAllTargets();
    buildDust();
    invalidateGradients();
  }

  function getSafe() {
    const small = viewW < 768 || viewH < 620;
    const top = small ? 108 : 130;
    const side = small ? 24 : 56;
    // 底部留出第一人称枪模区域，避免目标刷新在枪身后被完全遮挡
    const bottom = small ? 128 : 186;
    const w = Math.max(160, viewW - side * 2);
    const h = Math.max(160, viewH - top - bottom);
    return {
      x: side,
      y: top,
      w: w,
      h: h,
      cx: side + w / 2,
      cy: top + h / 2,
    };
  }

  function clampTarget(t) {
    const safe = getSafe();
    if (t.kind === 'tracking') {
      t.x = clamp(t.x, safe.x + t.r, safe.x + safe.w - t.r);
      t.y = clamp(t.y, safe.y + t.r, safe.y + safe.h - t.r);
      return;
    }
    t.x = clamp(t.x, safe.x + t.r + 2, safe.x + safe.w - t.r - 2);
    t.y = clamp(t.y, safe.y + t.r + 2, safe.y + safe.h - t.r - 2);
  }

  function clampAllTargets() {
    for (let i = 0; i < targets.length; i++) clampTarget(targets[i]);
  }

  function buildDust() {
    const count = clamp(Math.round((viewW * viewH) / 26000), 24, 96);
    dust = [];
    for (let i = 0; i < count; i++) {
      dust.push({
        x: rand(0, viewW),
        y: rand(0, viewH),
        r: rand(0.6, 2),
        a: rand(0.05, 0.26),
        vx: rand(-7, 7),
        vy: rand(-11, -2),
        z: rand(0.4, 1.1),
        ph: rand(0, Math.PI * 2),
      });
    }
  }

  function invalidateGradients() {
    bgGrad = null;
    glowGrad = null;
    vignetteGrad = null;
    gradKey = '';
  }

  function ensureGradients() {
    if (!ctx) return;
    const key = viewW + 'x' + viewH + '|' + accentHex;
    if (gradKey === key && bgGrad && glowGrad && vignetteGrad) return;
    gradKey = key;

    bgGrad = ctx.createLinearGradient(0, 0, viewW * 0.42, viewH);
    bgGrad.addColorStop(0, '#03070f');
    bgGrad.addColorStop(0.36, '#071322');
    bgGrad.addColorStop(0.72, '#050d19');
    bgGrad.addColorStop(1, '#02050b');

    const cx = viewW * 0.5;
    const cy = viewH * 0.42;
    const radius = Math.max(viewW, viewH) * 0.74;
    glowGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius);
    glowGrad.addColorStop(0, rgba(accent, 0.11));
    glowGrad.addColorStop(0.45, rgba(accent, 0.035));
    glowGrad.addColorStop(1, rgba(accent, 0));

    const vRadius = Math.max(viewW, viewH) * 0.8;
    vignetteGrad = ctx.createRadialGradient(
      viewW * 0.5, viewH * 0.5, Math.min(viewW, viewH) * 0.26,
      viewW * 0.5, viewH * 0.5, vRadius
    );
    vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(0.68, 'rgba(18,38,52,0.045)');
    vignetteGrad.addColorStop(1, 'rgba(18,38,52,0.19)');
  }

  /* ==========================================================================
   * 05 · 输入层：指针锁定 / 相对与绝对瞄准 / 点击
   * ====================================================================== */

  function isCoarsePointer() {
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
      }
    } catch (err) { /* 静默 */ }
    return false;
  }

  function lockSupported() {
    if (!canvas || typeof canvas.requestPointerLock !== 'function') return false;
    if (isCoarsePointer()) return false;
    return true;
  }

  function effectiveAimMode() {
    if (requestedAimMode === 'absolute') return 'absolute';
    return degraded ? 'absolute' : 'relative';
  }

  function isLivePhase() {
    return phase === 'playing' || phase === 'countdown';
  }

  function usingAbsoluteInput() {
    // 请求相对模式但尚未拿到锁（起步 / 失锁重试窗口）时用绝对坐标兜底，保证可玩
    if (requestedAimMode === 'absolute') return true;
    return !pointerLocked;
  }

  function isInteractiveTarget(el) {
    if (!el || typeof el.closest !== 'function') return false;
    try {
      if (el.closest('button, a, input, textarea, select, label, [role="dialog"], .modal, .overlay, #toast-root')) {
        return true;
      }
    } catch (err) { /* 静默 */ }
    return false;
  }

  function updateAimFromPointer(event) {
    if (!event) return;
    const box = bounds;
    if (!box || !(box.width > 0)) return;
    aim.x = clamp(event.clientX - box.left, 2, viewW - 2);
    aim.y = clamp(event.clientY - box.top, 2, viewH - 2);
  }

  function applyRelativeMovement(dx, dy) {
    const sens = sensitivity();
    const mx = clamp(dx, -600, 600);
    const my = clamp(dy, -600, 600);
    if (!mx && !my) return;
    if (pointerLocked) {
      // FPS 手感：鼠标转动相机，准星固定在画面中心。
      camYaw = clamp(camYaw + mx * sens * CAM_SENS, -CAM_YAW_LIMIT, CAM_YAW_LIMIT);
      camPitch = clamp(camPitch - my * sens * CAM_SENS, -CAM_PITCH_LIMIT, CAM_PITCH_LIMIT);
      camTurnSpeedX = mx * sens * CAM_SENS;
      camTurnSpeedY = -my * sens * CAM_SENS;
      aim.x = viewW / 2;
      aim.y = viewH / 2;
      return;
    }
    // 相对模式尚未拿到指针锁定（重试窗口）时仍允许绝对坐标兜底
    aim.x = clamp(aim.x + mx * sens, 2, viewW - 2);
    aim.y = clamp(aim.y + my * sens, 2, viewH - 2);
  }

  function markLocked() {
    pointerLocked = true;
    lockPending = false;
    lockRetryAt = 0;
    if (requestedAimMode !== 'relative' || degraded) {
      // 不需要锁定却拿到了锁，立刻释放，保持模式一致
      pointerLocked = false;
      releasePointerLock();
      return;
    }
    recenterOnLock = false;
    aim.x = viewW / 2;
    aim.y = viewH / 2;
  }

  function releasePointerLock() {
    lockPending = false;
    lockRetryAt = 0;
    const locked = typeof document !== 'undefined' && document && document.pointerLockElement === canvas;
    pointerLocked = false;
    if (locked && typeof document.exitPointerLock === 'function') {
      try { document.exitPointerLock(); } catch (err) { /* 静默 */ }
    }
  }

  function degradeToAbsolute() {
    if (degraded) return;
    degraded = true;
    lockPending = false;
    lockRetryAt = 0;
    pointerLocked = false;
    if (document && document.pointerLockElement === canvas) {
      try { document.exitPointerLock(); } catch (err) { /* 静默 */ }
    }
    if (!degradeToastShown) {
      degradeToastShown = true;
      toast('当前环境无法锁定鼠标，已切换为绝对瞄准', 'info');
    }
    flushHud();
  }

  function handleLockFailure(graceful) {
    lockPending = false;
    if (pointerLocked || degraded) return;
    if (!isLivePhase()) return;
    if (requestedAimMode !== 'relative') return;
    if (graceful && lockRetryCount < 1) {
      lockRetryCount += 1;
      lockRetryAt = nowMs() + LOCK_RETRY_DELAY;
      return;
    }
    degradeToAbsolute();
  }

  function requestPointerLock(graceful) {
    if (requestedAimMode !== 'relative' || degraded) return;
    if (!canvas || typeof canvas.requestPointerLock !== 'function' || isCoarsePointer()) {
      degradeToAbsolute();
      return;
    }
    if (pointerLocked) return;

    lockPending = true;
    lockAttemptAt = nowMs();
    lockAttemptGraceful = !!graceful;

    let result;
    try {
      result = canvas.requestPointerLock();
    } catch (err) {
      lockPending = false;
      handleLockFailure(lockAttemptGraceful);
      return;
    }

    if (result && typeof result.then === 'function') {
      result.then(function () {
        lockPending = false;
        markLocked();
      }).catch(function () {
        lockPending = false;
        handleLockFailure(lockAttemptGraceful);
      });
    }
  }

  function tickLockRecovery() {
    if (requestedAimMode !== 'relative' || degraded || pointerLocked) return;
    const now = nowMs();
    if (lockPending) {
      if (now - lockAttemptAt > LOCK_WATCHDOG) {
        lockPending = false;
        handleLockFailure(lockAttemptGraceful);
      }
      return;
    }
    if (lockRetryAt && now >= lockRetryAt) {
      lockRetryAt = 0;
      requestPointerLock(true);
    }
  }

  function onPointerLockChange() {
    if (!canvas || typeof document === 'undefined') return;
    const locked = document.pointerLockElement === canvas;
    if (locked) {
      markLocked();
      return;
    }
    const wasLocked = pointerLocked;
    pointerLocked = false;
    lockPending = false;
    if (!wasLocked) return;
    // 用户 ESC / 系统失锁：自动暂停；结束、退出、暂停中的失锁一律忽略
    if (phase === 'playing' || phase === 'countdown') pause();
  }

  function onPointerLockError() {
    lockPending = false;
    handleLockFailure(lockAttemptGraceful);
  }

  function onPointerMove(event) {
    if (!isLivePhase()) return;
    if (!usingAbsoluteInput()) return;
    updateAimFromPointer(event);
  }

  function onMouseMove(event) {
    if (!isLivePhase()) return;
    if (requestedAimMode !== 'relative' || degraded || !pointerLocked) return;
    applyRelativeMovement(event.movementX || 0, event.movementY || 0);
  }

  function onPointerDown(event) {
    if (!isLivePhase()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (isInteractiveTarget(event.target)) return;
    if (usingAbsoluteInput()) updateAimFromPointer(event);
    // 相对模式下滑块失锁时，用户点击画布顺手重新请求锁定（手势内）
    if (requestedAimMode === 'relative' && !degraded && !pointerLocked && !lockPending) {
      lockRetryCount = 0;
      requestPointerLock(true);
    }
    if (phase === 'playing' && mode && mode.id !== 'tracking') shoot();
  }

  function onKeyDown(event) {
    if (!event) return;
    const key = event.key;
    const isEscape = key === 'Escape' || key === 'Esc' || event.keyCode === 27;
    if (!isEscape) return;
    if (phase === 'playing' || phase === 'countdown') {
      pause();
    } else if (phase === 'paused') {
      // 防止“导致指针锁丢失的 Esc”在同一按键延迟到达后立刻把游戏恢复
      if (nowMs() < escGuardUntil) return;
      resume();
    }
  }

  function onContextMenu(event) {
    if (phase === 'playing' || phase === 'countdown' || phase === 'paused') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
    }
  }

  function onWindowBlur() {
    if (phase === 'playing' || phase === 'countdown') pause();
  }

  function onVisibilityChange() {
    if (typeof document === 'undefined' || !document) return;
    if (document.hidden && (phase === 'playing' || phase === 'countdown')) pause();
  }

  function onResize() {
    resize();
  }

  function bindEvents() {
    if (events) return;
    events = {
      resize: onResize,
      pointermove: onPointerMove,
      mousemove: onMouseMove,
      pointerdown: onPointerDown,
      keydown: onKeyDown,
      contextmenu: onContextMenu,
      lockchange: onPointerLockChange,
      lockerror: onPointerLockError,
      blur: onWindowBlur,
      visibility: onVisibilityChange,
    };
    window.addEventListener('resize', events.resize, false);
    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', events.resize, false);
    }
    document.addEventListener('pointermove', events.pointermove, { passive: true });
    document.addEventListener('mousemove', events.mousemove, { passive: true });
    document.addEventListener('pointerdown', events.pointerdown, false);
    document.addEventListener('keydown', events.keydown, false);
    document.addEventListener('contextmenu', events.contextmenu, false);
    document.addEventListener('pointerlockchange', events.lockchange, false);
    document.addEventListener('pointerlockerror', events.lockerror, false);
    window.addEventListener('blur', events.blur, false);
    document.addEventListener('visibilitychange', events.visibility, false);
  }

  function unbindEvents() {
    if (!events) return;
    window.removeEventListener('resize', events.resize, false);
    if (window.visualViewport && typeof window.visualViewport.removeEventListener === 'function') {
      window.visualViewport.removeEventListener('resize', events.resize, false);
    }
    document.removeEventListener('pointermove', events.pointermove, false);
    document.removeEventListener('mousemove', events.mousemove, false);
    document.removeEventListener('pointerdown', events.pointerdown, false);
    document.removeEventListener('keydown', events.keydown, false);
    document.removeEventListener('contextmenu', events.contextmenu, false);
    document.removeEventListener('pointerlockchange', events.lockchange, false);
    document.removeEventListener('pointerlockerror', events.lockerror, false);
    window.removeEventListener('blur', events.blur, false);
    document.removeEventListener('visibilitychange', events.visibility, false);
    events = null;
  }

  /* ==========================================================================
   * 06 · 生命周期：init / start / pause / resume / restart / quit / finish
   * ====================================================================== */

  function init(canvasEl, hooksObj) {
    if (!canvasEl || typeof canvasEl.getContext !== 'function') return false;
    unbindEvents();
    stopLoop();
    canvas = canvasEl;
    hooks = (hooksObj && typeof hooksObj === 'object') ? hooksObj : {};

    try {
      ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) ctx = canvas.getContext('2d');
    } catch (err) {
      ctx = null;
    }
    if (!ctx) return false;

    resize();
    aim.x = viewW / 2;
    aim.y = viewH / 2;
    bindEvents();
    return true;
  }

  function resetRunState() {
    elapsed = 0;
    countdownTime = COUNTDOWN_SECONDS;
    countdownShown = COUNTDOWN_SECONDS;
    goTimer = 0;
    finishing = false;
    scoreF = 0;
    hits = 0;
    shots = 0;
    misses = 0;
    combo = 1;
    bestCombo = 0;
    ttkSum = 0;
    ttkCount = 0;
    lockTime = 0;
    onTargetTime = 0;
    offTargetTime = 0;
    offsetSum = 0;
    offsetCount = 0;
    trackingOnTarget = false;
    buckets = new Array(Math.max(1, Math.ceil(duration)));
    for (let i = 0; i < buckets.length; i++) buckets[i] = 0;
    missesAt = [];
    hudAcc = 0;
    kick = 0;
    shake = 0;
    weaponKick = 0;
    muzzleFlash = 0;
    weaponSwayT = 0;
    camYaw = 0;
    camPitch = 0;
    camTurnSpeedX = 0;
    camTurnSpeedY = 0;
    camEyeY = 0;
    camViewKick = 0;
    targets = [];
    nextTargetId = 1;
    particles = [];
    floaters = [];
    hitmarkers = [];
    ripples = [];
    lockPending = false;
    lockRetryAt = 0;
    lockRetryCount = 0;
    recenterOnLock = false;
  }

  function silentTeardown() {
    stopLoop();
    releasePointerLock();
    if (phase === 'paused') {
      emit('onPauseChange', false, { score: Math.round(scoreF), timeLeft: round1(timeLeftValue()) });
    }
    emit('onCountdown', null, null);
    phase = 'idle';
    targets = [];
    particles = [];
    floaters = [];
    hitmarkers = [];
    ripples = [];
    kick = 0;
    shake = 0;
  }

  function start(id) {
    const cfg = resolveMode(id);
    if (!cfg) return false;

    if (phase !== 'idle') silentTeardown();

    requestedAimMode = getSettings().aimMode === 'absolute' ? 'absolute' : 'relative';
    degraded = false;
    mode = cfg;
    modeId = cfg.id;
    duration = clamp(Number(cfg.duration) || 60, 10, 300);
    accentHex = typeof cfg.accent === 'string' ? cfg.accent : '#2ce8ff';
    accent = hexToRgb(accentHex);
    invalidateGradients();
    resetRunState();

    phase = 'countdown';
    emit('onGameStart', cfg);
    resize();

    // 准星初始位置：绝对模式从画面中心开始，等鼠标移动接管
    aim.x = viewW / 2;
    aim.y = viewH / 2;
    recenterOnLock = requestedAimMode === 'relative';

    flushHud();
    emit('onCountdown', COUNTDOWN_SECONDS, 'GET READY');
    unlockAudio();
    sfx('countdown');

    startLoop();

    if (requestedAimMode === 'relative') {
      if (!lockSupported()) {
        degradeToAbsolute();
      } else {
        requestPointerLock(false);
      }
    }
    return true;
  }

  function pause() {
    if (phase !== 'playing' && phase !== 'countdown') return false;
    pausedFrom = phase;
    phase = 'paused';
    escGuardUntil = nowMs() + 280;
    lockPending = false;
    lockRetryAt = 0;
    releasePointerLock();
    kick = 0;
    shake = 0;
    emit('onPauseChange', true, {
      score: Math.round(scoreF),
      timeLeft: round1(timeLeftValue()),
    });
    sfx('click');
    return true;
  }

  function resume() {
    if (phase !== 'paused') return false;
    phase = pausedFrom === 'countdown' ? 'countdown' : 'playing';
    lastTs = 0;
    if (phase === 'countdown') {
      emit('onCountdown', Math.max(1, Math.ceil(countdownTime)), 'GET READY');
    }
    emit('onPauseChange', false, {
      score: Math.round(scoreF),
      timeLeft: round1(timeLeftValue()),
    });
    if (requestedAimMode === 'relative' && !degraded && !pointerLocked) {
      lockRetryCount = 0;
      requestPointerLock(true);
    }
    sfx('click');
    return true;
  }

  function restart() {
    if (!modeId) return false;
    return start(modeId);
  }

  function quit() {
    if (phase === 'idle') return false;
    const wasPaused = phase === 'paused';
    stopLoop();
    releasePointerLock();
    emit('onCountdown', null, null);
    if (wasPaused) {
      emit('onPauseChange', false, { score: Math.round(scoreF), timeLeft: round1(timeLeftValue()) });
    }
    phase = 'idle';
    mode = null;
    modeId = null;
    targets = [];
    particles = [];
    floaters = [];
    hitmarkers = [];
    ripples = [];
    kick = 0;
    shake = 0;
    return true;
  }

  function togglePause() {
    if (phase === 'playing' || phase === 'countdown') return pause();
    if (phase === 'paused') return resume();
    return false;
  }

  function isActive() {
    return phase !== 'idle';
  }

  function getPhase() {
    return phase;
  }

  function getMode() {
    return mode || null;
  }

  /* ==========================================================================
   * 07 · 目标：生成 / 移动 / 续靶
   * ====================================================================== */

  function targetCountFor(id) {
    switch (id) {
      case 'gridshot': return 3;
      case 'spidershot': return 4;
      case 'motion': return 3;
      case 'flick': return 1;
      case 'tracking': return 1;
      case 'precision': return 2;
      default: return 3;
    }
  }

  function makeTarget(overrides) {
    const t = {
      id: nextTargetId++,
      kind: modeId,
      x: 0,
      y: 0,
      r: 20,
      vx: 0,
      vy: 0,
      age: 0,
      spawnAt: elapsed,
      lifeLeft: 0,
      maxLife: 0,
      cell: -1,
      trackT: 0,
      trackPhase: [0, 0, 0, 0],
      trail: [],
      trailT: 0,
    };
    if (overrides) {
      for (const key in overrides) {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) t[key] = overrides[key];
      }
    }
    return t;
  }

  function findOpenSpot(safe, radius, gap) {
    if (!targets.length) {
      return {
        x: rand(safe.x + radius + 6, safe.x + safe.w - radius - 6),
        y: rand(safe.y + radius + 6, safe.y + safe.h - radius - 6),
      };
    }
    let best = null;
    let bestGap = -Infinity;
    for (let attempt = 0; attempt < 48; attempt++) {
      const point = {
        x: rand(safe.x + radius + 6, safe.x + safe.w - radius - 6),
        y: rand(safe.y + radius + 6, safe.y + safe.h - radius - 6),
      };
      let minGap = Infinity;
      for (let i = 0; i < targets.length; i++) {
        const other = targets[i];
        const d = distance(point.x, point.y, other.x, other.y) - other.r - radius;
        if (d < minGap) minGap = d;
      }
      if (minGap > (gap || 0)) return point;
      if (minGap > bestGap) {
        bestGap = minGap;
        best = point;
      }
    }
    return best || { x: safe.cx, y: safe.cy };
  }

  function findFlickSpot(safe, radius) {
    const preferred = Math.min(safe.w, safe.h) * 0.36;
    let best = null;
    let bestDistance = -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const point = {
        x: rand(safe.x + radius + 6, safe.x + safe.w - radius - 6),
        y: rand(safe.y + radius + 6, safe.y + safe.h - radius - 6),
      };
      const d = distance(point.x, point.y, aim.x, aim.y);
      if (d > bestDistance) {
        bestDistance = d;
        best = point;
      }
      if (d > preferred + 80) break;
    }
    return best || { x: safe.cx, y: safe.cy };
  }

  function spawnTarget() {
    if (!mode || !modeId) return null;
    const safe = getSafe();
    const scale = targetScale();
    const id = modeId;
    const t = makeTarget();

    if (id === 'gridshot') {
      const cellW = safe.w / 3;
      const cellH = safe.h / 3;
      t.r = clamp(Math.min(cellW, cellH) * 0.17, 14, 46) * scale;

      const free = [];
      for (let cell = 0; cell < 9; cell++) {
        let used = false;
        for (let i = 0; i < targets.length; i++) {
          if (targets[i].cell === cell) { used = true; break; }
        }
        if (!used) free.push(cell);
      }
      const cell = free.length ? free[randInt(0, free.length - 1)] : randInt(0, 8);
      t.cell = cell;
      const col = cell % 3;
      const row = Math.floor(cell / 3);
      const jitterX = Math.min(cellW * 0.13, Math.max(0, cellW / 2 - t.r - 8));
      const jitterY = Math.min(cellH * 0.13, Math.max(0, cellH / 2 - t.r - 8));
      t.x = safe.x + (col + 0.5) * cellW + rand(-jitterX, jitterX);
      t.y = safe.y + (row + 0.5) * cellH + rand(-jitterY, jitterY);
    } else if (id === 'spidershot') {
      t.r = clamp(Math.min(safe.w, safe.h) * 0.048, 14, 32) * scale;
      const shortSide = Math.min(safe.w, safe.h);
      let chosen = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        const ring = rand(0.16, 0.48) * shortSide;
        const angle = rand(0, Math.PI * 2);
        const candidate = {
          x: safe.cx + Math.cos(angle) * ring,
          y: safe.cy + Math.sin(angle) * ring * 0.92,
        };
        candidate.x = clamp(candidate.x, safe.x + t.r + 4, safe.x + safe.w - t.r - 4);
        candidate.y = clamp(candidate.y, safe.y + t.r + 4, safe.y + safe.h - t.r - 4);
        let overlap = false;
        for (let i = 0; i < targets.length; i++) {
          if (distance(candidate.x, candidate.y, targets[i].x, targets[i].y) < t.r + targets[i].r + 8) {
            overlap = true;
            break;
          }
        }
        if (!overlap) { chosen = candidate; break; }
        if (!chosen) chosen = candidate;
      }
      t.x = chosen ? chosen.x : safe.cx;
      t.y = chosen ? chosen.y : safe.cy;
    } else if (id === 'motion') {
      t.r = clamp(Math.min(safe.w, safe.h) * 0.05, 15, 34) * scale;
      const spot = findOpenSpot(safe, t.r, 10);
      t.x = spot.x;
      t.y = spot.y;
      const dirX = Math.random() < 0.5 ? -1 : 1;
      t.vx = dirX * rand(80, 170);
      t.vy = rand(-0.45, 0.45) * Math.abs(t.vx);
    } else if (id === 'flick') {
      t.r = clamp(Math.min(safe.w, safe.h) * 0.048, 15, 30) * scale;
      const spot = findFlickSpot(safe, t.r);
      t.x = spot.x;
      t.y = spot.y;
      t.maxLife = FLICK_LIFE;
      t.lifeLeft = FLICK_LIFE;
    } else if (id === 'tracking') {
      t.r = clamp(Math.min(safe.w, safe.h) * 0.1, 34, 82) * scale;
      t.trackT = 0;
      t.trackPhase = [rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2)];
      t.trail = [];
      // 直接出生在双正弦轨迹起点，避免开局第一帧“瞬移”
      const startPos = trackingOffset(t, safe, 0);
      t.x = startPos.x;
      t.y = startPos.y;
    } else if (id === 'precision') {
      t.r = rand(11, 14) * scale;
      const spot = findOpenSpot(safe, t.r, 12);
      t.x = spot.x;
      t.y = spot.y;
    } else {
      t.r = 24 * scale;
      const spot = findOpenSpot(safe, t.r, 8);
      t.x = spot.x;
      t.y = spot.y;
    }

    clampTarget(t);
    return t;
  }

  function ensureTargets() {
    if (!mode) return;
    if (phase !== 'playing' && phase !== 'countdown') return;
    const want = targetCountFor(modeId);
    let guard = 0;
    while (targets.length < want && guard < 16) {
      guard++;
      const t = spawnTarget();
      if (!t) break;
      targets.push(t);
    }
  }

  function updateMotionTarget(t, dt) {
    const safe = getSafe();
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    const minX = safe.x + t.r;
    const maxX = safe.x + safe.w - t.r;
    const minY = safe.y + t.r;
    const maxY = safe.y + safe.h - t.r;
    if (t.x < minX) { t.x = minX; t.vx = Math.abs(t.vx); }
    else if (t.x > maxX) { t.x = maxX; t.vx = -Math.abs(t.vx); }
    if (t.y < minY) { t.y = minY; t.vy = Math.abs(t.vy); }
    else if (t.y > maxY) { t.y = maxY; t.vy = -Math.abs(t.vy); }
  }

  function trackingOffset(t, safe, time) {
    const availX = Math.max(12, safe.w / 2 - t.r - 8);
    const availY = Math.max(12, safe.h / 2 - t.r - 8);
    const phaseList = t.trackPhase;
    return {
      x: safe.cx +
        availX * 0.55 * Math.sin(time * 0.5 + phaseList[0]) +
        availX * 0.18 * Math.sin(time * 1.17 + phaseList[1]),
      y: safe.cy +
        availY * 0.55 * Math.sin(time * 0.62 + phaseList[2]) +
        availY * 0.18 * Math.sin(time * 1.41 + phaseList[3]),
    };
  }

  function updateTrackingTarget(t, dt) {
    const safe = getSafe();
    t.trackT += dt;
    const pos = trackingOffset(t, safe, t.trackT);
    t.x = pos.x;
    t.y = pos.y;
    clampTarget(t);
  }

  function updateTargetTrail(t, dt) {
    for (let i = 0; i < t.trail.length; i++) t.trail[i].age += dt;
    t.trail.push({ x: t.x, y: t.y, age: 0 });
    while (t.trail.length > 9) t.trail.shift();
  }

  /* ==========================================================================
   * 08 · 计分：命中 / 失误 / 跟枪
   * ====================================================================== */

  function multiplier() {
    return Math.min(2, 1 + (combo - 1) * 0.02);
  }

  function bucketIndex() {
    if (!buckets.length) return 0;
    return clamp(Math.floor(elapsed), 0, buckets.length - 1);
  }

  function addScore(gain) {
    if (!(gain > 0) || !isFinite(gain)) return;
    scoreF += gain;
    const idx = bucketIndex();
    if (buckets[idx] !== undefined) buckets[idx] += gain;
  }

  function pushCapped(list, item, max) {
    list.push(item);
    if (list.length > max) list.splice(0, list.length - max);
  }

  function spawnHitFx(target, gain, center) {
    const effects = effectsOn();
    if (effects) {
      const count = 10 + Math.round(center * 8);
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(60, 260);
        pushCapped(particles, {
          x: aim.x,
          y: aim.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          g: rand(60, 190),
          age: 0,
          life: rand(0.26, 0.58),
          size: rand(1.4, 3.4),
          color: accentHex,
        }, MAX_PARTICLES);
      }
      pushCapped(ripples, {
        x: Number.isFinite(target.sx) ? target.sx : target.x,
        y: Number.isFinite(target.sy) ? target.sy : target.y,
        r: (Number.isFinite(target.sr) ? target.sr : target.r) * 0.45,
        maxR: (Number.isFinite(target.sr) ? target.sr : target.r) * 1.9,
        age: 0,
        life: 0.36,
        color: accentHex,
      }, MAX_RIPPLES);
      shake = Math.min(1, shake + 0.3 + center * 0.3);
    }
    pushCapped(floaters, {
      x: aim.x + rand(-6, 6),
      y: aim.y - 16,
      vy: -46,
      text: '+' + gain,
      color: accentHex,
      size: 15 + Math.round(center * 4),
      mono: true,
      age: 0,
      life: 0.7,
    }, MAX_FLOATERS);
    pushCapped(hitmarkers, {
      x: aim.x,
      y: aim.y,
      age: 0,
      life: 0.24,
      type: 'hit',
      color: '#ffffff',
    }, MAX_HITMARKERS);
    kick = 1;
  }

  function spawnMissFx(x, y, timeout) {
    pushCapped(floaters, {
      x: x + rand(-4, 4),
      y: y - 14,
      vy: -34,
      text: timeout ? '超时' : '失误',
      color: '#ff5470',
      size: 13,
      mono: false,
      age: 0,
      life: 0.62,
    }, MAX_FLOATERS);
    pushCapped(hitmarkers, {
      x: x,
      y: y,
      age: 0,
      life: 0.2,
      type: 'miss',
      color: '#ff5470',
    }, MAX_HITMARKERS);
    if (effectsOn()) {
      for (let i = 0; i < 5; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(30, 110);
        pushCapped(particles, {
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          g: rand(40, 120),
          age: 0,
          life: rand(0.18, 0.36),
          size: rand(1, 2.2),
          color: '#ff5470',
        }, MAX_PARTICLES);
      }
    }
    kick = 1;
  }

  function markMissAt() {
    if (!buckets.length) return;
    const sec = clamp(Math.floor(elapsed), 0, buckets.length - 1);
    missesAt.push(sec);
    if (missesAt.length > MAX_MISS_MARKS) missesAt.shift();
  }

  function registerHit(target, dist) {
    hits += 1;
    const center = clamp(1 - dist / Math.max(1, target.r + HIT_TOLERANCE), 0, 1);
    const currentMultiplier = multiplier();
    let bonus = 1;

    if (mode.id === 'spidershot') {
      const safe = getSafe();
      const fromCenter = distance(target.x, target.y, safe.cx, safe.cy);
      const maxRing = Math.max(1, 0.48 * Math.min(safe.w, safe.h));
      bonus = 1 + clamp(fromCenter / maxRing, 0, 1) * 0.9;
    } else if (mode.id === 'flick') {
      const reaction = clamp(elapsed - target.spawnAt, 0, FLICK_LIFE);
      const speedNorm = 1 - reaction / FLICK_LIFE;
      bonus = 1 + clamp(speedNorm, 0, 1) * 0.9;
    }

    const gain = Math.max(1, Math.round(mode.base * (1 + center * 0.5) * bonus * currentMultiplier));
    addScore(gain);

    combo += 1;
    if (combo - 1 > bestCombo) bestCombo = combo - 1;
    const ttk = Math.max(0, elapsed - target.spawnAt);
    ttkSum += ttk;
    ttkCount += 1;

    spawnHitFx(target, gain, center);
    sfx('hit');
    if ((combo - 1) % 5 === 0) sfx('combo');
    return gain;
  }

  function registerMiss(x, y, timeout) {
    misses += 1;
    combo = 1;
    lockTime = 0;
    markMissAt();
    spawnMissFx(x, y, timeout);
    sfx('miss');
  }

  function findHitTarget() {
    let best = null;
    let bestDistance = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (t.visible3d === false) continue;
      const tx = Number.isFinite(t.sx) ? t.sx : t.x;
      const ty = Number.isFinite(t.sy) ? t.sy : t.y;
      const tr = Number.isFinite(t.sr) ? t.sr : t.r;
      const d = distance(aim.x, aim.y, tx, ty);
      if (d <= tr + HIT_TOLERANCE && d < bestDistance) {
        bestDistance = d;
        best = t;
      }
    }
    return best;
  }

  function shoot() {
    if (!mode || phase !== 'playing') return false;
    if (mode.id === 'tracking') return false;
    shots += 1;
    weaponKick = 1;
    muzzleFlash = 1;
    weaponSwayT += 0.7;
    camViewKick = 1;
    refreshTargetScreens();

    const target = findHitTarget();
    if (target) {
      const tx = Number.isFinite(target.sx) ? target.sx : target.x;
      const ty = Number.isFinite(target.sy) ? target.sy : target.y;
      const d = distance(aim.x, aim.y, tx, ty);
      registerHit(target, d);
      const index = targets.indexOf(target);
      if (index >= 0) targets.splice(index, 1);
      ensureTargets();
      return true;
    }

    registerMiss(aim.x, aim.y, false);
    return false;
  }

  function scoreTracking(target, dt) {
    if (!(dt > 0)) return;
    const tx = Number.isFinite(target.sx) ? target.sx : target.x;
    const ty = Number.isFinite(target.sy) ? target.sy : target.y;
    const tr = Number.isFinite(target.sr) ? target.sr : target.r;
    const d = distance(aim.x, aim.y, tx, ty);
    const center = clamp(1 - d / Math.max(1, tr), 0, 1);
    const inside = d <= tr;

    if (inside) {
      onTargetTime += dt;
      offsetSum += d;
      offsetCount += 1;
      lockTime += dt;
      while (lockTime >= 0.5) {
        lockTime -= 0.5;
        combo += 1;
        if (combo - 1 > bestCombo) bestCombo = combo - 1;
        if ((combo - 1) % 5 === 0) sfx('combo');
      }
      addScore(mode.base * dt * (1 + center * 0.4) * multiplier());
      if (!trackingOnTarget) {
        if (effectsOn()) {
          pushCapped(ripples, {
            x: Number.isFinite(target.sx) ? target.sx : target.x,
            y: Number.isFinite(target.sy) ? target.sy : target.y,
            r: (Number.isFinite(target.sr) ? target.sr : target.r) * 0.6,
            maxR: (Number.isFinite(target.sr) ? target.sr : target.r) * 1.5,
            age: 0,
            life: 0.34,
            color: accentHex,
          }, MAX_RIPPLES);
        }
        trackingOnTarget = true;
      }
    } else {
      offTargetTime += dt;
      trackingOnTarget = false;
      if (combo > 1 || lockTime > 0) {
        combo = 1;
        lockTime = 0;
      }
    }
  }

  /* ==========================================================================
   * 09 · 帧更新
   * ====================================================================== */

  function startLoop() {
    if (loopRunning || !ctx) return;
    loopRunning = true;
    lastTs = 0;
    rafId = rafSchedule(onFrame);
  }

  function stopLoop() {
    loopRunning = false;
    if (rafId) {
      rafCancel(rafId);
      rafId = 0;
    }
  }

  function onFrame(timestamp) {
    if (!loopRunning) return;
    rafId = rafSchedule(onFrame);

    let dt = lastTs ? (timestamp - lastTs) / 1000 : 0;
    lastTs = timestamp;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > MAX_DT) dt = MAX_DT;

    if (phase === 'countdown') {
      updateCountdown(dt);
    } else if (phase === 'playing') {
      updatePlaying(dt);
    } else if (phase === 'paused') {
      updatePaused(dt);
    } else {
      stopLoop();
      return;
    }
    render();
  }

  function timeLeftValue() {
    return Math.max(0, duration - elapsed);
  }

  function updateCountdown(dt) {
    ambientTime += dt;
    updateDust(dt);
    decayCameraSway(dt);
    tickLockRecovery();
    kick = Math.max(0, kick - dt * 5.5);
    shake = Math.max(0, shake - dt * 4.5);
    weaponKick = Math.max(0, weaponKick - dt * 6.4);
    muzzleFlash = Math.max(0, muzzleFlash - dt * 16);
    weaponSwayT += dt;

    if (dt > 0) {
      countdownTime -= dt;
      const value = Math.ceil(countdownTime);
      if (value !== countdownShown && value > 0) {
        countdownShown = value;
        emit('onCountdown', value, 'GET READY');
        sfx('countdown');
      }
    }
    if (countdownTime <= 0) enterPlaying();
  }

  function enterPlaying() {
    if (phase !== 'countdown') return;
    phase = 'playing';
    countdownTime = 0;
    goTimer = GO_HOLD;
    elapsed = 0;
    recenterOnLock = false;
    emit('onCountdown', 'GO', 'TARGETS ONLINE');
    sfx('go');
    ensureTargets();
    flushHud();
    lastTs = 0;
  }

  function decayCameraSway(dt) {
    const damp = Math.exp(-dt * 9);
    camTurnSpeedX *= damp;
    camTurnSpeedY *= damp;
    camViewKick = Math.max(0, camViewKick - dt * 7.5);
  }

  function updatePlaying(dt) {
    ambientTime += dt;
    updateDust(dt);
    decayCameraSway(dt);

    if (dt > 0) {
      elapsed += dt;
      if (elapsed > duration) elapsed = duration;
    }

    // 目标推进
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      t.age += dt;

      if (t.kind === 'motion') {
        updateMotionTarget(t, dt);
        updateTargetTrail(t, dt);
        updateTargetScreen(t);
      } else if (t.kind === 'tracking') {
        updateTrackingTarget(t, dt);
        updateTargetTrail(t, dt);
        updateTargetScreen(t);
        scoreTracking(t, dt);
      } else if (t.kind === 'flick') {
        t.lifeLeft -= dt;
        updateTargetScreen(t);
        if (t.lifeLeft <= 0) {
          registerMiss(Number.isFinite(t.sx) ? t.sx : t.x, Number.isFinite(t.sy) ? t.sy : t.y, true);
          targets.splice(i, 1);
          ensureTargets();
        }
      } else {
        updateTargetScreen(t);
      }
    }
    refreshTargetScreens();

    updateEffects(dt);
    tickLockRecovery();

    if (goTimer > 0) {
      goTimer -= dt;
      if (goTimer <= 0) {
        goTimer = 0;
        emit('onCountdown', null, null);
      }
    }

    hudAcc += dt;
    if (hudAcc >= HUD_INTERVAL) flushHud();

    if (elapsed >= duration) finishRun();
  }

  function updatePaused(dt) {
    // 暂停：冻结计时 / 目标 / 粒子，仅保留极缓慢的背景呼吸
    ambientTime += dt * 0.16;
    if (effectsOn()) updateDust(dt * 0.16);
  }

  function updateDust(dt) {
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i];
      d.x += d.vx * dt * d.z;
      d.y += d.vy * dt * d.z;
      if (d.y < -8) {
        d.y = viewH + 8;
        d.x = rand(0, viewW);
      }
      if (d.x < -8) d.x = viewW + 8;
      else if (d.x > viewW + 8) d.x = -8;
    }
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.4 * dt;
      p.vy = p.vy * (1 - 2.4 * dt) + p.g * dt;
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.age += dt;
      if (f.age >= f.life) {
        floaters.splice(i, 1);
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= 1 - 1.6 * dt;
    }
    for (let i = hitmarkers.length - 1; i >= 0; i--) {
      const m = hitmarkers[i];
      m.age += dt;
      if (m.age >= m.life) hitmarkers.splice(i, 1);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.age += dt;
      if (r.age >= r.life) ripples.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 4.5);
    kick = Math.max(0, kick - dt * 5.5);
    weaponKick = Math.max(0, weaponKick - dt * 6.4);
    muzzleFlash = Math.max(0, muzzleFlash - dt * 16);
    weaponSwayT += dt;
    if (!effectsOn()) shake = 0;
  }

  /* ==========================================================================
   * 10 · 结算
   * ====================================================================== */

  function computeAccuracy() {
    if (mode && mode.id === 'tracking') {
      const total = onTargetTime + offTargetTime;
      return total > 0 ? clamp(onTargetTime / total * 100, 0, 100) : 100;
    }
    return shots > 0 ? clamp((hits / shots) * 100, 0, 100) : 100;
  }

  function gradeForScore(scoreValue) {
    const store = getStore();
    if (store && typeof store.gradeFor === 'function' && mode) {
      try {
        const grade = store.gradeFor(scoreValue, mode);
        if (grade) return String(grade);
      } catch (err) { /* 走本地阈值兜底 */ }
    }
    const thresholds = (mode && mode.thresholds) || {};
    if (scoreValue >= (Number(thresholds.S) || Infinity)) return 'S';
    if (scoreValue >= (Number(thresholds.A) || Infinity)) return 'A';
    if (scoreValue >= (Number(thresholds.B) || Infinity)) return 'B';
    if (scoreValue >= (Number(thresholds.C) || Infinity)) return 'C';
    return 'D';
  }

  function previousBestScore() {
    const store = getStore();
    if (store && store.records && store.records.bests && modeId) {
      const best = store.records.bests[modeId];
      if (best && typeof best.score === 'number' && isFinite(best.score)) {
        return Math.max(0, Math.round(best.score));
      }
    }
    return 0;
  }

  function buildSummary() {
    const trackingMode = !!(mode && mode.id === 'tracking');
    const scoreValue = Math.round(scoreF);
    const acc = computeAccuracy();
    const outBuckets = [];
    for (let i = 0; i < buckets.length; i++) {
      outBuckets.push(Math.round(buckets[i] * 10) / 10);
    }
    if (!outBuckets.length) outBuckets.push(0);

    const summary = {
      modeId: modeId,
      mode: mode,
      score: scoreValue,
      accuracy: round1(acc),
      grade: gradeForScore(scoreValue),
      newBest: false,
      previousBest: previousBestScore(),
      hits: trackingMode ? round1(onTargetTime) : hits,
      misses: trackingMode ? round1(offTargetTime) : misses,
      shots: trackingMode ? 0 : shots,
      bestCombo: bestCombo,
      avgTtk: trackingMode ? 0 : (ttkCount > 0 ? Math.round((ttkSum / ttkCount) * 1000) : 0),
      kps: trackingMode
        ? round1(scoreValue / Math.max(0.5, elapsed))
        : round1(hits / Math.max(0.5, elapsed)),
      duration: duration,
      elapsed: round1(elapsed),
      tracking: trackingMode,
      onTargetTime: trackingMode ? round1(onTargetTime) : 0,
      offTargetTime: trackingMode ? round1(offTargetTime) : 0,
      avgOffset: (trackingMode && offsetCount > 0) ? round1(offsetSum / offsetCount) : 0,
      buckets: outBuckets,
      missesAt: missesAt.slice(),
      date: new Date().toISOString(),
    };
    return summary;
  }

  function finishRun() {
    if (finishing) return false;
    if (phase === 'idle' || phase === 'over') return false;
    finishing = true;

    try {
      const wasPaused = phase === 'paused';
      phase = 'over';
      stopLoop();
      releasePointerLock();
      emit('onCountdown', null, null);

      const summary = buildSummary();
      const store = getStore();
      let record = null;
      if (store && typeof store.recordRun === 'function') {
        try { record = store.recordRun(summary); } catch (err) { record = null; }
      }
      if (record && typeof record === 'object') {
        summary.newBest = !!record.isBest;
        summary.isBest = !!record.isBest;
        if (typeof record.previousBest === 'number' && isFinite(record.previousBest)) {
          summary.previousBest = record.previousBest;
        }
        if (record.best !== undefined) summary.best = record.best;
      }

      if (wasPaused) {
        emit('onPauseChange', false, { score: summary.score, timeLeft: 0 });
      }
      if (summary.newBest) sfx('record');
      else sfx('finish');
      emit('onGameEnd', summary);
    } finally {
      finishing = false;
    }
    return true;
  }

  /* ==========================================================================
   * 11 · HUD
   * ====================================================================== */

  function hudPayload() {
    const trackingMode = !!(mode && mode.id === 'tracking');
    return {
      modeId: modeId || '',
      score: Math.round(scoreF),
      accuracy: round1(computeAccuracy()),
      hits: trackingMode ? round1(onTargetTime) : hits,
      shots: trackingMode ? 0 : shots,
      misses: trackingMode ? round1(offTargetTime) : misses,
      streak: Math.max(0, combo - 1),
      multiplier: round2(multiplier()),
      timeLeft: round1(timeLeftValue()),
      duration: duration,
      progress: clamp(elapsed / Math.max(0.001, duration), 0, 1),
      aimMode: effectiveAimMode(),
      tracking: trackingMode,
    };
  }

  function flushHud() {
    hudAcc = 0;
    if (!mode) return;
    emit('onHud', hudPayload());
  }

  /* ==========================================================================
   * 11.5 · 3D 相机 / 平面投影
   * 目标逻辑坐标仍保留在屏幕安全区内，渲染与判定时投影到 3D 相机。
   * ====================================================================== */

  function focalPx() {
    return (viewH / 2) / Math.tan(CAM_FOV / 2);
  }

  function rotateToCamera(x, y, z) {
    const cy = Math.cos(camYaw);
    const sy = Math.sin(camYaw);
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    const cp = Math.cos(camPitch);
    const sp = Math.sin(camPitch);
    const y1 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    return { x: x1, y: y1, z: z2 };
  }

  function projectCameraPoint(p) {
    if (!p || p.z <= CAM_NEAR) return { visible: false, x: 0, y: 0, z: p ? p.z : 0, scale: 0 };
    const f = focalPx();
    return {
      visible: true,
      x: viewW / 2 + f * p.x / p.z,
      y: viewH / 2 - f * p.y / p.z,
      z: p.z,
      scale: f / p.z,
    };
  }

  function projectWorldPoint(x, y, z) {
    return projectCameraPoint(rotateToCamera(x, y, z));
  }

  function logicalToWorld(lx, ly) {
    const f = focalPx();
    return {
      x: (lx - viewW / 2) * TARGET_PLANE_Z / f,
      y: -(ly - viewH / 2) * TARGET_PLANE_Z / f,
      z: TARGET_PLANE_Z,
    };
  }

  function projectLogical(lx, ly) {
    const world = logicalToWorld(lx, ly);
    return projectWorldPoint(world.x, world.y, world.z);
  }

  function updateTargetScreen(t) {
    if (!t) return;
    const world = logicalToWorld(t.x, t.y);
    const p = projectWorldPoint(world.x, world.y, world.z);
    if (!p.visible) {
      t.sx = t.x;
      t.sy = t.y;
      t.sr = t.r;
      t.sw = p.z;
      t.visible3d = false;
      return;
    }
    t.sx = p.x;
    t.sy = p.y;
    t.sr = t.r * TARGET_PLANE_Z / p.z;
    t.sw = p.z;
    t.visible3d = true;
  }

  function refreshTargetScreens() {
    for (let i = 0; i < targets.length; i++) updateTargetScreen(targets[i]);
  }

  // ── 近平面裁剪（世界坐标 → 相机坐标 → 屏幕） ──────────────
  function cameraPolygon(points) {
    const cam = [];
    for (let i = 0; i < points.length; i++) {
      cam.push(rotateToCamera(points[i][0], points[i][1], points[i][2]));
    }
    const clipped = [];
    for (let i = 0; i < cam.length; i++) {
      const a = cam[i];
      const b = cam[(i + 1) % cam.length];
      const aIn = a.z >= CAM_NEAR;
      const bIn = b.z >= CAM_NEAR;
      if (aIn) clipped.push(a);
      if (aIn !== bIn) {
        const t = (CAM_NEAR - a.z) / (b.z - a.z);
        clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: CAM_NEAR });
      }
    }
    if (clipped.length < 3) return null;
    const f = focalPx();
    const screen = [];
    for (let i = 0; i < clipped.length; i++) {
      const p = clipped[i];
      screen.push({ x: viewW / 2 + f * p.x / p.z, y: viewH / 2 - f * p.y / p.z });
    }
    return screen;
  }

  function worldPolygonPath(points) {
    const screen = cameraPolygon(points);
    if (!screen) return false;
    ctx.beginPath();
    ctx.moveTo(screen[0].x, screen[0].y);
    for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i].x, screen[i].y);
    ctx.closePath();
    return true;
  }

  function drawWorldPolygon(points, fill, stroke, lineWidth) {
    if (!worldPolygonPath(points)) return;
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  function drawWorldLine(x1, y1, z1, x2, y2, z2) {
    let a = rotateToCamera(x1, y1, z1);
    let b = rotateToCamera(x2, y2, z2);
    if (a.z < CAM_NEAR && b.z < CAM_NEAR) return false;
    if (a.z < CAM_NEAR) {
      const t = (CAM_NEAR - a.z) / (b.z - a.z);
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: CAM_NEAR };
    } else if (b.z < CAM_NEAR) {
      const t = (CAM_NEAR - b.z) / (a.z - b.z);
      b = { x: b.x + (a.x - b.x) * t, y: b.y + (a.y - b.y) * t, z: CAM_NEAR };
    }
    const f = focalPx();
    ctx.beginPath();
    ctx.moveTo(viewW / 2 + f * a.x / a.z, viewH / 2 - f * a.y / a.z);
    ctx.lineTo(viewW / 2 + f * b.x / b.z, viewH / 2 - f * b.y / b.z);
    ctx.stroke();
    return true;
  }

  /* ==========================================================================
   * 12 · 渲染
   * ====================================================================== */

  function render() {
    if (!ctx || viewW < 2 || viewH < 2) return;
    const effects = effectsOn();
    const shakeMag = effects ? shake : 0;
    const shakeX = shakeMag > 0 ? (Math.random() - 0.5) * 11 * shakeMag : 0;
    const shakeY = shakeMag > 0 ? (Math.random() - 0.5) * 11 * shakeMag : 0;

    // FPS：相对瞄准 + 指针锁定时准星固定在中心，鼠标只转相机
    if (requestedAimMode === 'relative' && pointerLocked) {
      aim.x = viewW / 2;
      aim.y = viewH / 2;
    }
    refreshTargetScreens();

    try { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (err) { /* 静默 */ }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    drawBackground3D(effects);

    ctx.save();
    if (shakeX || shakeY) ctx.translate(shakeX, shakeY);
    drawTargets();
    drawEffects();
    ctx.restore();

    // 3D 持枪视角：与相机同空间的多面体模型，最后压在场景之上
    drawGunForward3D();
    drawVignette();
    drawAimCrosshair();
  }

  function drawBackgroundLegacy(effects) {
    ensureGradients();
    if (bgGrad) {
      ctx.fillStyle = bgGrad;
    } else {
      ctx.fillStyle = '#04070f';
    }
    ctx.fillRect(0, 0, viewW, viewH);

    if (glowGrad) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawGridLegacy(effects);
    drawDust(effects);
  }

  function drawGridLegacy(effects) {
    const w = viewW;
    const h = viewH;
    const vpX = w / 2;
    const vpY = h * 0.46;

    ctx.save();
    ctx.lineWidth = 1;

    // 竖线向消失点收拢
    ctx.strokeStyle = 'rgba(64,150,210,' + (effects ? 0.075 : 0.05) + ')';
    for (let i = 0; i <= 14; i++) {
      const spread = (i / 14 - 0.5) * w * 2.6;
      ctx.beginPath();
      ctx.moveTo(vpX + spread * 0.02, vpY);
      ctx.lineTo(vpX + spread, h + 60);
      ctx.stroke();
    }

    // 横线：透视间距 + 缓慢流动
    const rows = 18;
    const flow = effects ? (ambientTime * 0.22) % 1 : 0;
    for (let i = 0; i < rows; i++) {
      const p = (i + flow) / rows;
      const y = vpY + (h - vpY + 90) * Math.pow(p, 2.15);
      if (y < vpY + 1 || y > h + 20) continue;
      const alpha = (effects ? 0.075 : 0.05) * (0.3 + p * 1.15);
      ctx.strokeStyle = 'rgba(64,150,210,' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 地平线
    const horizonAlpha = effects ? 0.1 : 0.06;
    ctx.strokeStyle = 'rgba(120,210,255,' + horizonAlpha + ')';
    ctx.beginPath();
    ctx.moveTo(0, vpY + 0.5);
    ctx.lineTo(w, vpY + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawDust(effects) {
    if (!dust.length) return;
    ctx.save();
    ctx.fillStyle = 'rgba(54, 98, 120, 0.9)';
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i];
      const twinkle = effects ? (0.55 + 0.45 * Math.sin(ambientTime * 1.6 + d.ph)) : 0.7;
      ctx.globalAlpha = d.a * twinkle;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTargets() {
    if (!targets.length) return;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (t.kind === 'motion' || t.kind === 'tracking') drawTargetTrail(t);
    }
    for (let i = 0; i < targets.length; i++) {
      drawTargetOrb(targets[i]);
    }
  }

  function targetScreen(t) {
    const tx = Number.isFinite(t.sx) ? t.sx : t.x;
    const ty = Number.isFinite(t.sy) ? t.sy : t.y;
    const tr = Number.isFinite(t.sr) ? t.sr : t.r;
    return { x: tx, y: ty, r: tr };
  }

  function drawTargetShadow(t) {
    const appear = clamp(t.age / 0.2, 0, 1);
    if (appear <= 0 || t.visible3d === false) return;
    const sc = targetScreen(t);
    const radius = sc.r * (0.4 + 0.6 * appear);
    ctx.save();
    ctx.globalAlpha = 0.3 * appear;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    if (typeof ctx.ellipse === 'function') {
      ctx.beginPath();
      ctx.ellipse(sc.x + radius * 0.16, sc.y + radius * 1.05, radius * 0.92, radius * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(sc.x + radius * 0.16, sc.y + radius * 1.05);
      ctx.scale(1, 0.26);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawTargetTrail(t) {
    if (!t.trail || !t.trail.length || t.visible3d === false) return;
    const sc = targetScreen(t);
    ctx.save();
    for (let i = 0; i < t.trail.length; i++) {
      const p = t.trail[i];
      const k = i / t.trail.length;
      const fade = clamp(1 - p.age * 4.5, 0, 1);
      if (fade <= 0) continue;
      const pp = projectLogical(p.x, p.y);
      if (!pp.visible) continue;
      ctx.globalAlpha = k * 0.22 * fade;
      ctx.fillStyle = accentHex;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, sc.r * (0.16 + 0.6 * k) * fade, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTargetBody(t) {
    if (t.visible3d === false) return;
    const sc = targetScreen(t);
    const tx = sc.x;
    const ty = sc.y;
    const tr = sc.r;
    const spawnK = clamp(t.age / 0.2, 0, 1);
    const scaleIn = spawnK < 1 ? easeOutBack(spawnK) : 1;
    const radius = tr * (0.25 + 0.75 * scaleIn);
    const alpha = clamp(spawnK * 1.7, 0, 1);
    if (radius <= 0.5 || alpha <= 0) return;

    const pulse = 1 + Math.sin(t.age * 5.2 + t.id * 0.7) * 0.025;
    const r = radius * pulse;
    const hover = isAimOverTarget(t);
    const rgb = accent;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 外发光
    const glow = ctx.createRadialGradient(tx, ty, r * 0.18, tx, ty, r * 1.95);
    glow.addColorStop(0, rgba(rgb, hover ? 0.3 : 0.19));
    glow.addColorStop(0.55, rgba(rgb, 0.075));
    glow.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tx, ty, r * 1.95, 0, Math.PI * 2);
    ctx.fill();

    // 外环
    ctx.strokeStyle = rgba(rgb, hover ? 1 : 0.9);
    ctx.lineWidth = Math.max(1.5, r * 0.07);
    ctx.beginPath();
    ctx.arc(tx, ty, r, 0, Math.PI * 2);
    ctx.stroke();

    // 内环
    ctx.strokeStyle = rgba(rgb, 0.34);
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.beginPath();
    ctx.arc(tx, ty, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();

    // 中心点
    ctx.fillStyle = rgba(rgb, 0.95);
    ctx.beginPath();
    ctx.arc(tx, ty, Math.max(1.6, r * 0.1), 0, Math.PI * 2);
    ctx.fill();

    // 四向刻度
    ctx.strokeStyle = rgba(rgb, 0.5);
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath();
    const tickIn = r * 1.1;
    const tickOut = r * 1.24;
    for (let q = 0; q < 4; q++) {
      const angle = q * Math.PI / 2 + Math.PI / 4;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      ctx.moveTo(tx + cosA * tickIn, ty + sinA * tickIn);
      ctx.lineTo(tx + cosA * tickOut, ty + sinA * tickOut);
    }
    ctx.stroke();

    // 跟枪靶：旋转锁定弧
    if (t.kind === 'tracking') {
      ctx.strokeStyle = rgba(rgb, 0.26);
      ctx.lineWidth = Math.max(1, r * 0.03);
      ctx.beginPath();
      ctx.arc(tx, ty, r * 1.16, ambientTime * 0.6, ambientTime * 0.6 + Math.PI * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tx, ty, r * 1.16, ambientTime * 0.6 + Math.PI, ambientTime * 0.6 + Math.PI * 1.7);
      ctx.stroke();
    }

    // 悬停高亮
    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(tx, ty, r * 1.34, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 甩枪靶：存活进度环
    if (t.kind === 'flick' && t.maxLife > 0) {
      const ratio = clamp(t.lifeLeft / t.maxLife, 0, 1);
      const ringRadius = r * 1.45;
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.strokeStyle = 'rgba(8,16,26,0.5)';
      ctx.beginPath();
      ctx.arc(tx, ty, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = ratio > 0.35 ? accentHex : '#ff5470';
      ctx.beginPath();
      ctx.arc(tx, ty, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* 3D 小球目标：用偏移高光 + 深色边缘 + 环境光做出球体体积，
     同时保留细环、中心和 flick 计时环，近 Aim Lab 的目标球观感。 */
  function drawTargetOrb(t) {
    if (t.visible3d === false) return;
    const sc = targetScreen(t);
    const tx = sc.x;
    const ty = sc.y;
    const tr = sc.r;
    const spawnK = clamp(t.age / 0.2, 0, 1);
    const appear = easeOutBack(spawnK);
    const baseR = tr * (0.25 + 0.75 * appear);
    const pulse = 1 + Math.sin(t.age * 5.2 + t.id * 0.7) * 0.015;
    const r = baseR * pulse;
    if (r <= 0.6) return;
    const hover = isAimOverTarget(t);
    const alpha = clamp(spawnK * 1.7, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;

    // 干净的实心蓝球：只有左上高光和右下暗部，没有光晕、圆环或准星刻度
    const ball = ctx.createRadialGradient(
      tx - r * 0.34, ty - r * 0.38, Math.max(0.5, r * 0.05),
      tx, ty, r * 1.02
    );
    ball.addColorStop(0, '#f4ffff');
    ball.addColorStop(0.2, '#c9f9ff');
    ball.addColorStop(0.52, '#6ee8ff');
    ball.addColorStop(0.78, '#2ac4e6');
    ball.addColorStop(1, '#0b88ad');
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.arc(tx, ty, r, 0, Math.PI * 2);
    ctx.fill();

    // 悬停时只给一圈极细的白边，不放大目标轮廓
    if (hover) {
      ctx.strokeStyle = 'rgba(250,255,240,0.62)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(tx, ty, r + 1, 0, Math.PI * 2);
      ctx.stroke();
    }

    // flick 模式保留极细的剩余时间弧，避免看不见倒计时；其他模式不加任何圈
    if (t.kind === 'flick') {
      const ratio = clamp(t.lifeLeft / FLICK_LIFE, 0, 1);
      ctx.strokeStyle = ratio < 0.3 ? 'rgba(255,120,120,0.78)' : 'rgba(160,240,255,0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(tx, ty, r * 1.15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    ctx.restore();
  }

  function isAimOverTarget(t) {
    if (phase !== 'playing' && phase !== 'countdown') return false;
    if (t.visible3d === false) return false;
    const tx = Number.isFinite(t.sx) ? t.sx : t.x;
    const ty = Number.isFinite(t.sy) ? t.sy : t.y;
    const tr = Number.isFinite(t.sr) ? t.sr : t.r;
    const d = distance(aim.x, aim.y, tx, ty);
    return d <= tr + (t.kind === 'tracking' ? 0 : HIT_TOLERANCE);
  }

  function drawEffects() {
    const effects = effectsOn();
    if (effects) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < ripples.length; i++) {
        const r = ripples[i];
        const k = clamp(r.age / r.life, 0, 1);
        // 刻意做得比目标环更细更淡，避免被误认为靶
        ctx.globalAlpha = (1 - k) * 0.28;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = Math.max(0.6, 1.6 * (1 - k));
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r + (r.maxR - r.r) * easeOutCubic(k), 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const k = clamp(p.age / p.life, 0, 1);
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (floaters.length) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < floaters.length; i++) {
        const f = floaters[i];
        const k = clamp(f.age / f.life, 0, 1);
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = f.color;
        ctx.font = f.mono
          ? '700 ' + f.size + 'px "Cascadia Mono", Consolas, monospace'
          : '700 ' + f.size + 'px "Segoe UI", "Microsoft YaHei UI", sans-serif';
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    }

    if (hitmarkers.length) {
      ctx.save();
      for (let i = 0; i < hitmarkers.length; i++) {
        const m = hitmarkers[i];
        const k = clamp(m.age / m.life, 0, 1);
        const spread = 3 + k * 9;
        const inner = spread * 0.42;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = m.color || '#ffffff';
        ctx.lineWidth = m.type === 'miss' ? 2.4 : 2;
        ctx.beginPath();
        ctx.moveTo(m.x - spread, m.y - spread);
        ctx.lineTo(m.x - inner, m.y - inner);
        ctx.moveTo(m.x + spread, m.y - spread);
        ctx.lineTo(m.x + inner, m.y - inner);
        ctx.moveTo(m.x - spread, m.y + spread);
        ctx.lineTo(m.x - inner, m.y + inner);
        ctx.moveTo(m.x + spread, m.y + spread);
        ctx.lineTo(m.x + inner, m.y + inner);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawVignette() {
    if (!vignetteGrad) return;
    ctx.save();
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }

  function drawAimCrosshair() {
    if (phase !== 'playing' && phase !== 'countdown') return;
    if (crosshairBroken) return;
    const crosshair = getCrosshair();
    if (!crosshair || typeof crosshair.draw !== 'function') return;
    try {
      ctx.save();
      // 浅色训练舱里给准星加一层深色投影，避免亮底吞掉准星
      ctx.shadowColor = 'rgba(12, 32, 44, 0.72)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      crosshair.draw(ctx, aim.x, aim.y, crosshairCfg(), { kick: kick });
      ctx.restore();
    } catch (err) {
      crosshairBroken = true;
    }
  }

  /* ==========================================================================
   * 12.5 · 第一人称训练舱 & 程序化枪模
   * 不依赖任何外部模型/图片：全部由 Canvas 2D 路径与渐变实时绘制。
   * ====================================================================== */

  function fillPoly(points, fill, stroke, lineWidth) {
    if (!points || points.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  function drawBackground(effects) {
    if (!ctx) return;
    ensureGradients();
    const w = viewW;
    const h = viewH;
    const motion = effects ? 1 : 0;
    const nx = clamp(aim.x / Math.max(1, w) - 0.5, -0.5, 0.5);
    const ny = clamp(aim.y / Math.max(1, h) - 0.5, -0.5, 0.5);
    const bob = motion ? Math.sin(ambientTime * 1.15) * 1.7 : 0;
    const vpX = w * 0.5 - nx * w * 0.085;
    const vpY = h * 0.445 - ny * h * 0.035 + bob;

    // 基础天幕
    ctx.fillStyle = bgGrad || '#04070f';
    ctx.fillRect(0, 0, w, h);
    if (glowGrad) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    const backW = Math.min(w * 0.76, h * 1.24);
    const backTop = Math.max(h * 0.10, vpY - h * 0.30);
    const backBottom = Math.min(h * 0.76, vpY + h * 0.23);
    const backLeft = vpX - backW / 2;
    const backRight = vpX + backW / 2;

    // ── 天花板 ─────────────────────────────────────────────
    const ceiling = ctx.createLinearGradient(0, 0, 0, backTop + 2);
    ceiling.addColorStop(0, '#02050a');
    ceiling.addColorStop(0.45, '#050c16');
    ceiling.addColorStop(1, '#091624');
    ctx.fillStyle = ceiling;
    ctx.fillRect(0, 0, w, Math.max(2, backTop + 1));

    ctx.save();
    ctx.strokeStyle = rgba(accent, motion ? 0.09 : 0.07);
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i += 1) {
      const t = i / 10;
      ctx.beginPath();
      ctx.moveTo(t * w, -10);
      ctx.lineTo(backLeft + t * backW, backTop);
      ctx.stroke();
    }
    for (let r = 1; r <= 3; r += 1) {
      const t = r / 4;
      const y = backTop * t * 0.92;
      ctx.strokeStyle = 'rgba(96,170,220,' + (0.035 + t * 0.025) + ')';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // 天花板灯带
    ctx.globalCompositeOperation = 'lighter';
    const ceilingLights = [
      [w * 0.12, w * 0.27, h * 0.026],
      [w * 0.73, w * 0.88, h * 0.026],
    ];
    for (let i = 0; i < ceilingLights.length; i += 1) {
      const light = ceilingLights[i];
      const lg = ctx.createLinearGradient(light[0], 0, light[1], 0);
      lg.addColorStop(0, rgba(accent, 0));
      lg.addColorStop(0.5, rgba(accent, motion ? 0.42 : 0.28));
      lg.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(light[0], light[2], light[1] - light[0], 2);
      const halo = ctx.createRadialGradient((light[0] + light[1]) / 2, light[2], 1, (light[0] + light[1]) / 2, light[2], w * 0.11);
      halo.addColorStop(0, rgba(accent, 0.09));
      halo.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.ellipse((light[0] + light[1]) / 2, light[2], w * 0.11, h * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ── 侧墙 ───────────────────────────────────────────────
    const leftWall = ctx.createLinearGradient(0, 0, backLeft, 0);
    leftWall.addColorStop(0, '#02060c');
    leftWall.addColorStop(0.62, '#07111d');
    leftWall.addColorStop(1, '#0a1928');
    fillPoly([[0, 0], [backLeft, backTop], [backLeft, backBottom], [0, h]], leftWall);
    const rightWall = ctx.createLinearGradient(w, 0, backRight, 0);
    rightWall.addColorStop(0, '#02060c');
    rightWall.addColorStop(0.62, '#07111d');
    rightWall.addColorStop(1, '#0a1928');
    fillPoly([[w, 0], [backRight, backTop], [backRight, backBottom], [w, h]], rightWall);

    ctx.save();
    ctx.strokeStyle = 'rgba(82,150,200,0.10)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i += 1) {
      const t = i / 5;
      ctx.beginPath();
      ctx.moveTo(0, h * t);
      ctx.lineTo(backLeft, backTop + (backBottom - backTop) * t * 0.78);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w, h * t);
      ctx.lineTo(backRight, backTop + (backBottom - backTop) * t * 0.78);
      ctx.stroke();
    }
    // 侧墙立柱光带
    ctx.globalCompositeOperation = 'lighter';
    for (let side = 0; side < 2; side += 1) {
      const edge = side === 0 ? backLeft - w * 0.14 : backRight + w * 0.14;
      const edgeIn = side === 0 ? backLeft - w * 0.055 : backRight + w * 0.055;
      const strip = ctx.createLinearGradient(edge, 0, edgeIn, 0);
      strip.addColorStop(0, rgba(accent, 0));
      strip.addColorStop(1, rgba(accent, motion ? 0.25 : 0.16));
      ctx.fillStyle = strip;
      ctx.fillRect(Math.min(edge, edgeIn), backTop + h * 0.04, Math.abs(edgeIn - edge), (backBottom - backTop) * 0.74);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ── 远端训练墙 ────────────────────────────────────────
    const wall = ctx.createLinearGradient(0, backTop, 0, backBottom);
    wall.addColorStop(0, '#081522');
    wall.addColorStop(0.34, '#06101b');
    wall.addColorStop(0.72, '#040b14');
    wall.addColorStop(1, '#07101a');
    ctx.fillStyle = wall;
    ctx.fillRect(backLeft, backTop, backW, backBottom - backTop);

    ctx.save();
    ctx.beginPath();
    ctx.rect(backLeft, backTop, backW, backBottom - backTop);
    ctx.clip();

    // 墙面细网格
    ctx.lineWidth = 1;
    for (let i = 1; i < 18; i += 1) {
      const x = backLeft + (backW / 18) * i;
      ctx.strokeStyle = 'rgba(88,160,210,' + (i % 3 === 0 ? 0.08 : 0.035) + ')';
      ctx.beginPath();
      ctx.moveTo(x, backTop);
      ctx.lineTo(x, backBottom);
      ctx.stroke();
    }
    for (let i = 1; i < 8; i += 1) {
      const y = backTop + ((backBottom - backTop) / 8) * i;
      ctx.strokeStyle = 'rgba(88,160,210,' + (i % 2 === 0 ? 0.075 : 0.04) + ')';
      ctx.beginPath();
      ctx.moveTo(backLeft, y);
      ctx.lineTo(backRight, y);
      ctx.stroke();
    }

    // 中央全息圆环
    ctx.save();
    ctx.translate(vpX, vpY + h * 0.012);
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(0, 0, 8, 0, 0, backW * 0.40);
    halo.addColorStop(0, rgba(accent, motion ? 0.14 : 0.1));
    halo.addColorStop(0.48, rgba(accent, 0.035));
    halo.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(0, 0, backW * 0.36, (backBottom - backTop) * 0.39, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, motion ? 0.26 : 0.18);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i += 1) {
      const radius = backW * (0.085 + i * 0.055);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.82, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([2, 12]);
    ctx.strokeStyle = rgba(accent, motion ? 0.34 : 0.22);
    ctx.beginPath();
    ctx.ellipse(0, 0, backW * 0.205, backW * 0.168, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // 上部标识与灯条（小屏 HUD 占据顶部，省略背景字避免重叠）
    if (w >= 720) {
      ctx.fillStyle = rgba(accent, 0.24);
      ctx.font = '600 9px "Cascadia Mono", Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('AIMLAB // TRAINING RANGE', backLeft + 18, backTop + 18);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(139,162,189,0.30)';
      ctx.fillText('SECTOR 07 · LIVE', backRight - 18, backTop + 18);
    }

    // 墙面竖向光带
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i += 1) {
      const x = backLeft + (backW / 6) * i + 14;
      const lg = ctx.createLinearGradient(0, backTop + 34, 0, backBottom - 20);
      lg.addColorStop(0, rgba(accent, 0.18));
      lg.addColorStop(0.5, rgba(accent, 0.035));
      lg.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(x, backTop + 34, 1, Math.max(10, backBottom - backTop - 54));
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // 墙框高光
    ctx.save();
    ctx.strokeStyle = rgba(accent, motion ? 0.28 : 0.18);
    ctx.lineWidth = 1;
    ctx.strokeRect(backLeft + 0.5, backTop + 0.5, backW - 1, backBottom - backTop - 1);
    ctx.globalCompositeOperation = 'lighter';
    const topStrip = ctx.createLinearGradient(backLeft, 0, backRight, 0);
    topStrip.addColorStop(0, rgba(accent, 0));
    topStrip.addColorStop(0.5, rgba(accent, motion ? 0.32 : 0.2));
    topStrip.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = topStrip;
    ctx.fillRect(backLeft, backTop, backW, 1.5);
    ctx.fillRect(backLeft, backBottom - 1, backW, 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ── 地面 ──────────────────────────────────────────────
    const floorTop = backBottom;
    const floor = ctx.createLinearGradient(0, floorTop, 0, h);
    floor.addColorStop(0, '#06111c');
    floor.addColorStop(0.55, '#040b13');
    floor.addColorStop(1, '#02060b');
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorTop, w, h - floorTop);

    // 地面自远端的光池
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pool = ctx.createRadialGradient(vpX, floorTop, 4, vpX, floorTop, w * 0.52);
    pool.addColorStop(0, rgba(accent, motion ? 0.13 : 0.09));
    pool.addColorStop(0.5, rgba(accent, 0.025));
    pool.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(vpX, floorTop + (h - floorTop) * 0.42, w * 0.52, (h - floorTop) * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // 透视地砖
    ctx.save();
    const vpFloor = { x: vpX, y: floorTop };
    ctx.strokeStyle = 'rgba(78,150,200,0.085)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 22; i += 1) {
      const t = i / 22 - 0.5;
      ctx.beginPath();
      ctx.moveTo(vpFloor.x + t * w * 0.10, vpFloor.y);
      ctx.lineTo(vpFloor.x + t * w * 2.7, h + 40);
      ctx.stroke();
    }
    const rows = 15;
    const flow = motion ? (ambientTime * 0.22) % 1 : 0;
    for (let i = 0; i < rows; i += 1) {
      const p = (i + flow) / rows;
      const y = floorTop + (h - floorTop + 80) * Math.pow(p, 2.05);
      if (y < floorTop + 2 || y > h + 10) continue;
      ctx.strokeStyle = 'rgba(78,150,200,' + (0.035 + p * 0.075).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // 地面中心环与两侧引导线
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(accent, motion ? 0.19 : 0.12);
    ctx.lineWidth = 1.4;
    const ringY = floorTop + (h - floorTop) * 0.42;
    ctx.beginPath();
    ctx.ellipse(vpX, ringY, w * 0.20, (h - floorTop) * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, motion ? 0.1 : 0.06);
    ctx.beginPath();
    ctx.ellipse(vpX, ringY, w * 0.31, (h - floorTop) * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 地面小灯
    for (let i = 0; i < 8; i += 1) {
      const t = i / 8;
      const x = vpX + (t - 0.5) * w * 0.94;
      const y = floorTop + (h - floorTop) * (0.28 + t * 0.33);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
      glow.addColorStop(0, rgba(accent, 0.25));
      glow.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(accent, 0.55);
      ctx.fillRect(x - 4, y - 1, 8, 1.4);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ── 侧翼设备 / 立柱剪影 ───────────────────────────────
    ctx.save();
    const pillarTop = backTop + (backBottom - backTop) * 0.15;
    // 左侧控制台
    fillPoly([
      [0, h * 0.70],
      [backLeft * 0.72, backTop + (backBottom - backTop) * 0.55],
      [backLeft * 0.82, h * 0.83],
      [0, h],
    ], 'rgba(3,8,14,0.7)', 'rgba(90,160,210,0.09)', 1);
    fillPoly([
      [w, h * 0.70],
      [w - backLeft * 0.72, backTop + (backBottom - backTop) * 0.55],
      [w - backLeft * 0.82, h * 0.83],
      [w, h],
    ], 'rgba(3,8,14,0.7)', 'rgba(90,160,210,0.09)', 1);
    // 立柱
    const pillarW = w * 0.032;
    const pillarH = backBottom - backTop;
    for (let side = 0; side < 2; side += 1) {
      const x = side === 0 ? backLeft - pillarW : backRight;
      const grad = ctx.createLinearGradient(x, 0, x + pillarW, 0);
      grad.addColorStop(0, 'rgba(4,10,17,0.95)');
      grad.addColorStop(0.5, 'rgba(14,29,42,0.95)');
      grad.addColorStop(1, 'rgba(4,10,17,0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, pillarTop, pillarW, pillarH + h * 0.10);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(accent, 0.28);
      ctx.fillRect(x + pillarW * 0.5 - 0.5, pillarTop + 12, 1, pillarH * 0.76);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(90,160,210,0.12)';
      ctx.strokeRect(x + 0.5, pillarTop + 0.5, pillarW - 1, pillarH + h * 0.10 - 1);
    }
    ctx.restore();

    // ── 远景雾与尘埃 ──────────────────────────────────────
    const fog = ctx.createLinearGradient(0, backTop, 0, backBottom);
    fog.addColorStop(0, 'rgba(4,10,17,0)');
    fog.addColorStop(0.55, 'rgba(10,28,44,0.16)');
    fog.addColorStop(1, 'rgba(4,10,17,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(backLeft, backTop, backW, backBottom - backTop);

    drawDust(effects);
  }

  function roundRectPath(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawWeapon() {
    if (!ctx || !mode) return;
    const w = viewW;
    const h = viewH;
    const effects = effectsOn();
    const nx = clamp(aim.x / Math.max(1, w) - 0.5, -0.5, 0.5);
    const ny = clamp(aim.y / Math.max(1, h) - 0.5, -0.5, 0.5);
    const recoil = clamp(weaponKick, 0, 1);
    const s = clamp(Math.min(w / 1440, h / 900), 0.66, 1.18) * 0.98;
    const swayX = -nx * 72 * s + (effects ? Math.sin(weaponSwayT * 1.1) * 3.2 : 0);
    const swayY = -ny * 32 * s + recoil * 20 * s + (effects ? Math.cos(weaponSwayT * 0.85) * 2.2 : 0);
    const accentCss = accentHex;
    const accentSoft = rgba(accent, 0.55);

    ctx.save();
    ctx.translate(w * 0.90 + swayX, h * 1.045 + swayY);
    ctx.rotate(-0.165 + nx * 0.014 + recoil * 0.032);
    ctx.scale(s, s);

    // 枪身投影（给画布一点体积感）
    ctx.save();
    ctx.filter = 'blur(10px)';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    fillPoly([[-380, -240], [250, -20], [300, 72], [-250, 80]], 'rgba(0,0,0,0.55)');
    ctx.restore();

    // 金属与握把渐变
    const steel = ctx.createLinearGradient(-340, -300, 180, 60);
    steel.addColorStop(0, '#596a78');
    steel.addColorStop(0.16, '#2f3c47');
    steel.addColorStop(0.5, '#1a242e');
    steel.addColorStop(0.82, '#101820');
    steel.addColorStop(1, '#080d12');
    const steelDark = ctx.createLinearGradient(-250, -220, 160, 70);
    steelDark.addColorStop(0, '#27333d');
    steelDark.addColorStop(0.45, '#121b23');
    steelDark.addColorStop(1, '#080d12');
    const gripGrad = ctx.createLinearGradient(50, -30, 150, 150);
    gripGrad.addColorStop(0, '#1c2731');
    gripGrad.addColorStop(1, '#070b10');
    const gloveGrad = ctx.createLinearGradient(-300, -260, -120, -100);
    gloveGrad.addColorStop(0, '#2a3742');
    gloveGrad.addColorStop(0.55, '#141d25');
    gloveGrad.addColorStop(1, '#080d12');

    // 枪托
    fillPoly([[72, -128], [255, -58], [312, -22], [272, 22], [62, -46]], steelDark, 'rgba(120,160,190,0.18)', 1);
    fillPoly([[245, -54], [305, -26], [296, 16], [241, -2]], '#070c11', 'rgba(100,140,170,0.22)', 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(105, -116);
    ctx.lineTo(258, -53);
    ctx.stroke();

    // 机匣主体
    fillPoly([[-196, -224], [92, -111], [132, -62], [32, -2], [-162, -86]], steel, 'rgba(160,195,220,0.18)', 1.1);
    // 下机匣
    fillPoly([[-160, -88], [96, -8], [76, 40], [-138, -38]], steelDark, 'rgba(120,155,180,0.12)', 1);
    // 护木
    fillPoly([[-430, -304], [-196, -220], [-177, -153], [-404, -236]], steel, 'rgba(170,205,230,0.16)', 1.1);
    // 护木散热槽
    ctx.strokeStyle = 'rgba(4,9,14,0.8)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 4; i += 1) {
      const t = i / 4;
      ctx.beginPath();
      ctx.moveTo(-385 + t * 148, -278 + t * 54);
      ctx.lineTo(-365 + t * 148, -245 + t * 54);
      ctx.stroke();
    }

    // 枪管
    fillPoly([[-585, -336], [-438, -276], [-433, -255], [-578, -315]], '#1a232c', 'rgba(140,175,200,0.2)', 1);
    // 枪口制退器
    fillPoly([[-626, -349], [-574, -329], [-570, -306], [-619, -327]], '#101820', 'rgba(160,195,220,0.28)', 1);
    ctx.fillStyle = 'rgba(3,7,11,0.9)';
    ctx.beginPath();
    ctx.ellipse(-609, -334, 5.5, 10, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // 顶部导轨
    fillPoly([[-255, -248], [-94, -187], [-100, -167], [-260, -228]], '#263640', 'rgba(170,205,230,0.14)', 0.8);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const t = i / 7;
      ctx.beginPath();
      ctx.moveTo(-246 + t * 145, -239 + t * 55);
      ctx.lineTo(-241 + t * 145, -225 + t * 55);
      ctx.stroke();
    }

    // 弹匣
    const magGrad = ctx.createLinearGradient(-30, -90, 80, 100);
    magGrad.addColorStop(0, '#25323d');
    magGrad.addColorStop(0.55, '#101820');
    magGrad.addColorStop(1, '#060a0f');
    fillPoly([[-56, -100], [9, -77], [36, 32], [5, 66], [-26, 4]], magGrad, 'rgba(130,165,190,0.18)', 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      const t = i / 4;
      ctx.beginPath();
      ctx.moveTo(-42 + t * 32, -64 + t * 55);
      ctx.lineTo(-10 + t * 32, -51 + t * 55);
      ctx.stroke();
    }

    // 手枪握把
    fillPoly([[44, -48], [112, -20], [97, 122], [42, 92]], gripGrad, 'rgba(120,155,180,0.16)', 1);
    // 握把防滑纹
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i += 1) {
      const t = i / 5;
      ctx.beginPath();
      ctx.moveTo(54 + t * 45, 4 + t * 80);
      ctx.lineTo(75 + t * 45, 10 + t * 80);
      ctx.stroke();
    }

    // 扳机护圈与扳机
    ctx.strokeStyle = 'rgba(120,155,180,0.26)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(18, 6, 31, -0.2, Math.PI - 0.25);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20,32,42,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(18, 6, 26, 0.1, Math.PI - 0.2);
    ctx.stroke();
    ctx.strokeStyle = accentSoft;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(18, 6, 26, 0.9, 1.35);
    ctx.stroke();

    // 全息瞄具
    fillPoly([[-196, -274], [-112, -242], [-105, -210], [-188, -242]], '#151f29', 'rgba(160,195,220,0.25)', 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sightGlow = ctx.createRadialGradient(-150, -247, 1, -150, -247, 38);
    sightGlow.addColorStop(0, rgba(accent, 0.45));
    sightGlow.addColorStop(0.55, rgba(accent, 0.12));
    sightGlow.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = sightGlow;
    ctx.beginPath();
    ctx.ellipse(-150, -247, 32, 22, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-150, -247, 25, 17, -0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-150, -257);
    ctx.lineTo(-150, -237);
    ctx.moveTo(-160, -247);
    ctx.lineTo(-140, -247);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // 枪身霓虹点缀
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(accent, 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-176, -206);
    ctx.lineTo(-114, -182);
    ctx.moveTo(-56, -160);
    ctx.lineTo(66, -116);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-417, -278);
    ctx.lineTo(-198, -199);
    ctx.stroke();
    ctx.restore();

    // 序列号 / 小细节
    ctx.save();
    ctx.fillStyle = 'rgba(198,224,240,0.35)';
    ctx.font = '600 8px "Cascadia Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VX-09 // 6.8', -4, -76);
    ctx.fillStyle = rgba(accent, 0.45);
    ctx.fillRect(-57, -39, 3, 13);
    ctx.restore();

    // 手部：先左（护木）后右（握把）
    drawWeaponHand(-281, -190, 0.58, 0.92, gloveGrad, accentSoft);
    drawWeaponHand(83, 34, -0.2, 1.02, gloveGrad, accentSoft);

    // 枪口焰
    if (muzzleFlash > 0.02 && effects) {
      ctx.save();
      ctx.translate(-626, -338);
      ctx.globalCompositeOperation = 'lighter';
      const flash = muzzleFlash;
      const radius = 42 + 52 * flash;
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, radius * 1.65);
      glow.addColorStop(0, 'rgba(255,255,240,' + (0.95 * flash) + ')');
      glow.addColorStop(0.2, 'rgba(255,205,110,' + (0.8 * flash) + ')');
      glow.addColorStop(0.55, 'rgba(255,120,32,' + (0.25 * flash) + ')');
      glow.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,244,205,' + (0.9 * flash) + ')';
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2 + 0.2;
        const len = (i % 2 === 0 ? 62 : 37) * flash;
        const spread = 0.12 + (i % 3) * 0.03;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - spread) * 8, Math.sin(a - spread) * 8);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.lineTo(Math.cos(a + spread) * 8, Math.sin(a + spread) * 8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    ctx.restore();
  }

  function drawWeaponHand(x, y, rot, size, gradient, accentLine) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(size, size);
    // 袖口
    fillPoly([[-16, 66], [52, 82], [68, 138], [-6, 120]], '#0a1015', 'rgba(100,140,170,0.2)', 1);
    ctx.strokeStyle = rgba(accent, 0.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, 80);
    ctx.lineTo(54, 94);
    ctx.stroke();
    // 手套主体
    fillPoly([[-38, -16], [38, -30], [66, 24], [46, 68], [-20, 74], [-52, 32]], gradient, 'rgba(150,185,210,0.16)', 1);
    // 指节
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? '#1d2933' : '#15202a';
      ctx.beginPath();
      ctx.ellipse(-22 + i * 17, 22 + i * 9, 9, 17, -0.5 + i * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.38)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 手背高光与发光缝线
    ctx.strokeStyle = 'rgba(210,235,250,0.12)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-34, -8);
    ctx.lineTo(20, -20);
    ctx.stroke();
    ctx.strokeStyle = accentLine;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-32, 42);
    ctx.lineTo(44, 28);
    ctx.stroke();
    ctx.restore();
  }

  /* ==========================================================================
   * 12.6 · 真 3D 训练舱背景与枪模
   * 全部由 Canvas 2D 的 3D 投影、世界坐标线段和多面体实时绘制。
   * ====================================================================== */

  function drawBackground3D(effects) {
    if (!ctx) return;
    const w = viewW;
    const h = viewH;
    const motion = effects ? 1 : 0;
    const floorY = -4.2;
    const ceilY = 5.4;
    const sideX = 13;
    const backZ = 12;
    const nearZ = 0.9;

    // 亮灰蓝训练舱：浅色底，避免暗场刺眼和靶子看不清
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#dbe5ea');
    base.addColorStop(0.45, '#edf2f5');
    base.addColorStop(1, '#c5d2da');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const backCenter = projectWorldPoint(0, 0.9, backZ - 0.4);
    if (backCenter.visible) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(backCenter.x, backCenter.y, 8, backCenter.x, backCenter.y, Math.max(w, h) * 0.55);
      glow.addColorStop(0, 'rgba(255,255,255,0.16)');
      glow.addColorStop(0.45, 'rgba(210,238,248,0.06)');
      glow.addColorStop(1, 'rgba(210,238,248,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // ── 房间六面（写实一点的透视盒子） ─────────────────────
    drawWorldPolygon(
      [[-sideX, floorY, backZ], [sideX, floorY, backZ], [sideX, ceilY, backZ], [-sideX, ceilY, backZ]],
      '#e3ebef',
      'rgba(44, 93, 118, 0.26)',
      1
    );
    drawWorldPolygon(
      [[-sideX, floorY, backZ], [-sideX, floorY, nearZ], [-sideX, ceilY, nearZ], [-sideX, ceilY, backZ]],
      '#cbd7de',
      'rgba(44, 93, 118, 0.18)',
      1
    );
    drawWorldPolygon(
      [[sideX, floorY, backZ], [sideX, floorY, nearZ], [sideX, ceilY, nearZ], [sideX, ceilY, backZ]],
      '#cbd7de',
      'rgba(44, 93, 118, 0.18)',
      1
    );
    drawWorldPolygon(
      [[-sideX, floorY, nearZ], [sideX, floorY, nearZ], [sideX, floorY, backZ], [-sideX, floorY, backZ]],
      '#b7c5ce',
      'rgba(44, 93, 118, 0.22)',
      1
    );
    drawWorldPolygon(
      [[-sideX, ceilY, nearZ], [sideX, ceilY, nearZ], [sideX, ceilY, backZ], [-sideX, ceilY, backZ]],
      '#f1f5f7',
      'rgba(44, 93, 118, 0.16)',
      1
    );

    // ── 远端墙面网格与灯带 ────────────────────────────────
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(38, 86, 112, 0.2)';
    for (let x = -12; x <= 12; x += 2) drawWorldLine(x, floorY, backZ, x, ceilY, backZ);
    for (let y = -4; y <= 5; y += 1.5) drawWorldLine(-12, y, backZ, 12, y, backZ);
    ctx.strokeStyle = 'rgba(38, 86, 112, 0.13)';
    for (let x = -12; x <= 12; x += 4) drawWorldLine(x, ceilY, nearZ, x, ceilY, backZ);
    for (let z = 2; z <= 11; z += 2) {
      drawWorldLine(-sideX, ceilY, z, sideX, ceilY, z);
      drawWorldLine(-sideX, floorY, z, sideX, floorY, z);
    }
    ctx.restore();

    // 交互式目标墙背板（在 z=9.4，目标浮在更近的 z=6）
    const panelZ = 9.4;
    drawWorldPolygon(
      [[-6.8, -2.9, panelZ], [6.8, -2.9, panelZ], [6.8, 3.9, panelZ], [-6.8, 3.9, panelZ]],
      'rgba(245, 250, 252, 0.86)',
      'rgba(26, 104, 135, 0.48)',
      1.2
    );
    // 背板内的细网格
    ctx.save();
    ctx.strokeStyle = 'rgba(32, 99, 126, 0.16)';
    for (let x = -6; x <= 6; x += 1.5) drawWorldLine(x, -2.9, panelZ, x, 3.9, panelZ);
    for (let y = -2.4; y <= 3.6; y += 1.2) drawWorldLine(-6.8, y, panelZ, 6.8, y, panelZ);
    ctx.restore();
    // 背板中央全息环
    ctx.save();
    ctx.strokeStyle = 'rgba(22, 112, 142, 0.45)';
    ctx.lineWidth = 1.2;
    const ringCenter = projectWorldPoint(0, 0.5, panelZ);
    if (ringCenter.visible) {
      const ringRadius = Math.min(w, h) * 0.22;
      ctx.beginPath();
      ctx.ellipse(ringCenter.x, ringCenter.y, ringRadius, ringRadius * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(22, 112, 142, 0.22)';
      ctx.beginPath();
      ctx.ellipse(ringCenter.x, ringCenter.y, ringRadius * 0.62, ringRadius * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([3, 14]);
      ctx.strokeStyle = 'rgba(22, 112, 142, 0.55)';
      ctx.beginPath();
      ctx.ellipse(ringCenter.x, ringCenter.y, ringRadius * 1.28, ringRadius * 0.54, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // 背板边框与角落高光
    ctx.save();
    ctx.strokeStyle = 'rgba(22, 104, 135, 0.58)';
    ctx.lineWidth = 1.4;
    drawWorldLine(-6.8, -2.9, panelZ, 6.8, -2.9, panelZ);
    drawWorldLine(6.8, -2.9, panelZ, 6.8, 3.9, panelZ);
    drawWorldLine(6.8, 3.9, panelZ, -6.8, 3.9, panelZ);
    drawWorldLine(-6.8, 3.9, panelZ, -6.8, -2.9, panelZ);
    ctx.restore();

    // 远端大型灯条
    for (let i = 0; i < 4; i += 1) {
      const x = -9.6 + i * 6.4;
      drawWorldPolygon(
        [[x - 0.9, 3.9, backZ - 0.02], [x + 0.9, 3.9, backZ - 0.02], [x + 0.9, 4.05, backZ - 0.02], [x - 0.9, 4.05, backZ - 0.02]],
        'rgba(63, 142, 170, 0.2)'
      );
    }

    // ── 天花板灯带与侧墙面板 ────────────────────────────────
    for (let i = 0; i < 3; i += 1) {
      const z = 2.8 + i * 3.1;
      drawWorldPolygon(
        [[-5.2, ceilY - 0.04, z], [5.2, ceilY - 0.04, z], [5.2, ceilY - 0.04, z + 0.42], [-5.2, ceilY - 0.04, z + 0.42]],
        'rgba(255, 255, 255, 0.72)'
      );
      drawWorldPolygon(
        [[-5.2, ceilY - 0.03, z + 0.5], [5.2, ceilY - 0.03, z + 0.5], [5.2, ceilY - 0.03, z + 0.54], [-5.2, ceilY - 0.03, z + 0.54]],
        'rgba(64, 150, 180, 0.5)'
      );
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(40, 96, 122, 0.14)';
    for (let z = 1.6; z <= 11; z += 1.4) {
      drawWorldLine(-sideX, -4.2, z, -sideX, 5.4, z);
      drawWorldLine(sideX, -4.2, z, sideX, 5.4, z);
    }
    ctx.strokeStyle = 'rgba(38, 118, 148, 0.28)';
    drawWorldLine(-sideX + 0.01, -3.0, 2.2, -sideX + 0.01, 2.2, 2.2);
    drawWorldLine(sideX - 0.01, -3.0, 2.2, sideX - 0.01, 2.2, 2.2);
    ctx.restore();

    // ── 地板透视网格与环形平台 ──────────────────────────────
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(38, 88, 112, 0.2)';
    for (let x = -12; x <= 12; x += 2) drawWorldLine(x, floorY, 1.4, x, floorY, 12);
    for (let z = 1.4; z <= 12; z += 1.05) drawWorldLine(-12, floorY, z, 12, floorY, z);
    ctx.strokeStyle = 'rgba(20, 105, 135, 0.36)';
    ctx.lineWidth = 1.4;
    drawWorldLine(-7.6, floorY + 0.01, 2.2, 7.6, floorY + 0.01, 2.2);
    drawWorldLine(-7.6, floorY + 0.01, 8.4, 7.6, floorY + 0.01, 8.4);
    // 地面圆环
    ctx.strokeStyle = 'rgba(20, 105, 135, 0.34)';
    ctx.beginPath();
    const ringSegments = 48;
    let started = false;
    for (let i = 0; i <= ringSegments; i += 1) {
      const a = (i / ringSegments) * Math.PI * 2;
      const p = projectWorldPoint(Math.cos(a) * 4.6, floorY + 0.012, 5.8 + Math.sin(a) * 4.6);
      if (!p.visible) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
    ctx.restore();

    // ── 侧边立柱（世界空间多面体） ─────────────────────────
    drawWorldBoxMesh(-10.8, -4.2, 5.2, 0.42, 8.6, 0.42, [168, 184, 194], [62, 102, 124]);
    drawWorldBoxMesh(10.8, -4.2, 5.2, 0.42, 8.6, 0.42, [168, 184, 194], [62, 102, 124]);
    drawWorldBoxMesh(-10.8, -4.2, 9.4, 0.42, 8.6, 0.42, [168, 184, 194], [62, 102, 124]);
    drawWorldBoxMesh(10.8, -4.2, 9.4, 0.42, 8.6, 0.42, [168, 184, 194], [62, 102, 124]);

    // 侧墙竖向灯带（浅色场地下用深青色，不靠加色发光）
    for (let side = 0; side < 2; side += 1) {
      const sx = side === 0 ? -sideX + 0.03 : sideX - 0.03;
      drawWorldPolygon(
        [[sx, -3.2, 2.6], [sx, 2.4, 2.6], [sx, 2.4, 3.0], [sx, -3.2, 3.0]],
        'rgba(26, 118, 146, 0.32)'
      );
    }

    // 浅色场景远端轻雾，避免纯白刺眼
    const fog = ctx.createLinearGradient(0, h * 0.15, 0, h);
    fog.addColorStop(0, 'rgba(255,255,255,0)');
    fog.addColorStop(0.58, 'rgba(232,240,244,0.18)');
    fog.addColorStop(1, 'rgba(203,216,224,0.34)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, w, h);

    drawDust(effects);
  }

  // 简化的世界空间盒体渲染（用于场景立柱）
  function drawWorldBoxMesh(cx, cyBottom, cz, sx, sy, sz, color, edge) {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    const y0 = cyBottom;
    const y1 = cyBottom + sy;
    const faces = [
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    ];
    for (let i = 0; i < faces.length; i += 1) {
      drawWorldPolygon(faces[i], 'rgb(' + color.join(',') + ')', edge ? 'rgba(92,160,200,0.18)' : null, 1);
    }
  }

  function gunBox(cx, cy, cz, sx, sy, sz, color, opts) {
    const box = {
      c: [cx, cy, cz],
      s: [sx, sy, sz],
      color: color,
      rot: opts && opts.rot ? opts.rot : [0, 0, 0],
      emissive: !!(opts && opts.emissive),
      glow: !!(opts && opts.glow),
    };
    if (opts && opts.name) box.name = opts.name;
    return box;
  }

  const GUN_BOXES = [
    gunBox(0.02, 0.015, -0.29, 0.16, 0.14, 0.32, [36, 47, 57]),
    gunBox(0.02, 0.015, -0.50, 0.18, 0.16, 0.07, [15, 21, 27]),
    gunBox(0.0, 0.02, 0.06, 0.21, 0.17, 0.38, [40, 52, 63]),
    gunBox(0.0, 0.125, 0.07, 0.17, 0.055, 0.34, [25, 34, 42]),
    gunBox(0.0, 0.025, 0.40, 0.18, 0.14, 0.32, [30, 40, 49]),
    gunBox(0.0, 0.045, 0.69, 0.065, 0.065, 0.28, [53, 66, 77]),
    gunBox(0.0, 0.045, 0.86, 0.10, 0.10, 0.09, [19, 27, 34]),
    gunBox(0.0, -0.13, -0.02, 0.09, 0.23, 0.13, [27, 35, 43], { rot: [0.2, 0, 0] }),
    gunBox(0.0, -0.17, 0.21, 0.11, 0.25, 0.14, [22, 30, 37], { rot: [-0.18, 0, 0] }),
    gunBox(0.0, 0.155, 0.08, 0.13, 0.05, 0.18, [35, 45, 55]),
    gunBox(0.0, 0.205, 0.035, 0.085, 0.075, 0.05, [100, 236, 255], { emissive: true, glow: true }),
    gunBox(0.035, -0.10, -0.05, 0.12, 0.12, 0.17, [48, 61, 73]),
    gunBox(-0.025, -0.09, 0.39, 0.13, 0.105, 0.17, [46, 59, 70]),
    gunBox(0.11, -0.26, -0.16, 0.16, 0.26, 0.16, [30, 39, 48]),
    gunBox(-0.10, -0.2, 0.52, 0.15, 0.19, 0.2, [29, 38, 46]),
    gunBox(0.112, 0.02, 0.08, 0.006, 0.03, 0.23, [92, 225, 255], { emissive: true }),
    gunBox(-0.112, 0.02, 0.08, 0.006, 0.025, 0.2, [92, 225, 255], { emissive: true }),
    gunBox(0.0, 0.02, 0.22, 0.132, 0.028, 0.15, [18, 25, 31], { rot: [0, 0, 0.1] }),
    gunBox(0.095, -0.15, 0.12, 0.03, 0.2, 0.17, [35, 45, 54]),
    gunBox(-0.095, -0.13, 0.24, 0.03, 0.17, 0.15, [33, 43, 52]),
    // 手套指节
    gunBox(0.045, 0.005, -0.005, 0.12, 0.065, 0.17, [58, 73, 85]),
    gunBox(-0.03, -0.03, 0.33, 0.13, 0.065, 0.17, [56, 70, 82]),
  ];

  function vmCameraPoint(local, boxRot, group) {
    let x = local[0];
    let y = local[1];
    let z = local[2];
    if (boxRot) {
      const rx = boxRot[0] || 0;
      const ry = boxRot[1] || 0;
      const rz = boxRot[2] || 0;
      if (rz) {
        const c = Math.cos(rz);
        const s = Math.sin(rz);
        const nx = x * c - y * s;
        const ny = x * s + y * c;
        x = nx;
        y = ny;
      }
      if (ry) {
        const c = Math.cos(ry);
        const s = Math.sin(ry);
        const nx = x * c + z * s;
        const nz = -x * s + z * c;
        x = nx;
        z = nz;
      }
      if (rx) {
        const c = Math.cos(rx);
        const s = Math.sin(rx);
        const ny = y * c - z * s;
        const nz = y * s + z * c;
        y = ny;
        z = nz;
      }
    }
    const cy = Math.cos(group.yaw);
    const sy = Math.sin(group.yaw);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const cp = Math.cos(group.pitch);
    const sp = Math.sin(group.pitch);
    const y1 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    return {
      x: group.x + x1,
      y: group.y + y1,
      z: group.z + z2,
    };
  }

  function drawGun3D() {
    if (!ctx || !mode) return;
    const effects = effectsOn();
    const f = focalPx();
    const w = viewW;
    const h = viewH;
    const recoil = clamp(weaponKick, 0, 1);
    const baseZ = 1.35;
    const group = {
      x: (0.28 * w * baseZ) / f,
      y: -(0.30 * h * baseZ) / f,
      z: baseZ,
      yaw: -0.95,
      pitch: 0.03,
    };
    // FPS 视角摆动：相机转动时枪模有轻微滞后，开火时后坐
    group.x += clamp(camTurnSpeedX * 2.4, -0.09, 0.09) + (effects ? Math.sin(weaponSwayT * 1.25) * 0.004 : 0);
    group.y += clamp(-camTurnSpeedY * 1.5, -0.05, 0.05) + (effects ? Math.cos(weaponSwayT * 0.95) * 0.003 : 0);
    group.y += recoil * 0.03;
    group.z -= recoil * 0.06;
    group.yaw += recoil * 0.06 + (effects ? Math.sin(weaponSwayT * 0.7) * 0.004 : 0);
    group.pitch -= recoil * 0.04;

    // 收集所有盒体的 6 个面，空间排序后绘制
    const faces = [];
    for (let b = 0; b < GUN_BOXES.length; b += 1) {
      const box = GUN_BOXES[b];
      const hx = box.s[0] / 2;
      const hy = box.s[1] / 2;
      const hz = box.s[2] / 2;
      const signs = [
        [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
        [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
        [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]],
        [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
        [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
        [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]],
      ];
      for (let fi = 0; fi < 6; fi += 1) {
        const quad = signs[fi];
        const pts = [];
        let valid = true;
        for (let vi = 0; vi < 4; vi += 1) {
          const q = quad[vi];
          const local = [box.c[0] + q[0] * hx, box.c[1] + q[1] * hy, box.c[2] + q[2] * hz];
          const cp = vmCameraPoint(local, box.rot, group);
          if (cp.z <= CAM_NEAR) {
            valid = false;
            break;
          }
          pts.push({
            screenX: w / 2 + f * cp.x / cp.z,
            screenY: h / 2 - f * cp.y / cp.z,
            x: cp.x,
            y: cp.y,
            z: cp.z,
          });
        }
        if (!valid) continue;
        // 面法线（相机空间）
        const ax = pts[1].x - pts[0].x;
        const ay = pts[1].y - pts[0].y;
        const az = pts[1].z - pts[0].z;
        const bx = pts[2].x - pts[0].x;
        const by = pts[2].y - pts[0].y;
        const bz = pts[2].z - pts[0].z;
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        const center = {
          x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4,
          y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4,
          z: (pts[0].z + pts[1].z + pts[2].z + pts[3].z) / 4,
        };
        // 背向相机的面不画（相机在原点，指向 +Z）
        if (nx * center.x + ny * center.y + nz * center.z > 0) continue;
        let brightness = 0.3 + 0.7 * Math.max(0, nx * -0.35 + ny * 0.82 + nz * 0.45);
        if (!effects) brightness = 0.75;
        const base = box.emissive ? box.color : [
          Math.round(box.color[0] * brightness),
          Math.round(box.color[1] * brightness),
          Math.round(box.color[2] * brightness),
        ];
        faces.push({
          pts: pts,
          z: center.z,
          color: 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')',
          emissive: box.emissive,
          edge: box.emissive ? 'rgba(160,250,255,0.42)' : 'rgba(2,6,10,0.62)',
        });
      }
    }
    faces.sort((a, b) => b.z - a.z);
    ctx.save();
    for (let i = 0; i < faces.length; i += 1) {
      const face = faces[i];
      ctx.beginPath();
      ctx.moveTo(face.pts[0].screenX, face.pts[0].screenY);
      for (let p = 1; p < 4; p += 1) ctx.lineTo(face.pts[p].screenX, face.pts[p].screenY);
      ctx.closePath();
      ctx.fillStyle = face.color;
      if (face.emissive) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = 'rgba(92,235,255,0.55)';
        ctx.shadowBlur = 12;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = face.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // 枪口焰（投影到屏幕空间）
    if (muzzleFlash > 0.02 && effects) {
      const mp = vmCameraPoint([0, 0.045, 0.91], [0, 0, 0], group);
      if (mp.z > CAM_NEAR) {
        const sx = w / 2 + f * mp.x / mp.z;
        const sy = h / 2 - f * mp.y / mp.z;
        const flash = muzzleFlash;
        const radius = (30 + 46 * flash) * clamp(f / 800, 0.75, 1.35);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(sx, sy, 1, sx, sy, radius * 1.8);
        glow.addColorStop(0, 'rgba(255,255,238,' + (0.95 * flash) + ')');
        glow.addColorStop(0.22, 'rgba(255,211,120,' + (0.8 * flash) + ')');
        glow.addColorStop(0.58, 'rgba(255,124,34,' + (0.3 * flash) + ')');
        glow.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,246,206,' + (0.9 * flash) + ')';
        for (let i = 0; i < 7; i += 1) {
          const a = (i / 7) * Math.PI * 2 + 0.25;
          const len = (i % 2 === 0 ? 54 : 32) * flash * clamp(f / 750, 0.8, 1.2);
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a - 0.14) * 7, sy + Math.sin(a - 0.14) * 7);
          ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len);
          ctx.lineTo(sx + Math.cos(a + 0.14) * 7, sy + Math.sin(a + 0.14) * 7);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  /* ── 3D 枪模：侧面轮廓 + 沿厚度挤出 ─────────────────────────
     不引入模型文件。每个部件由设计稿多边形挤出成有正/背/侧面厚度的 3D 实体，
     再按相机透视投影；因此转动视角/后坐时能看到真实的体积和侧面高光。 */
  const GUN_DESIGN_SCALE = 0.00095;

  const GUN_PROFILE_PARTS = [
    { key: 'stock', pts: [[730, 358], [980, 430], [1000, 500], [710, 438]], fill: [43, 55, 66], depth: 118, z: 0.012 },
    { key: 'receiver', pts: [[438, 304], [760, 382], [738, 470], [418, 390]], fill: [54, 68, 80], depth: 128, z: 0.0 },
    { key: 'handguard', pts: [[228, 252], [470, 308], [452, 368], [210, 312]], fill: [39, 51, 62], depth: 98, z: -0.006 },
    { key: 'barrel', pts: [[22, 188], [246, 236], [243, 262], [20, 218]], fill: [58, 72, 84], depth: 52, z: -0.012 },
    { key: 'muzzle', pts: [[0, 176], [58, 190], [54, 226], [0, 212]], fill: [28, 38, 47], depth: 66, z: -0.014 },
    { key: 'grip', pts: [[638, 438], [714, 458], [688, 558], [610, 532]], fill: [27, 37, 46], depth: 88, z: 0.018 },
    { key: 'magazine', pts: [[524, 386], [600, 406], [582, 534], [512, 505]], fill: [33, 44, 53], depth: 96, z: 0.008 },
    { key: 'sightbase', pts: [[316, 226], [446, 254], [439, 276], [309, 248]], fill: [35, 46, 57], depth: 64, z: 0.006 },
    { key: 'sight', pts: [[328, 180], [430, 204], [422, 252], [320, 228]], fill: [20, 29, 37], depth: 48, z: 0.008 },
    { key: 'leftglove', pts: [[246, 280], [376, 316], [428, 354], [405, 402], [332, 402], [248, 354], [229, 316]], fill: [68, 83, 95], depth: 78, z: -0.024 },
    { key: 'rightglove', pts: [[648, 456], [738, 479], [782, 536], [762, 590], [692, 594], [642, 538], [626, 508]], fill: [65, 80, 92], depth: 84, z: -0.03 },
    { key: 'wristband', pts: [[676, 548], [756, 568], [786, 646], [702, 654], [660, 600]], fill: [27, 35, 43], depth: 92, z: 0.03 },
  ];

  function gunDesignPoint(dx, dy, localZ, group) {
    const lx = (dx - 500) * GUN_DESIGN_SCALE;
    const ly = (300 - dy) * GUN_DESIGN_SCALE;
    const cy = Math.cos(group.yaw);
    const sy = Math.sin(group.yaw);
    const x1 = lx * cy + localZ * sy;
    const z1 = -lx * sy + localZ * cy;
    const cp = Math.cos(group.pitch);
    const sp = Math.sin(group.pitch);
    const y1 = ly * cp - z1 * sp;
    const z2 = ly * sp + z1 * cp;
    return {
      x: group.x + x1,
      y: group.y + y1,
      z: group.z + z2,
    };
  }

  function projectGunPoint(p, f) {
    if (!p || p.z <= CAM_NEAR) return null;
    return {
      x: viewW / 2 + f * p.x / p.z,
      y: viewH / 2 - f * p.y / p.z,
      z: p.z,
    };
  }

  function drawGunProfile3D() {
    if (!ctx || !mode) return;
    const effects = effectsOn();
    const f = focalPx();
    const w = viewW;
    const h = viewH;
    const recoil = clamp(weaponKick, 0, 1);
    const baseZ = 1.2;
    const group = {
      x: (0.26 * w * baseZ) / f,
      y: -(0.24 * h * baseZ) / f,
      z: baseZ,
      yaw: -0.22,
      pitch: 0.018,
    };
    group.x += clamp(camTurnSpeedX * 2.2, -0.07, 0.07) + (effects ? Math.sin(weaponSwayT * 1.2) * 0.003 : 0);
    group.y += clamp(-camTurnSpeedY * 1.4, -0.05, 0.05) + (effects ? Math.cos(weaponSwayT * 0.9) * 0.002 : 0);
    group.y += recoil * 0.035;
    group.z -= recoil * 0.05;
    group.yaw += recoil * 0.045;
    group.pitch -= recoil * 0.03;

    const faces = [];
    function pushFace(camPts, color, edge, isCap) {
      if (!camPts || camPts.length < 3) return;
      let avgZ = 0;
      const proj = [];
      for (let i = 0; i < camPts.length; i += 1) {
        const p = camPts[i];
        if (p.z <= CAM_NEAR) return;
        const sp = projectGunPoint(p, f);
        if (!sp) return;
        proj.push(sp);
        avgZ += sp.z;
      }
      faces.push({ pts: proj, z: avgZ / camPts.length, color: color, edge: edge, isCap: !!isCap });
    }

    for (let partIndex = 0; partIndex < GUN_PROFILE_PARTS.length; partIndex += 1) {
      const part = GUN_PROFILE_PARTS[partIndex];
      const depth = part.depth * GUN_DESIGN_SCALE;
      const frontZ = part.z - depth / 2;
      const backZ = part.z + depth / 2;
      const front = [];
      const back = [];
      for (let i = 0; i < part.pts.length; i += 1) {
        const p = part.pts[i];
        front.push(gunDesignPoint(p[0], p[1], frontZ, group));
        back.push(gunDesignPoint(p[0], p[1], backZ, group));
      }
      const base = part.fill;
      const frontColor = 'rgb(' + Math.min(255, base[0] + 14) + ',' + Math.min(255, base[1] + 14) + ',' + Math.min(255, base[2] + 14) + ')';
      const backColor = 'rgb(' + Math.round(base[0] * 0.55) + ',' + Math.round(base[1] * 0.55) + ',' + Math.round(base[2] * 0.55) + ')';
      const sideColor = 'rgb(' + Math.round(base[0] * 0.78) + ',' + Math.round(base[1] * 0.78) + ',' + Math.round(base[2] * 0.78) + ')';
      pushFace(front, frontColor, 'rgba(2,6,10,0.65)', true);
      pushFace(back.slice().reverse(), backColor, 'rgba(2,6,10,0.5)', false);
      for (let i = 0; i < part.pts.length; i += 1) {
        const j = (i + 1) % part.pts.length;
        pushFace([front[i], front[j], back[j], back[i]], sideColor, 'rgba(2,6,10,0.55)', false);
      }
    }

    faces.sort((a, b) => b.z - a.z);
    ctx.save();
    for (let i = 0; i < faces.length; i += 1) {
      const face = faces[i];
      ctx.beginPath();
      ctx.moveTo(face.pts[0].x, face.pts[0].y);
      for (let p = 1; p < face.pts.length; p += 1) ctx.lineTo(face.pts[p].x, face.pts[p].y);
      ctx.closePath();
      ctx.fillStyle = face.color;
      ctx.fill();
      ctx.strokeStyle = face.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (face.isCap) {
        ctx.strokeStyle = 'rgba(158,196,219,0.16)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();

    // ── 表面细节（在枪的正面 Z 平面投影） ────────────────────
    const detailZ = -0.09;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(accent, 0.75);
    ctx.lineWidth = 2;
    // 机匣霓虹线
    ctx.beginPath();
    let dp = projectGunPoint(gunDesignPoint(470, 342, detailZ, group), f);
    if (dp) ctx.moveTo(dp.x, dp.y);
    dp = projectGunPoint(gunDesignPoint(724, 402, detailZ, group), f);
    if (dp) ctx.lineTo(dp.x, dp.y);
    dp = projectGunPoint(gunDesignPoint(470, 360, detailZ, group), f);
    if (dp) ctx.moveTo(dp.x, dp.y);
    dp = projectGunPoint(gunDesignPoint(700, 416, detailZ, group), f);
    if (dp) ctx.lineTo(dp.x, dp.y);
    ctx.stroke();

    // 护木散热槽
    ctx.strokeStyle = 'rgba(5,10,15,0.8)';
    ctx.lineWidth = 6;
    for (let i = 0; i < 4; i += 1) {
      const x0 = 270 + i * 45;
      ctx.beginPath();
      const a = projectGunPoint(gunDesignPoint(x0, 288, detailZ, group), f);
      const b = projectGunPoint(gunDesignPoint(x0 + 8, 340, detailZ, group), f);
      if (a && b) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // 顶部导轨刻线
    ctx.strokeStyle = 'rgba(180,210,230,0.28)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const x = 330 + i * 18;
      ctx.beginPath();
      const a = projectGunPoint(gunDesignPoint(x, 232, detailZ, group), f);
      const b = projectGunPoint(gunDesignPoint(x + 7, 248, detailZ, group), f);
      if (a && b) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // 全息镜片
    const lens = projectGunPoint(gunDesignPoint(372, 214, detailZ - 0.012, group), f);
    if (lens) {
      const lensR = clamp(f / Math.max(0.001, lens.z) * 0.00095 * 26, 8, 30);
      const lensGlow = ctx.createRadialGradient(lens.x, lens.y, 1, lens.x, lens.y, lensR * 2);
      lensGlow.addColorStop(0, 'rgba(230,255,255,0.95)');
      lensGlow.addColorStop(0.35, 'rgba(92,232,255,0.8)');
      lensGlow.addColorStop(1, 'rgba(92,232,255,0)');
      ctx.fillStyle = lensGlow;
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, lensR * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(10,30,40,0.9)';
      ctx.beginPath();
      ctx.ellipse(lens.x, lens.y, lensR, lensR * 0.78, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,248,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(240,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, Math.max(1.5, lensR * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }

    // 手套指节分割线
    ctx.strokeStyle = 'rgba(4,9,14,0.62)';
    ctx.lineWidth = 3;
    const gloveLines = [
      [276, 334, 388, 370],
      [268, 354, 382, 390],
      [664, 500, 742, 522],
      [656, 524, 736, 546],
      [650, 548, 726, 570],
    ];
    for (let i = 0; i < gloveLines.length; i += 1) {
      const line = gloveLines[i];
      const a = projectGunPoint(gunDesignPoint(line[0], line[1], detailZ - 0.04, group), f);
      const b = projectGunPoint(gunDesignPoint(line[2], line[3], detailZ - 0.04, group), f);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = rgba(accent, 0.3);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let ga = projectGunPoint(gunDesignPoint(690, 572, detailZ - 0.04, group), f);
    let gb = projectGunPoint(gunDesignPoint(755, 586, detailZ - 0.04, group), f);
    if (ga && gb) {
      ctx.moveTo(ga.x, ga.y);
      ctx.lineTo(gb.x, gb.y);
      ctx.stroke();
    }

    // 枪身铭牌
    const tag = projectGunPoint(gunDesignPoint(548, 410, detailZ, group), f);
    if (tag) {
      ctx.fillStyle = 'rgba(205,230,245,0.42)';
      ctx.font = '600 9px "Cascadia Mono", Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('VX-09 // 6.8', tag.x, tag.y);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // 枪口焰
    if (muzzleFlash > 0.02 && effects) {
      const mp = projectGunPoint(gunDesignPoint(4, 198, detailZ - 0.02, group), f);
      if (mp) {
        const flash = muzzleFlash;
        const radius = (26 + 46 * flash) * clamp(f / 780, 0.7, 1.4);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(mp.x, mp.y, 1, mp.x, mp.y, radius * 1.8);
        glow.addColorStop(0, 'rgba(255,255,235,' + (0.95 * flash) + ')');
        glow.addColorStop(0.22, 'rgba(255,214,128,' + (0.8 * flash) + ')');
        glow.addColorStop(0.58, 'rgba(255,129,38,' + (0.3 * flash) + ')');
        glow.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(mp.x, mp.y, radius * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,246,206,' + (0.92 * flash) + ')';
        for (let i = 0; i < 7; i += 1) {
          const a = (i / 7) * Math.PI * 2 + 0.25;
          const len = (i % 2 === 0 ? 58 : 34) * flash * clamp(f / 760, 0.8, 1.25);
          ctx.beginPath();
          ctx.moveTo(mp.x + Math.cos(a - 0.14) * 7, mp.y + Math.sin(a - 0.14) * 7);
          ctx.lineTo(mp.x + Math.cos(a) * len, mp.y + Math.sin(a) * len);
          ctx.lineTo(mp.x + Math.cos(a + 0.14) * 7, mp.y + Math.sin(a + 0.14) * 7);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  /* ── 朝向正确的 3D 第一人称步枪 ─────────────────────────────
     侧面轮廓位于 Y-Z 平面（枪口朝前 +Z），沿 X 轴挤出厚度；
     右手/左手作为独立小块叠在近侧，所有面统一做透视排序。 */
  const FGUN_SCALE = 0.001;
  const FGUN_SILHOUETTE = [
    [0, 177], [58, 190], [250, 237], [470, 306], [760, 382], [980, 430],
    [1005, 498], [742, 442], [710, 455], [700, 520], [680, 558], [610, 535],
    [600, 470], [590, 540], [512, 505], [500, 420], [452, 368], [212, 312],
    [20, 218], [0, 212],
  ];
  const FGUN_SIGHT_BASE = [[316, 226], [446, 254], [439, 276], [309, 248]];
  const FGUN_SIGHT = [[326, 180], [430, 204], [422, 252], [320, 228]];
  const FGUN_LEFT_GLOVE = [[246, 280], [376, 316], [428, 354], [405, 402], [332, 402], [248, 354], [229, 316]];
  const FGUN_RIGHT_GLOVE = [[648, 456], [738, 479], [782, 536], [762, 590], [692, 594], [642, 538], [626, 508]];
  const FGUN_WRIST = [[676, 548], [756, 568], [786, 646], [702, 654], [660, 600]];

  function fgunPoint(localX, designX, designY, group) {
    const z = (450 - designX) * FGUN_SCALE;
    const y = (300 - designY) * FGUN_SCALE;
    const cy = Math.cos(group.yaw);
    const sy = Math.sin(group.yaw);
    const x1 = localX * cy + z * sy;
    const z1 = -localX * sy + z * cy;
    const cp = Math.cos(group.pitch);
    const sp = Math.sin(group.pitch);
    const y1 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    return {
      x: group.x + x1,
      y: group.y + y1,
      z: group.z + z2,
    };
  }

  function fgunProject(p, f) {
    if (!p || p.z <= CAM_NEAR) return null;
    return {
      x: viewW / 2 + f * p.x / p.z,
      y: viewH / 2 - f * p.y / p.z,
      z: p.z,
    };
  }

  function fgunExtrude(part, group, f, faces) {
    const half = part.thickness / 2;
    const left = [];
    const right = [];
    for (let i = 0; i < part.pts.length; i += 1) {
      const p = part.pts[i];
      const lx = (part.xOff || 0) - half;
      const rx = (part.xOff || 0) + half;
      const lp = fgunPoint(lx, p[0], p[1], group);
      const rp = fgunPoint(rx, p[0], p[1], group);
      const lpp = fgunProject(lp, f);
      const rpp = fgunProject(rp, f);
      if (!lpp || !rpp) return;
      left.push({ wp: lp, sp: lpp });
      right.push({ wp: rp, sp: rpp });
    }
    const base = part.fill;
    const capColor = 'rgb(' + Math.min(255, base[0] + 16) + ',' + Math.min(255, base[1] + 16) + ',' + Math.min(255, base[2] + 16) + ')';
    const backColor = 'rgb(' + Math.round(base[0] * 0.52) + ',' + Math.round(base[1] * 0.52) + ',' + Math.round(base[2] * 0.52) + ')';
    const sideColor = 'rgb(' + Math.round(base[0] * 0.7) + ',' + Math.round(base[1] * 0.7) + ',' + Math.round(base[2] * 0.7) + ')';
    const edge = 'rgba(3,8,13,0.75)';
    function addFace(points, color, isCap) {
      let zsum = 0;
      for (let i = 0; i < points.length; i += 1) zsum += points[i].sp.z;
      faces.push({
        pts: points.map(function (p) { return p.sp; }),
        z: zsum / points.length,
        color: color,
        edge: edge,
        isCap: !!isCap,
        part: part.key,
      });
    }
    // 近侧（x 负方向）与远侧盖面
    addFace(left, capColor, true);
    addFace(right.slice().reverse(), backColor, false);
    // 轮廓边缘的厚度面
    for (let i = 0; i < left.length; i += 1) {
      const j = (i + 1) % left.length;
      addFace([left[i], left[j], right[j], right[i]], sideColor, false);
    }
  }

  function drawGunForward3D() {
    if (!ctx || !mode) return;
    const effects = effectsOn();
    const f = focalPx();
    const w = viewW;
    const h = viewH;
    const recoil = clamp(weaponKick, 0, 1);
    const baseZ = 1.45;
    const group = {
      x: (0.23 * w * baseZ) / f,
      y: -(0.28 * h * baseZ) / f,
      z: baseZ,
      yaw: -0.55,
      pitch: 0.015,
    };
    group.x += clamp(camTurnSpeedX * 2.0, -0.06, 0.06) + (effects ? Math.sin(weaponSwayT * 1.2) * 0.0025 : 0);
    group.y += clamp(-camTurnSpeedY * 1.3, -0.05, 0.05) + (effects ? Math.cos(weaponSwayT * 0.9) * 0.0018 : 0);
    group.y += recoil * 0.03;
    group.z -= recoil * 0.04;
    group.yaw -= recoil * 0.045;
    group.pitch += recoil * 0.025;

    const parts = [
      { key: 'body', pts: FGUN_SILHOUETTE, thickness: 0.095, xOff: 0, fill: [49, 62, 74] },
      { key: 'sightbase', pts: FGUN_SIGHT_BASE, thickness: 0.075, xOff: 0, fill: [32, 42, 52] },
      { key: 'sight', pts: FGUN_SIGHT, thickness: 0.06, xOff: 0, fill: [21, 30, 39] },
      { key: 'leftglove', pts: FGUN_LEFT_GLOVE, thickness: 0.115, xOff: -0.072, fill: [66, 81, 94] },
      { key: 'rightglove', pts: FGUN_RIGHT_GLOVE, thickness: 0.12, xOff: -0.07, fill: [63, 78, 91] },
      { key: 'wrist', pts: FGUN_WRIST, thickness: 0.11, xOff: -0.06, fill: [27, 35, 43] },
    ];
    const faces = [];
    for (let i = 0; i < parts.length; i += 1) fgunExtrude(parts[i], group, f, faces);
    faces.sort(function (a, b) { return b.z - a.z; });
    ctx.save();
    for (let i = 0; i < faces.length; i += 1) {
      const face = faces[i];
      ctx.beginPath();
      ctx.moveTo(face.pts[0].x, face.pts[0].y);
      for (let p = 1; p < face.pts.length; p += 1) ctx.lineTo(face.pts[p].x, face.pts[p].y);
      ctx.closePath();
      ctx.fillStyle = face.color;
      ctx.fill();
      ctx.strokeStyle = face.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (face.isCap) {
        ctx.strokeStyle = 'rgba(170,205,225,0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();

    // 近侧表面细节：霓虹线 / 散热孔 / 导轨刻线 / 镜片
    const detailX = -0.055;
    function dp(dx, dy) {
      return fgunProject(fgunPoint(detailX, dx, dy, group), f);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(accent, 0.78);
    ctx.lineWidth = 2;
    ctx.beginPath();
    let a = dp(480, 332);
    let b = dp(704, 392);
    if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    a = dp(480, 352);
    b = dp(690, 408);
    if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160,195,220,0.24)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      const x = 330 + i * 20;
      a = dp(x, 226);
      b = dp(x + 8, 246);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(3,8,12,0.85)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 4; i += 1) {
      const x = 268 + i * 45;
      a = dp(x, 282);
      b = dp(x + 9, 330);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    // 全息镜片
    const lens = dp(372, 210);
    if (lens) {
      const radius = clamp(f / Math.max(0.01, lens.z) * 0.001 * 24, 8, 26);
      const g = ctx.createRadialGradient(lens.x, lens.y, 1, lens.x, lens.y, radius * 2.3);
      g.addColorStop(0, 'rgba(235,255,255,0.98)');
      g.addColorStop(0.3, 'rgba(92,232,255,0.85)');
      g.addColorStop(1, 'rgba(92,232,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, radius * 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(4,15,21,0.92)';
      ctx.beginPath();
      ctx.ellipse(lens.x, lens.y, radius, radius * 0.74, -0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(170,250,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(240,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, Math.max(1.4, radius * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
    // 枪托上的型号字
    ctx.globalCompositeOperation = 'source-over';
    const tag = dp(880, 456);
    if (tag) {
      ctx.fillStyle = 'rgba(207,232,246,0.45)';
      ctx.font = '600 8px "Cascadia Mono", Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('VX-09 // 6.8', tag.x, tag.y);
    }
    // 手套指节
    ctx.strokeStyle = 'rgba(4,9,14,0.55)';
    ctx.lineWidth = 3;
    const linePairs = [
      [270, 332, 386, 368],
      [264, 352, 376, 388],
      [664, 500, 744, 522],
      [656, 524, 736, 548],
    ];
    for (let i = 0; i < linePairs.length; i += 1) {
      const l = linePairs[i];
      const p1 = dp(l[0], l[1]);
      const p2 = dp(l[2], l[3]);
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 枪口焰
    if (muzzleFlash > 0.02 && effects) {
      const mp = fgunProject(fgunPoint(-0.08, 2, 194, group), f);
      if (mp) {
        const flash = muzzleFlash;
        const radius = (24 + 44 * flash) * clamp(f / 780, 0.72, 1.3);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(mp.x, mp.y, 1, mp.x, mp.y, radius * 1.9);
        glow.addColorStop(0, 'rgba(255,255,236,' + (0.95 * flash) + ')');
        glow.addColorStop(0.22, 'rgba(255,215,130,' + (0.82 * flash) + ')');
        glow.addColorStop(0.58, 'rgba(255,128,36,' + (0.32 * flash) + ')');
        glow.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(mp.x, mp.y, radius * 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,246,208,' + (0.94 * flash) + ')';
        for (let i = 0; i < 7; i += 1) {
          const angle = (i / 7) * Math.PI * 2 + 0.22;
          const len = (i % 2 === 0 ? 54 : 32) * flash * clamp(f / 760, 0.8, 1.22);
          ctx.beginPath();
          ctx.moveTo(mp.x + Math.cos(angle - 0.15) * 7, mp.y + Math.sin(angle - 0.15) * 7);
          ctx.lineTo(mp.x + Math.cos(angle) * len, mp.y + Math.sin(angle) * len);
          ctx.lineTo(mp.x + Math.cos(angle + 0.15) * 7, mp.y + Math.sin(angle + 0.15) * 7);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  /* ==========================================================================
   * 13 · 调试 API（?test=1 时由 main.js 暴露）
   * ====================================================================== */

  function debugSnapshotTargets() {
    const list = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const sc = targetScreen(t);
      list.push({
        x: round1(sc.x),
        y: round1(sc.y),
        r: round1(sc.r),
        id: t.id,
        lx: round1(t.x),
        ly: round1(t.y),
        visible: t.visible3d !== false,
      });
    }
    return list;
  }

  function debugSkipCountdown() {
    if (phase === 'countdown') {
      enterPlaying();
      return true;
    }
    if (phase === 'paused' && pausedFrom === 'countdown') {
      phase = 'countdown';
      pausedFrom = 'playing';
      enterPlaying();
      return true;
    }
    return false;
  }

  function debugShootAt(x, y) {
    if (phase === 'countdown') debugSkipCountdown();
    if (phase !== 'playing') return false;
    if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) {
      aim.x = clamp(x, 0, viewW);
      aim.y = clamp(y, 0, viewH);
    }
    return shoot();
  }

  function debugShootTarget(index) {
    if (phase === 'countdown') debugSkipCountdown();
    if (phase !== 'playing') return false;
    const i = (typeof index === 'number' && isFinite(index)) ? Math.floor(index) : 0;
    const target = targets[clamp(i, 0, targets.length - 1)];
    if (!target) return false;
    const tx = Number.isFinite(target.sx) ? target.sx : target.x;
    const ty = Number.isFinite(target.sy) ? target.sy : target.y;
    aim.x = tx;
    aim.y = ty;
    return shoot();
  }

  function debugMissShot() {
    if (phase === 'countdown') debugSkipCountdown();
    if (phase !== 'playing' || !mode || mode.id === 'tracking') return false;
    const safe = getSafe();
    let best = { x: safe.cx, y: safe.cy };
    let bestGap = -Infinity;
    for (let attempt = 0; attempt < 60; attempt++) {
      const point = {
        x: rand(safe.x + 8, safe.x + safe.w - 8),
        y: rand(safe.y + 8, safe.y + safe.h - 8),
      };
      let minGap = Infinity;
      for (let i = 0; i < targets.length; i++) {
        const gap = distance(point.x, point.y, targets[i].x, targets[i].y) - targets[i].r - HIT_TOLERANCE;
        if (gap < minGap) minGap = gap;
      }
      if (minGap > bestGap) {
        bestGap = minGap;
        best = point;
      }
      if (minGap > 40) break;
    }
    aim.x = best.x;
    aim.y = best.y;
    const missBefore = misses;
    shoot();
    return misses > missBefore;
  }

  function debugEndNow() {
    if (phase === 'idle' || phase === 'over') return false;
    return finishRun();
  }

  function debugSetTimeLeft(seconds) {
    if (phase === 'idle' || phase === 'over') return false;
    const value = Number(seconds);
    if (!isFinite(value)) return false;
    elapsed = clamp(duration - value, 0, duration);
    if (phase === 'playing' && elapsed >= duration) {
      finishRun();
      return true;
    }
    flushHud();
    return true;
  }

  function debugSpawn() {
    if (phase === 'countdown') debugSkipCountdown();
    if (phase !== 'playing') return debugSnapshotTargets();
    ensureTargets();
    return debugSnapshotTargets();
  }

  function debugSetAim(x, y) {
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return false;
    aim.x = clamp(x, 0, viewW);
    aim.y = clamp(y, 0, viewH);
    return true;
  }

  function debugAdvance(seconds) {
    if (phase === 'countdown') debugSkipCountdown();
    if (phase !== 'playing') return false;
    let left = clamp(Number(seconds) || 0, 0, 120);
    while (left > 0 && phase === 'playing') {
      const step = Math.min(MAX_DT, left);
      updatePlaying(step);
      left -= step;
    }
    return true;
  }

  function debug() {
    const trackingMode = !!(mode && mode.id === 'tracking');
    return {
      phase: phase,
      modeId: modeId,
      score: Math.round(scoreF),
      accuracy: round1(computeAccuracy()),
      hits: trackingMode ? round1(onTargetTime) : hits,
      shots: trackingMode ? 0 : shots,
      misses: trackingMode ? round1(offTargetTime) : misses,
      elapsed: round2(elapsed),
      timeLeft: round2(timeLeftValue()),
      aim: { x: round1(aim.x), y: round1(aim.y) },
      targets: debugSnapshotTargets(),
      combo: combo,
      multiplier: round2(multiplier()),
      bestCombo: bestCombo,
      tracking: trackingMode,
      aimMode: effectiveAimMode(),
      pointerLocked: pointerLocked,
      skipCountdown: debugSkipCountdown,
      shootAt: debugShootAt,
      shootTarget: debugShootTarget,
      missShot: debugMissShot,
      endNow: debugEndNow,
      setTimeLeft: debugSetTimeLeft,
      spawn: debugSpawn,
      setAim: debugSetAim,
      advance: debugAdvance,
      setCamera: function (yaw, pitch) {
        const y = Number(yaw);
        const p = Number(pitch);
        if (isFinite(y)) camYaw = clamp(y, -CAM_YAW_LIMIT, CAM_YAW_LIMIT);
        if (isFinite(p)) camPitch = clamp(p, -CAM_PITCH_LIMIT, CAM_PITCH_LIMIT);
        if (requestedAimMode === 'relative') {
          aim.x = viewW / 2;
          aim.y = viewH / 2;
        }
        refreshTargetScreens();
        return true;
      },
      camera: { yaw: camYaw, pitch: camPitch },
      pause: pause,
      resume: resume,
      togglePause: togglePause,
    };
  }

  /* ==========================================================================
   * 14 · 公开 API
   * ====================================================================== */

  return {
    init: init,
    start: start,
    pause: pause,
    resume: resume,
    restart: restart,
    quit: quit,
    togglePause: togglePause,
    isActive: isActive,
    getPhase: getPhase,
    getMode: getMode,
    debug: debug,
  };
})();
