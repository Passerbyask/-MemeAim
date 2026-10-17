/* ==========================================================================
   MEMEAIM 3D-DEEPSEEK · Boot
   负责 Store / UI / Game / MemeFX 的组装接线，不承载具体游戏或界面逻辑。
   ========================================================================== */
(function () {
  'use strict';

  var TEST_MODE = /(?:\?|&)test=1(?:&|$)/.test(window.location.search);

  function boot() {
    var canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    // ── 1. 本地数据 ──────────────────────────────────────────────
    Store.init();
    AudioFX.setEnabled(Store.settings.audio.enabled !== false);
    AudioFX.setVolume(Store.settings.audio.volume);

    if (TEST_MODE) {
      // 自动化测试：强制绝对瞄准，避免 headless 环境 pointer lock 的不确定性。
      // 只改内存，不写回 localStorage。
      Store.settings.aimMode = 'absolute';
      document.documentElement.classList.add('test-mode');
      document.documentElement.setAttribute('data-test', '1');
    }

    // ── 2. UI handlers（UI 只能通过这些入口驱动游戏） ──────────
    var handlers = {
      startMode: function (id) {
        AudioFX.unlock();
        MemeFX.clear();
        Game.start(id);
      },
      quickStart: function () {
        AudioFX.unlock();
        var last = Store.settings.lastMode || 'gridshot';
        var mode = Store.mode(last) ? last : 'gridshot';
        MemeFX.clear();
        Game.start(mode);
      },
      retry: function () {
        AudioFX.unlock();
        MemeFX.clear();
        Game.restart();
      },
      exitToMenu: function () {
        Game.quit();
        MemeFX.clear();
      },
      resume: function () {
        AudioFX.unlock();
        Game.resume();
      },
      restart: function () {
        AudioFX.unlock();
        MemeFX.clear();
        Game.restart();
      },
      quit: function () {
        Game.quit();
        MemeFX.clear();
      },
      pause: function () {
        Game.togglePause();
      },
    };

    // ── 3. Game hooks（游戏只通过 hooks 通知 UI） ────────────────
    var hudPrev = { modeId: '', hits: 0, misses: 0, shots: 0, score: 0, streak: 0, tracking: false };
    var soundHintShown = false;

    // 程序化 SVG 枪模的开火反馈（纯 DOM/WAAPI，无外部模型）
    var weaponView = document.getElementById('weapon-view');
    var weaponFlash = weaponView ? weaponView.querySelector('.weapon-flash') : null;
    var weaponAnim = null;
    var weaponFlashAnim = null;

    function fireWeaponVisual() {
      if (!weaponView || !document.getElementById('screen-game')) return;
      var screen = document.getElementById('screen-game');
      if (!screen || !screen.classList.contains('active')) return;
      try {
        if (weaponAnim) weaponAnim.cancel();
        if (weaponFlashAnim) weaponFlashAnim.cancel();
        weaponAnim = weaponView.animate(
          [
            { transform: 'translate3d(0,0,0) rotate(0deg)' },
            { transform: 'translate3d(7px,16px,0) rotate(1.15deg)' },
            { transform: 'translate3d(0,0,0) rotate(0deg)' },
          ],
          { duration: 175, easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)' }
        );
        if (weaponFlash) {
          weaponFlashAnim = weaponFlash.animate(
            [
              { opacity: 0, transform: 'scale(0.35) rotate(-8deg)' },
              { opacity: 1, transform: 'scale(1.02) rotate(2deg)' },
              { opacity: 0, transform: 'scale(1.28) rotate(8deg)' },
            ],
            { duration: 145, easing: 'ease-out' }
          );
        }
      } catch (error) {
        /* WAAPI 不可用时保持静态枪模 */
      }
    }

    function resetHudPrev(mode) {
      hudPrev.modeId = mode && mode.id ? mode.id : '';
      hudPrev.hits = 0;
      hudPrev.misses = 0;
      hudPrev.shots = 0;
      hudPrev.score = 0;
      hudPrev.streak = 0;
      hudPrev.tracking = !!(mode && mode.id === 'tracking');
    }

    function feedMeme(hud) {
      if (!hud || typeof MemeFX === 'undefined') return;
      if (hud.modeId !== hudPrev.modeId) {
        resetHudPrev({ id: hud.modeId });
      }
      var tracking = !!hud.tracking;
      if (tracking) {
        var scoreDelta = Math.max(0, Math.round(hud.score) - Math.round(hudPrev.score));
        if (scoreDelta > 0) MemeFX.onTrackingTick({ scoreDelta: scoreDelta, modeId: hud.modeId });
        var tier = Math.floor((Number(hud.streak) || 0) / 5);
        var prevTier = Math.floor((Number(hudPrev.streak) || 0) / 5);
        if (tier > prevTier) MemeFX.onCombo(tier * 5);
      } else {
        var hits = Math.max(0, Math.round(Number(hud.hits) || 0));
        var misses = Math.max(0, Math.round(Number(hud.misses) || 0));
        var shots = Math.max(0, Math.round(Number(hud.shots) || 0));
        var shotDelta = Math.max(0, shots - hudPrev.shots);
        if (shotDelta > 0) fireWeaponVisual();
        var hitDelta = Math.max(0, hits - hudPrev.hits);
        var missDelta = Math.max(0, misses - hudPrev.misses);
        var maxEvents = 4;
        for (var i = 0; i < hitDelta && i < maxEvents; i += 1) {
          MemeFX.onHit({
            combo: Number(hud.streak) || 0,
            tracking: false,
            modeId: hud.modeId,
            accuracy: hud.accuracy,
          });
        }
        for (var m = 0; m < missDelta && m < maxEvents; m += 1) {
          MemeFX.onMiss({ modeId: hud.modeId, tracking: false });
        }
      }
      hudPrev.modeId = hud.modeId;
      hudPrev.hits = Math.max(0, Math.round(Number(hud.hits) || 0));
      hudPrev.misses = Math.max(0, Math.round(Number(hud.misses) || 0));
      hudPrev.shots = Math.max(0, Math.round(Number(hud.shots) || 0));
      hudPrev.score = Math.max(0, Math.round(Number(hud.score) || 0));
      hudPrev.streak = Number(hud.streak) || 0;
      hudPrev.tracking = tracking;
    }

    var hooks = {
      onGameStart: function (mode) {
        UI.showGame(mode);
        resetHudPrev(mode);
        if (typeof MemeFX !== 'undefined') MemeFX.onRoundStart();
        // 默认静音是刻意设计：只在第一次开局提醒一次，不打断手感。
        if (!soundHintShown && Store.settings.audio.enabled === false) {
          soundHintShown = true;
          window.setTimeout(function () {
            UI.toast('音效默认关闭 · 按 M 或点右上角喇叭开启', 'info');
          }, 650);
        }
      },
      onHud: function (hud) {
        UI.updateHud(hud);
        try {
          feedMeme(hud);
        } catch (error) {
          // 节目效果不能影响训练主流程。
          if (window.console && console.warn) console.warn('[AIMLAB] meme fx skipped:', error);
        }
      },
      onCountdown: function (value, label) {
        UI.setCountdown(value, label);
        if (value === 'GO' && typeof MemeFX !== 'undefined') MemeFX.onGo();
      },
      onPauseChange: function (paused, info) {
        if (paused) {
          UI.showPause(info || {});
          if (typeof MemeFX !== 'undefined') MemeFX.suspend();
        } else {
          UI.hidePause();
        }
      },
      onGameEnd: function (summary) {
        UI.showResults(summary);
        if (typeof MemeFX !== 'undefined') {
          window.setTimeout(function () {
            try {
              MemeFX.onFinish(summary);
            } catch (error) {
              if (window.console && console.warn) console.warn('[AIMLAB] meme finish skipped:', error);
            }
          }, 90);
        }
      },
      onToast: function (message, type) {
        UI.toast(message, type || 'info');
      },
    };

    // ── 4. 初始化 ────────────────────────────────────────────────
    UI.init(handlers);
    Game.init(canvas, hooks);
    if (typeof MemeFX !== 'undefined') MemeFX.init();
    if (typeof MemeUI !== 'undefined') MemeUI.init(handlers);
    UI.showMenu();
    UI.refreshMenu();
    setupHdrCapability();

    // ── 5. 首次用户手势时解锁音频（浏览器自动播放策略） ─────────
    var unlockOnce = function () {
      AudioFX.unlock();
      if (typeof MemeFX !== 'undefined') MemeFX.init();
      document.removeEventListener('pointerdown', unlockOnce, true);
      document.removeEventListener('keydown', unlockOnce, true);
    };
    document.addEventListener('pointerdown', unlockOnce, true);
    document.addEventListener('keydown', unlockOnce, true);

    // ── 6. 测试接口（仅 ?test=1 暴露） ──────────────────────────
    if (TEST_MODE) {
      window.__AIMLAB__ = {
        Store: Store,
        Game: Game,
        UI: UI,
        AudioFX: AudioFX,
        Crosshair: Crosshair,
        MemeFX: MemeFX,
        MemeUI: MemeUI,
      };
      window.__AIMLAB_TEST__ = {
        state: function () {
          return Game.debug();
        },
        start: function (modeId) {
          Game.start(modeId);
        },
        skipCountdown: function () {
          return Game.debug().skipCountdown();
        },
        shootAt: function (x, y) {
          return Game.debug().shootAt(x, y);
        },
        shootTarget: function (index) {
          return Game.debug().shootTarget(index);
        },
        missShot: function () {
          return Game.debug().missShot();
        },
        endNow: function () {
          return Game.debug().endNow();
        },
        setTimeLeft: function (seconds) {
          return Game.debug().setTimeLeft(seconds);
        },
        spawn: function () {
          return Game.debug().spawn();
        },
        toMenu: function () {
          Game.quit();
          MemeFX.clear();
        },
        meme: function () {
          return MemeFX.debug();
        },
        previewMeme: function (kind) {
          MemeFX.preview(kind);
        },
      };
    }
  }

  // HDR / 广色域能力检测：Canvas 2D 不能保证输出真 HDR 亮度，
  // 但浏览器支持时可用 Display-P3 色彩和峰值高光增强，并显示 HDR 标记。
  function setupHdrCapability() {
    var root = document.documentElement;
    var mq = window.matchMedia ? window.matchMedia('(dynamic-range: high)') : null;
    var p3 = !!(window.CSS && window.CSS.supports && window.CSS.supports('color', 'color(display-p3 1 0 0)'));
    function apply() {
      // 只有系统/显示器声明高动态范围、且设置里的 HDR 开关打开时才增强；
      // 不支持或用户关闭时完全走普通渲染，不加滤镜、不改配色、不显示标记。
      var hdr = !!(mq && mq.matches);
      var pref = true;
      try {
        if (typeof Store !== 'undefined' && Store.settings) pref = Store.settings.hdr !== false;
      } catch (err) { /* 设置未就绪时按开启处理 */ }
      var enabled = hdr && pref;
      var hdrP3 = enabled && p3;
      root.classList.toggle('hdr-display', enabled);
      root.classList.toggle('p3-display', hdrP3);
      var chip = document.getElementById('hdr-chip');
      if (!chip) return;
      if (!enabled) {
        chip.textContent = '';
        chip.title = '';
        chip.hidden = true;
        return;
      }
      chip.textContent = hdrP3 ? 'HDR · P3' : 'HDR';
      chip.title = hdrP3
        ? '已检测到 HDR 显示与 Display-P3，高光增强已启用'
        : '已检测到 HDR 显示，高光增强已启用';
      chip.hidden = false;
    }
    apply();
    if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', apply);
    document.addEventListener('aimlab:hdr-change', apply);
  }

  function showBootError(error) {
    // 极简兜底：避免模块缺失时用户只看到一片黑屏。
    var shell = document.createElement('div');
    shell.setAttribute('role', 'alert');
    shell.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:32px;' +
      'background:#040810;color:#e9f4ff;font-family:"Segoe UI","Microsoft YaHei UI",sans-serif;z-index:9999;text-align:center';
    shell.innerHTML =
      '<div><div style="font-size:11px;letter-spacing:.24em;color:#2ce8ff;margin-bottom:12px">MEMEAIM 3D-DEEPSEEK</div>' +
      '<h1 style="font-size:22px;margin:0 0 10px">启动失败</h1>' +
      '<p style="font-size:13px;color:#8ba2bd;margin:0">请刷新页面重试。如果问题持续存在，请确认文件完整。</p></div>';
    document.body.appendChild(shell);
    if (window.console && console.error) console.error('[AIMLAB] Boot failed:', error);
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  } catch (error) {
    showBootError(error);
  }
})();
