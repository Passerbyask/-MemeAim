/* ==========================================================================
   AIMLAB WEB · MemeFX
   节目效果层：梗音效 / 绿幕飞行梗 / 表情包 / 全屏特效（视频 + 程序动画）
   素材来源：Passerbyask/-MemeAim（音效/绿幕视频）、Twemoji（CC-BY 4.0）、
   额外免费素材（见 outputs/README.md 与 assets-extra manifest）。
   独立 localStorage key，不影响 AIMLAB 主成绩系统。
   ========================================================================== */
const MemeFX = (() => {
  'use strict';

  const STORAGE_KEY = 'aimlab.web.meme.v1';
  const DEFAULTS = {
    version: 1,
    enabled: true,
    sounds: true,           // 是否播放梗音效；实际出声仍受全局静音 / 音量控制
    floating: true,
    fullscreen: true,
    emoji: true,
    volume: 0.8,
    intensity: 'standard',
    disabledSounds: [],
    disabledFloating: [],
    disabledScreens: [],
  };

  const INTENSITY = {
    chill: { soundChance: 0.38, floatChance: 0.16, screenChance: 0.035, emojiChance: 0.3, soundGap: 380, floatGap: 4600, screenGap: 13000, emojiGap: 520 },
    standard: { soundChance: 0.72, floatChance: 0.4, screenChance: 0.11, emojiChance: 0.78, soundGap: 210, floatGap: 1900, screenGap: 6800, emojiGap: 190 },
    chaos: { soundChance: 1, floatChance: 0.78, screenChance: 0.34, emojiChance: 1, soundGap: 80, floatGap: 760, screenGap: 2600, emojiGap: 55 },
  };

  // ── 素材目录 ─────────────────────────────────────────────────────────────
  const HIT_BASE = [
    { id: 'hit-anime-wow', name: '动漫 Wow', file: 'audio/hit/anime-wow-sound-effect.mp3', origin: 'MemeAim' },
    { id: 'hit-augh', name: '狼嚎惨叫', file: 'audio/hit/aughhhhh-aughhhhh.mp3', origin: 'MemeAim' },
    { id: 'hit-camera', name: '相机闪光', file: 'audio/hit/camera-flash-sound-effect.mp3', origin: 'MemeAim' },
    { id: 'hit-headshot', name: 'CS 爆头', file: 'audio/hit/cs-go-headshot-sound.mp3', origin: 'MemeAim' },
    { id: 'hit-ding2', name: '清脆叮', file: 'audio/hit/ding-sound-effect_2.mp3', origin: 'MemeAim' },
    { id: 'hit-faaah', name: 'Faaah!', file: 'audio/hit/faaah.mp3', origin: 'MemeAim' },
    { id: 'hit-gang', name: '咣当落地', file: 'audio/hit/gang-guan-luo-di.mp3', origin: 'MemeAim' },
    { id: 'hit-gunshot', name: '枪声 Budden', file: 'audio/hit/gunshotjbudden.mp3', origin: 'MemeAim' },
    { id: 'hit-mambo', name: '神秘歌谣', file: 'audio/hit/mamboman-bo-shi-ge-ju-matikanetannhauser.mp3', origin: 'MemeAim' },
    { id: 'hit-notification', name: '通知音', file: 'audio/hit/notification_o14egLP.mp3', origin: 'MemeAim' },
    { id: 'hit-prowler', name: '潜行者', file: 'audio/hit/prowler-sound-effect_6bXErot.mp3', origin: 'MemeAim' },
    { id: 'hit-shotgun', name: '霰弹枪', file: 'audio/hit/pump-shotgun-fortnite-loud.mp3', origin: 'MemeAim' },
    { id: 'hit-camera-old', name: '老相机', file: 'audio/hit/zvuk-fotoapparata.mp3', origin: 'MemeAim' },
    { id: 'hit-ding-cn', name: '叮！', file: 'audio/hit/叮.mp3', origin: 'MemeAim' },
    { id: 'hit-sigh', name: '叹气', file: 'audio/hit/叹.mp3', origin: 'MemeAim' },
    { id: 'hit-duck', name: '鸭叫', file: 'audio/hit/鸭子叫.mp3', origin: 'MemeAim' },
    { id: 'synth-airhorn', name: '空气喇叭', synth: 'airhorn', origin: '实时合成' },
    { id: 'synth-vineboom', name: 'Vine Boom', synth: 'vineboom', origin: '实时合成' },
    { id: 'synth-scratch', name: '唱片刮擦', synth: 'scratch', origin: '实时合成' },
    { id: 'synth-boing', name: '卡通 Boing', synth: 'boing', origin: '实时合成' },
    { id: 'synth-whistle', name: '滑哨', synth: 'whistle', origin: '实时合成' },
    { id: 'synth-ding', name: '高音叮', synth: 'ding', origin: '实时合成' },
    { id: 'synth-sparkle', name: '闪耀琶音', synth: 'sparkle', origin: '实时合成' },
    { id: 'synth-crowd', name: '欢呼声', synth: 'crowd', origin: '实时合成' },
  ];

  const MISS_BASE = [
    { id: 'miss-fahh', name: 'Fahhhhh', file: 'audio/miss/actually-good-fahhhh-sfx.mp3', origin: 'MemeAim' },
    { id: 'miss-fart', name: '放屁', file: 'audio/miss/fart-meme-sound.mp3', origin: 'MemeAim' },
    { id: 'miss-fart-reverb', name: '混响屁', file: 'audio/miss/fart-with-reverb.mp3', origin: 'MemeAim' },
    { id: 'miss-huh', name: '疑惑 Huh?', file: 'audio/miss/huh_37bAoRo.mp3', origin: 'MemeAim' },
    { id: 'miss-plankton', name: '痞老板惨叫', file: 'audio/miss/plankton-augh.mp3', origin: 'MemeAim' },
    { id: 'miss-preview', name: '怪声', file: 'audio/miss/preview_4.mp3', origin: 'MemeAim' },
    { id: 'miss-rizzbot', name: '机笑', file: 'audio/miss/rizzbot-laugh.mp3', origin: 'MemeAim' },
    { id: 'miss-wawa', name: '哇哇哇', file: 'audio/miss/wawawawaaaaa.mp3', origin: 'MemeAim' },
    { id: 'miss-buzzer', name: '错误蜂鸣', file: 'audio/miss/wrong-answer-buzzer.mp3', origin: 'MemeAim' },
    { id: 'synth-trombone', name: '悲伤长号', synth: 'trombone', origin: '实时合成' },
    { id: 'synth-failbuzz', name: '失败蜂鸣', synth: 'buzz', origin: '实时合成' },
    { id: 'synth-womp', name: 'Womp Womp', synth: 'womp', origin: '实时合成' },
    { id: 'synth-rewind', name: '倒带', synth: 'rewind', origin: '实时合成' },
    { id: 'synth-boo', name: '嘘声', synth: 'boo', origin: '实时合成' },
  ];

  const FLOATING_BASE = [
    { id: 'thug-life', name: '墨镜装酷', file: 'video/floating/thug-life.mp4', groups: ['hit'] },
    { id: 'gwenchana', name: 'Gwenchana', file: 'video/floating/gwenchana.mp4', groups: ['hit', 'miss'] },
    { id: 'roll-safe', name: '指头笑', file: 'video/floating/roll-safe.mp4', groups: ['hit'] },
    { id: 'wow', name: 'Wow！', file: 'video/floating/wow.mp4', groups: ['hit'] },
    { id: 'cheer', name: '欢呼哥', file: 'video/floating/cheer.mp4', groups: ['hit'] },
    { id: 'dance', name: '突然起舞', file: 'video/floating/dance.mp4', groups: ['hit'] },
    { id: 'dog', name: '狗狗蹦迪', file: 'video/floating/dog.mp4', groups: ['hit'] },
    { id: 'laugh', name: '暗中狂笑', file: 'video/floating/laugh.mp4', groups: ['hit'] },
    { id: 'continued', name: '未完待续', file: 'video/floating/continued.mp4', groups: ['miss'] },
    { id: 'confused', name: '问号脸', file: 'video/floating/confused.mp4', groups: ['miss'] },
    { id: 'crying', name: '哭脸', file: 'video/floating/crying.mp4', groups: ['miss'] },
    { id: 'jameson', name: '老板大笑', file: 'video/floating/jameson.mp4', groups: ['miss'] },
    { id: 'troll', name: '滑稽脸', file: 'video/floating/troll.mp4', groups: ['miss'] },
    { id: 'lol', name: '笑到旋转', file: 'video/floating/lol.mp4', groups: ['miss'] },
    { id: 'sweat', name: '汗流浃背', file: 'video/floating/sweat.mp4', groups: ['miss'] },
    { id: 'explosion-float', name: '突然爆炸', file: 'video/floating/explosion.mp4', groups: ['hit', 'miss'], blast: true },
    { id: 'fireworks-float', name: '放个烟花', file: 'video/floating/fireworks.mp4', groups: ['hit', 'miss'], blast: true },
    { id: 'dragon-float', name: '神龙爆燃', file: 'video/floating/chinese-dragon.mp4', groups: ['hit', 'miss'], blast: true },
  ];

  const SCREEN_BASE = [
    { id: 'screen-fireworks', name: '烟花绽放', kind: 'video', file: 'video/screen/screen-fireworks.mp4', key: 'green', origin: 'MemeAim' },
    { id: 'screen-fire', name: '卡通烈焰', kind: 'video', file: 'video/screen/screen-fire.mp4', key: 'green', origin: 'MemeAim' },
    { id: 'screen-explosion', name: '火球爆炸', kind: 'video', file: 'video/screen/screen-explosion.mp4', key: 'green', origin: 'MemeAim' },
    { id: 'screen-blast', name: '浓烟爆炸', kind: 'video', file: 'video/screen/screen-blast.mp4', key: 'green', origin: 'MemeAim' },
    { id: 'screen-sparkles', name: '连续星火', kind: 'video', file: 'video/screen/screen-sparkles.mp4', key: 'green', origin: 'MemeAim' },
    { id: 'screen-dragon', name: '神龙爆燃·全屏', kind: 'video', file: 'video/floating/chinese-dragon.mp4', key: 'green', origin: 'MemeAim' },
    { id: 'proc-fireworks', name: '程序·烟花秀', kind: 'proc', proc: 'fireworks', origin: '实时绘制' },
    { id: 'proc-fire', name: '程序·烈焰升腾', kind: 'proc', proc: 'fire', origin: '实时绘制' },
    { id: 'proc-explosion', name: '程序·爆裂冲击', kind: 'proc', proc: 'explosion', origin: '实时绘制' },
    { id: 'proc-shockwave', name: '程序·冲击波', kind: 'proc', proc: 'shockwave', origin: '实时绘制' },
    { id: 'proc-meteors', name: '程序·流星雨', kind: 'proc', proc: 'meteors', origin: '实时绘制' },
    { id: 'proc-confetti', name: '程序·彩带礼花', kind: 'proc', proc: 'confetti', origin: '实时绘制' },
    { id: 'proc-glitch', name: '程序·信号故障', kind: 'proc', proc: 'glitch', origin: '实时绘制' },
    { id: 'proc-lightning', name: '程序·雷电风暴', kind: 'proc', proc: 'lightning', origin: '实时绘制' },
    { id: 'proc-hearts', name: '程序·爱心暴击', kind: 'proc', proc: 'hearts', origin: '实时绘制' },
    { id: 'proc-comic', name: '程序·大字暴击', kind: 'proc', proc: 'comic', origin: '实时绘制' },
    { id: 'proc-emoji-rain', name: '表情包暴雨', kind: 'proc', proc: 'emoji-rain', origin: 'Twemoji' },
  ];

  const EMOJI_BASE = [
    { file: 'emoji/1f602.svg', ch: '😂', name: '笑哭' },
    { file: 'emoji/1f923.svg', ch: '🤣', name: '笑翻' },
    { file: 'emoji/1f480.svg', ch: '💀', name: '骷髅' },
    { file: 'emoji/1f62d.svg', ch: '😭', name: '大哭' },
    { file: 'emoji/1f921.svg', ch: '🤡', name: '小丑' },
    { file: 'emoji/1f621.svg', ch: '😡', name: '暴怒' },
    { file: 'emoji/1f974.svg', ch: '🥴', name: '晕乎' },
    { file: 'emoji/1f631.svg', ch: '😱', name: '尖叫' },
    { file: 'emoji/1f914.svg', ch: '🤔', name: '思考' },
    { file: 'emoji/1f440.svg', ch: '👀', name: '围观' },
    { file: 'emoji/1f525.svg', ch: '🔥', name: '火焰' },
    { file: 'emoji/1f4a5.svg', ch: '💥', name: '爆炸' },
    { file: 'emoji/2728.svg', ch: '✨', name: '闪光' },
    { file: 'emoji/1f386.svg', ch: '🎆', name: '烟花' },
    { file: 'emoji/1f387.svg', ch: '🎇', name: '仙女棒' },
    { file: 'emoji/1f680.svg', ch: '🚀', name: '火箭' },
    { file: 'emoji/1f409.svg', ch: '🐉', name: '龙' },
    { file: 'emoji/1f986.svg', ch: '🦆', name: '鸭' },
    { file: 'emoji/1f47d.svg', ch: '👽', name: '外星人' },
    { file: 'emoji/1f916.svg', ch: '🤖', name: '机器人' },
    { file: 'emoji/1f37f.svg', ch: '🍿', name: '爆米花' },
    { file: 'emoji/1f3af.svg', ch: '🎯', name: '靶心' },
    { file: 'emoji/1f4af.svg', ch: '💯', name: '满分' },
    { file: 'emoji/1f44f.svg', ch: '👏', name: '鼓掌' },
    { file: 'emoji/1f64f.svg', ch: '🙏', name: '拜托' },
    { file: 'emoji/1f60e.svg', ch: '😎', name: '墨镜' },
    { file: 'emoji/1f92f.svg', ch: '🤯', name: '脑爆' },
    { file: 'emoji/1f973.svg', ch: '🥳', name: '派对' },
    { file: 'emoji/1fae0.svg', ch: '🫠', name: '融化' },
  ];

  // ── 小工具 ───────────────────────────────────────────────────────────────
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  function clone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (error) {
      return Object.assign({}, obj);
    }
  }

  function uniqueBy(arr, key) {
    const seen = Object.create(null);
    return arr.filter((item) => {
      const id = item[key];
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function getExtras() {
    const extra = typeof window !== 'undefined' ? window.__MEME_EXTRA__ : null;
    return extra && typeof extra === 'object' ? extra : {};
  }

  function extraSounds(group) {
    const extra = getExtras();
    const list = extra.sounds && Array.isArray(extra.sounds[group]) ? extra.sounds[group] : [];
    return list.map((item) => Object.assign({ origin: '免费素材' }, item));
  }

  function extraFloating() {
    const extra = getExtras();
    const list = extra.videos && Array.isArray(extra.videos.floating) ? extra.videos.floating : [];
    return list.map((item) => Object.assign({ groups: ['hit', 'miss'], key: 'green' }, item));
  }

  function extraScreens() {
    const extra = getExtras();
    const list = extra.videos && Array.isArray(extra.videos.screen) ? extra.videos.screen : [];
    return list.map((item) => Object.assign({ kind: 'video', key: 'green', origin: '免费素材' }, item));
  }

  function extraEmojis() {
    const extra = getExtras();
    const list = extra.emojis && Array.isArray(extra.emojis) ? extra.emojis : [];
    return list;
  }

  function catalog() {
    const hitSounds = uniqueBy(HIT_BASE.concat(extraSounds('hit')), 'id');
    const missSounds = uniqueBy(MISS_BASE.concat(extraSounds('miss')), 'id');
    const floating = uniqueBy(FLOATING_BASE.concat(extraFloating()), 'id');
    const screens = uniqueBy(SCREEN_BASE.concat(extraScreens()), 'id');
    const emojis = uniqueBy(EMOJI_BASE.concat(extraEmojis()), 'file');
    return { hitSounds, missSounds, floating, screens, emojis };
  }

  function assetUrl(file) {
    if (!file) return '';
    const map = typeof window !== 'undefined' ? window.__MEME_ASSETS__ : null;
    if (map && map[file]) return map[file];
    return 'assets/' + encodeURI(String(file)).replace(/#/g, '%23');
  }

  // ── 设置 ────────────────────────────────────────────────────────────────
  function sanitizeSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const validIntensity = ['chill', 'standard', 'chaos'];
    return {
      version: 1,
      enabled: src.enabled !== false,
      sounds: src.sounds !== false,
      floating: src.floating !== false,
      fullscreen: src.fullscreen !== false,
      emoji: src.emoji !== false,
      volume: clamp(Number(src.volume) || 0, 0, 1),
      intensity: validIntensity.indexOf(src.intensity) >= 0 ? src.intensity : 'standard',
      disabledSounds: Array.isArray(src.disabledSounds) ? src.disabledSounds.filter((x) => typeof x === 'string').slice(0, 400) : [],
      disabledFloating: Array.isArray(src.disabledFloating) ? src.disabledFloating.filter((x) => typeof x === 'string').slice(0, 200) : [],
      disabledScreens: Array.isArray(src.disabledScreens) ? src.disabledScreens.filter((x) => typeof x === 'string').slice(0, 200) : [],
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return sanitizeSettings(DEFAULTS);
      return sanitizeSettings(JSON.parse(raw));
    } catch (error) {
      return sanitizeSettings(DEFAULTS);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    } catch (error) {
      /* 空间不足/隐私模式：本次会话内继续生效即可 */
    }
  }

  // ── 运行时状态 ──────────────────────────────────────────────────────────
  const state = {
    initialized: false,
    settings: loadSettings(),
    root: null,
    emojiLayer: null,
    floatEl: null,
    floatCanvas: null,
    floatCtx: null,
    floatTag: null,
    floatKind: null,
    floatName: null,
    screenCanvas: null,
    screenCtx: null,
    screenOff: null,
    screenOffCtx: null,
    audioCtx: null,
    soundCache: new Map(),
    activeAudio: [],
    videos: new Map(),
    emojiUrls: new Map(),
    lastSoundAt: 0,
    lastFloatAt: 0,
    lastScreenAt: 0,
    lastEmojiAt: 0,
    lastSoundId: null,
    lastFloatId: null,
    lastScreenId: null,
    float: { active: false, start: 0, duration: 2500, video: null, entry: null, raf: 0, lastDraw: 0, failing: false, preview: false },
    screen: { active: false, start: 0, duration: 2400, type: null, video: null, proc: null, entry: null, lastDraw: 0, preview: false, outcome: 'hit' },
    pumpId: 0,
    lastPump: 0,
    timers: [],
    previewDepth: 0,
    disabledCache: { sounds: null, floating: null, screens: null },
  };

  function intensity() {
    return INTENSITY[state.settings.intensity] || INTENSITY.standard;
  }

  function globalVolume() {
    let master = 1;
    try {
      if (typeof Store !== 'undefined' && Store.settings && Store.settings.audio) {
        if (Store.settings.audio.enabled === false) master = 0;
        const v = Number(Store.settings.audio.volume);
        if (Number.isFinite(v)) master = Math.min(master, clamp(v, 0, 1));
      }
    } catch (error) {
      /* Store 可能尚未初始化 */
    }
    return master * clamp(state.settings.volume, 0, 1);
  }

  function enabledSet() {
    return new Set(state.settings.disabledSounds || []);
  }

  // ── DOM 图层 ────────────────────────────────────────────────────────────
  function ensureInit() {
    if (state.initialized) return true;
    state.root = document.getElementById('meme-layer');
    if (!state.root) return false;
    state.root.innerHTML = '';

    state.emojiLayer = document.createElement('div');
    state.emojiLayer.className = 'meme-emoji-layer';
    state.root.appendChild(state.emojiLayer);

    state.screenCanvas = document.createElement('canvas');
    state.screenCanvas.className = 'meme-screen-canvas';
    state.screenCanvas.setAttribute('aria-hidden', 'true');
    state.screenCtx = state.screenCanvas.getContext('2d');
    state.root.appendChild(state.screenCanvas);

    state.screenOff = document.createElement('canvas');
    state.screenOff.width = 480;
    state.screenOff.height = 270;
    state.screenOffCtx = state.screenOff.getContext('2d', { willReadFrequently: true });

    state.floatEl = document.createElement('div');
    state.floatEl.className = 'meme-float';
    state.floatEl.hidden = true;
    state.floatEl.innerHTML =
      '<div class="meme-float-frame" aria-hidden="true"></div>' +
      '<canvas class="meme-float-canvas" width="384" height="216"></canvas>' +
      '<div class="meme-float-caption">' +
      '<span class="meme-float-kind">MEME // HIT</span>' +
      '<b class="meme-float-name">反应</b>' +
      '<i class="meme-float-blast">BLAST</i>' +
      '</div>';
    state.root.appendChild(state.floatEl);
    state.floatCanvas = state.floatEl.querySelector('.meme-float-canvas');
    state.floatCtx = state.floatCanvas.getContext('2d');
    state.floatTag = state.floatEl.querySelector('.meme-float-kind');
    state.floatName = state.floatEl.querySelector('.meme-float-name');
    state.floatKind = state.floatEl.querySelector('.meme-float-kind');
    state.floatEl.__blast = state.floatEl.querySelector('.meme-float-blast');

    window.addEventListener('resize', () => {
      resizeScreen();
      if (!state.screen.active) return;
      if (state.screen.type === 'video') updateVideoScreen(nowMs());
      else if (state.screen.type === 'proc') drawProcFrame(nowMs());
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) suspend();
    });

    state.initialized = true;
    resizeScreen();
    return true;
  }

  function resizeScreen() {
    if (!state.screenCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (state.screenCanvas.width !== pw || state.screenCanvas.height !== ph) {
      state.screenCanvas.width = pw;
      state.screenCanvas.height = ph;
      state.screenCanvas.style.width = w + 'px';
      state.screenCanvas.style.height = h + 'px';
      state.screenCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // ── 视频与抠绿 ──────────────────────────────────────────────────────────
  function getVideo(file) {
    if (!file) return null;
    if (state.videos.has(file)) return state.videos.get(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.src = assetUrl(file);
    video.addEventListener('error', () => {
      if (state.screen.video === video) endScreen(true);
      if (state.float.video === video) endFloat();
    });
    state.videos.set(file, video);
    return video;
  }

  function chromaKey(data) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const dominance = g - Math.max(r, b);
      if (g < 55 || dominance <= 18) continue;
      const amount = Math.min(1, (dominance - 18) / 42);
      data[i + 3] = Math.round(data[i + 3] * (1 - amount));
      if (amount > 0) data[i + 1] = Math.min(g, Math.max(r, b) + 18);
    }
  }

  function drawVideoFrame(ctx, video, dx, dy, dw, dh, keyMode) {
    if (!video || !ctx) return false;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return false;
    if (keyMode !== 'green' || !state.screenOffCtx) {
      ctx.drawImage(video, dx, dy, dw, dh);
      return true;
    }
    const capW = Math.min(vw, 480);
    const capH = Math.max(1, Math.round(capW * vh / vw));
    if (state.screenOff.width !== capW || state.screenOff.height !== capH) {
      state.screenOff.width = capW;
      state.screenOff.height = capH;
    }
    const off = state.screenOffCtx;
    off.clearRect(0, 0, capW, capH);
    off.drawImage(video, 0, 0, capW, capH);
    let pixels;
    try {
      pixels = off.getImageData(0, 0, capW, capH);
    } catch (error) {
      // 理论上单文件 data: URI 不会污染画布；若发生则退化为直接绘制。
      ctx.drawImage(video, dx, dy, dw, dh);
      return true;
    }
    chromaKey(pixels.data);
    off.putImageData(pixels, 0, 0);
    ctx.drawImage(state.screenOff, 0, 0, capW, capH, dx, dy, dw, dh);
    return true;
  }

  function coverRect(video, w, h) {
    const vw = (video && video.videoWidth) || 16;
    const vh = (video && video.videoHeight) || 9;
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  }

  // ── 音效合成（额外的整活音效） ─────────────────────────────────────────
  function ensureAudioCtx() {
    if (state.audioCtx) {
      if (state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
      return state.audioCtx;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      state.audioCtx = new Ctx();
      if (state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
    } catch (error) {
      state.audioCtx = null;
    }
    return state.audioCtx;
  }

  function noiseBuffer(ctx, duration) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function synthTone(ctx, opts) {
    const t = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.from, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.duration);
    const peak = Math.max(0.0002, (opts.volume || 0.2) * globalVolume());
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, opts.duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = opts.vibrato.rate || 6;
      lfoGain.gain.value = opts.vibrato.amount || 8;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + opts.duration + 0.05);
    }
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + opts.duration + 0.03);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (error) {
        /* noop */
      }
    };
  }

  function playSynth(name) {
    const ctx = ensureAudioCtx();
    if (!ctx || globalVolume() <= 0) return;
    try {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (name === 'airhorn') {
        [220, 277, 330].forEach((freq, i) => {
          synthTone(ctx, { type: 'sawtooth', from: freq, to: freq * 0.97, duration: 0.34, volume: 0.08, delay: i * 0.006 });
        });
        synthTone(ctx, { type: 'square', from: 440, to: 415, duration: 0.3, volume: 0.03, delay: 0.01 });
      } else if (name === 'vineboom') {
        synthTone(ctx, { type: 'sine', from: 120, to: 32, duration: 0.52, volume: 0.36 });
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.18);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 520;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.12 * globalVolume(), ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        src.start();
      } else if (name === 'scratch') {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.28);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.24);
        filter.Q.value = 1.1;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.16 * globalVolume(), ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        src.start();
      } else if (name === 'boing') {
        synthTone(ctx, { type: 'sine', from: 170, to: 620, duration: 0.18, volume: 0.16 });
        synthTone(ctx, { type: 'sine', from: 620, to: 150, duration: 0.28, volume: 0.1, delay: 0.16 });
      } else if (name === 'whistle') {
        synthTone(ctx, { type: 'sine', from: 650, to: 1750, duration: 0.2, volume: 0.11 });
        synthTone(ctx, { type: 'sine', from: 1750, to: 380, duration: 0.28, volume: 0.08, delay: 0.18 });
      } else if (name === 'ding') {
        synthTone(ctx, { type: 'sine', from: 1320, duration: 0.45, volume: 0.13 });
        synthTone(ctx, { type: 'sine', from: 1980, duration: 0.35, volume: 0.055, delay: 0.008 });
      } else if (name === 'sparkle') {
        [880, 1174, 1568].forEach((freq, i) => synthTone(ctx, { type: 'sine', from: freq, duration: 0.16, volume: 0.09, delay: i * 0.055 }));
      } else if (name === 'crowd') {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.8);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(900, ctx.currentTime);
        filter.frequency.linearRampToValueAtTime(1800, ctx.currentTime + 0.3);
        filter.Q.value = 0.8;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08 * globalVolume(), ctx.currentTime + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        src.start();
      } else if (name === 'trombone') {
        [233, 196, 175, 155].forEach((freq, i) => {
          synthTone(ctx, { type: 'sawtooth', from: freq, to: freq * 0.94, duration: 0.24, volume: 0.045, delay: i * 0.18, vibrato: { rate: 6, amount: 3 } });
        });
      } else if (name === 'buzz') {
        synthTone(ctx, { type: 'square', from: 110, to: 105, duration: 0.45, volume: 0.06 });
        synthTone(ctx, { type: 'square', from: 116, to: 110, duration: 0.45, volume: 0.04, delay: 0.01 });
      } else if (name === 'womp') {
        synthTone(ctx, { type: 'sawtooth', from: 180, to: 120, duration: 0.22, volume: 0.06 });
        synthTone(ctx, { type: 'sawtooth', from: 150, to: 86, duration: 0.42, volume: 0.07, delay: 0.24, vibrato: { rate: 5, amount: 4 } });
      } else if (name === 'rewind') {
        synthTone(ctx, { type: 'triangle', from: 1800, to: 160, duration: 0.38, volume: 0.08 });
      } else if (name === 'boo') {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.6);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(700, ctx.currentTime);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.055 * globalVolume(), ctx.currentTime + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        src.start();
      } else if (name === 'click') {
        synthTone(ctx, { type: 'square', from: 1200, to: 700, duration: 0.04, volume: 0.03 });
      }
    } catch (error) {
      /* 音频失败不影响训练 */
    }
  }

  // ── 采样音效 ────────────────────────────────────────────────────────────
  function playFile(entry, preview) {
    if (!entry || !entry.file) return false;
    const vol = globalVolume();
    if (vol <= 0) return false;
    let audio;
    try {
      if (state.soundCache.has(entry.id)) {
        audio = state.soundCache.get(entry.id);
      } else {
        audio = new Audio(assetUrl(entry.file));
        audio.preload = 'auto';
        audio.addEventListener('error', () => {
          state.soundCache.delete(entry.id);
        });
        state.soundCache.set(entry.id, audio);
      }
      if (state.activeAudio.length >= 3) {
        const first = state.activeAudio.shift();
        try {
          first.pause();
          first.currentTime = 0;
        } catch (error) {
          /* noop */
        }
      }
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (error) {
        /* noop */
      }
      audio.volume = clamp(vol, 0, 1);
      const promise = audio.play();
      if (promise && promise.catch) {
        promise.catch(() => {
          if (preview && typeof UI !== 'undefined' && UI.toast) UI.toast('音效播放被浏览器拦截，再点一次试试。', 'error');
        });
      }
      state.activeAudio.push(audio);
      return true;
    } catch (error) {
      return false;
    }
  }

  function playRandomSound(group, force) {
    const cat = catalog();
    const pool = group === 'miss' ? cat.missSounds : cat.hitSounds;
    const disabled = enabledSet();
    let available = pool.filter((entry) => !disabled.has(entry.id));
    if (!available.length) return null;
    if (available.length > 1) available = available.filter((entry) => entry.id !== state.lastSoundId);
    const entry = pick(available);
    state.lastSoundId = entry.id;
    if (entry.synth) {
      if (force || state.settings.sounds) playSynth(entry.synth);
    } else {
      playFile(entry, !!force);
    }
    return entry;
  }

  // ── 表情包 ──────────────────────────────────────────────────────────────
  function emojiUrl(file) {
    if (!file) return '';
    return assetUrl(file);
  }

  function makeEmoji(el, emoji) {
    el.className = el.className || 'meme-emoji';
    el.alt = '';
    el.draggable = false;
    el.decoding = 'async';
    el.src = emojiUrl(emoji.file);
    el.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.textContent = emoji.ch || '✨';
      el.replaceWith(fallback);
    });
  }

  function emojiBurst(x, y, count, big) {
    if (!state.settings.emoji) return;
    if (!ensureInit()) return;
    const cat = catalog();
    if (!cat.emojis.length) return;
    const n = Math.max(1, Math.min(10, count || 4));
    const centerX = Number.isFinite(x) ? x : window.innerWidth / 2;
    const centerY = Number.isFinite(y) ? y : window.innerHeight / 2;
    for (let i = 0; i < n; i += 1) {
      const emoji = pick(cat.emojis);
      const img = document.createElement('img');
      const size = big ? rand(58, 96) : rand(32, 58);
      const angle = rand(-Math.PI, Math.PI);
      const dist = rand(40, big ? 220 : 130);
      img.style.setProperty('--emoji-size', size + 'px');
      img.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      img.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      img.style.setProperty('--rot', rand(-80, 80) + 'deg');
      img.style.setProperty('--dur', rand(620, 980) + 'ms');
      img.style.left = centerX + rand(-14, 14) + 'px';
      img.style.top = centerY + rand(-14, 14) + 'px';
      makeEmoji(img, emoji);
      state.emojiLayer.appendChild(img);
      window.setTimeout(() => {
        if (img.parentNode) img.parentNode.removeChild(img);
      }, 1100);
    }
  }

  function emojiRain(count) {
    if (!state.settings.emoji) return;
    if (!ensureInit()) return;
    const cat = catalog();
    if (!cat.emojis.length) return;
    const n = Math.max(8, Math.min(46, count || 24));
    for (let i = 0; i < n; i += 1) {
      const emoji = pick(cat.emojis);
      const img = document.createElement('img');
      img.className = 'meme-emoji-rain';
      img.style.setProperty('--emoji-size', rand(28, 72) + 'px');
      img.style.left = rand(-2, 98) + 'vw';
      img.style.setProperty('--delay', rand(0, 700) + 'ms');
      img.style.setProperty('--fall', rand(1900, 3200) + 'ms');
      img.style.setProperty('--rot', rand(-180, 180) + 'deg');
      makeEmoji(img, emoji);
      state.emojiLayer.appendChild(img);
      window.setTimeout(() => {
        if (img.parentNode) img.parentNode.removeChild(img);
      }, 4200);
    }
  }

  function callout(text, tone) {
    if (!ensureInit()) return;
    const el = document.createElement('div');
    el.className = 'meme-callout ' + (tone || 'hit');
    el.textContent = text;
    state.emojiLayer.appendChild(el);
    window.setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 950);
  }

  // ── 飞行梗视频 ──────────────────────────────────────────────────────────
  function chooseFloating(outcome, forcedId) {
    const cat = catalog();
    const disabled = new Set(state.settings.disabledFloating || []);
    let pool = cat.floating.filter((entry) => !disabled.has(entry.id) && (entry.groups || []).indexOf(outcome) >= 0);
    if (!pool.length) pool = cat.floating.filter((entry) => !disabled.has(entry.id));
    if (forcedId) {
      const forced = pool.find((entry) => entry.id === forcedId) || cat.floating.find((entry) => entry.id === forcedId);
      if (forced) return forced;
    }
    if (pool.length > 1) pool = pool.filter((entry) => entry.id !== state.lastFloatId);
    return pool.length ? pick(pool) : null;
  }

  function layoutFloat(aspect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = Math.min(vw * 0.42, 480);
    const minW = Math.min(maxW, Math.max(150, vw * 0.2));
    const width = rand(minW, maxW);
    const height = width / (Number.isFinite(aspect) && aspect > 0.2 ? aspect : 16 / 9);
    const maxX = Math.max(8, vw - width - 10);
    const maxY = Math.max(8, vh - height - 10);
    const x = rand(6, Math.max(8, maxX));
    const y = rand(Math.min(vh * 0.12, 60), Math.max(70, maxY));
    return { x, y, width, height };
  }

  function showFloating(entry, outcome, force) {
    if (!entry) return false;
    if (!ensureInit()) return false;
    const now = nowMs();
    if (!force) {
      if (!state.settings.enabled || !state.settings.floating) return false;
      const cfg = intensity();
      if (now - state.lastFloatAt < cfg.floatGap) return false;
      if (Math.random() > cfg.floatChance) return false;
    }
    state.lastFloatAt = now;
    state.lastFloatId = entry.id;
    const video = getVideo(entry.file);
    if (!video) return false;
    stopFloating(true);
    state.float.active = true;
    state.float.entry = entry;
    state.float.video = video;
    state.float.start = now;
    state.float.duration = 2500;
    state.float.lastDraw = 0;
    state.float.failing = false;
    state.float.preview = !!force;
    state.floatEl.hidden = false;
    state.floatEl.classList.remove('is-leaving');
    state.floatEl.classList.add('is-active');
    state.floatEl.dataset.outcome = outcome;
    state.floatTag.textContent = 'MEME // ' + (outcome === 'miss' ? 'MISS' : 'HIT');
    state.floatName.textContent = entry.name || '反应';
    state.floatEl.__blast.hidden = !entry.blast;
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const layout = layoutFloat(aspect);
    state.floatEl.style.left = layout.x + 'px';
    state.floatEl.style.top = layout.y + 'px';
    state.floatEl.style.width = layout.width + 'px';
    state.floatEl.style.height = layout.height + 'px';
    state.floatEl.style.setProperty('--rot', rand(-4, 4) + 'deg');
    state.floatEl.classList.toggle('is-blast', !!entry.blast);
    try {
      video.currentTime = 0;
      const promise = video.play();
      if (promise && promise.catch) {
        promise.catch(() => {
          if (state.float.video === video) state.float.failing = true;
        });
      }
    } catch (error) {
      state.float.failing = true;
    }
    startPump();
    if (force) markPreview();
    schedule(() => {
      if (state.float.active) endFloat();
    }, state.float.duration + 80);
    return true;
  }

  function drawFloatFrame(force) {
    const float = state.float;
    if (!float.active || !float.video) return;
    const now = nowMs();
    if (!force && now - float.lastDraw < 40) return;
    float.lastDraw = now;
    const video = float.video;
    if (video.readyState < 2) return;
    try {
      const c = state.floatCtx;
      const dv = state.floatCanvas.width / state.floatCanvas.height;
      const sw = Math.max(1, state.floatCanvas.width);
      const sh = Math.max(1, state.floatCanvas.height);
      c.clearRect(0, 0, sw, sh);
      const keyMode = float.entry.key === 'screen' ? 'screen' : 'green';
      if (keyMode === 'screen') {
        c.fillStyle = '#000';
        c.fillRect(0, 0, sw, sh);
        c.globalCompositeOperation = 'screen';
      }
      drawVideoFrame(c, video, 0, 0, sw, sh, keyMode);
      c.globalCompositeOperation = 'source-over';
      state.floatEl.classList.toggle('is-screen-blend', keyMode === 'screen');
      if (dv < 0) return;
    } catch (error) {
      endFloat();
    }
  }

  function endFloat() {
    if (!state.floatEl) return;
    if (state.float.preview) {
      state.float.preview = false;
      unmarkPreview();
    }
    state.float.active = false;
    state.float.video = null;
    state.floatEl.classList.add('is-leaving');
    state.floatEl.classList.remove('is-active');
    window.setTimeout(() => {
      if (!state.float.active && state.floatEl) {
        state.floatEl.hidden = true;
        state.floatEl.classList.remove('is-leaving', 'is-blast');
      }
    }, 260);
  }

  function stopFloating(immediate) {
    const wasPreview = state.float.preview;
    state.float.active = false;
    state.float.video = null;
    state.float.preview = false;
    if (!state.floatEl) {
      if (wasPreview) unmarkPreview();
      return;
    }
    if (immediate) {
      state.floatEl.hidden = true;
      state.floatEl.classList.remove('is-active', 'is-leaving', 'is-blast');
      if (wasPreview) unmarkPreview();
    } else {
      if (wasPreview) {
        state.float.preview = true;
        endFloat();
      } else {
        endFloat();
      }
    }
  }

  // ── 全屏特效 ────────────────────────────────────────────────────────────
  function chooseScreen(outcome, forcedId) {
    const cat = catalog();
    const disabled = new Set(state.settings.disabledScreens || []);
    let pool = cat.screens.filter((entry) => !disabled.has(entry.id));
    if (forcedId) {
      const forced = pool.find((entry) => entry.id === forcedId) || cat.screens.find((entry) => entry.id === forcedId);
      if (forced) return forced;
    }
    if (outcome === 'miss') {
      const missFriendly = pool.filter((entry) => /glitch|explosion|blast|dragon|comic|emoji/i.test(entry.id));
      if (missFriendly.length) pool = missFriendly;
    }
    if (outcome === 'hit') {
      const hitFriendly = pool.filter((entry) => /fireworks|sparkles|confetti|hearts|dragon|fire|comic|emoji/i.test(entry.id));
      if (hitFriendly.length) pool = hitFriendly;
    }
    if (pool.length > 1) pool = pool.filter((entry) => entry.id !== state.lastScreenId);
    return pool.length ? pick(pool) : null;
  }

  function markPreview() {
    state.previewDepth += 1;
    if (state.root) state.root.classList.add('is-preview');
  }

  function unmarkPreview() {
    state.previewDepth = Math.max(0, state.previewDepth - 1);
    if (state.previewDepth === 0 && state.root) state.root.classList.remove('is-preview');
  }

  function triggerScreen(force, forcedId, outcome) {
    if (!ensureInit()) return false;
    const now = nowMs();
    if (!force) {
      if (!state.settings.enabled || !state.settings.fullscreen) return false;
      const cfg = intensity();
      if (now - state.lastScreenAt < cfg.screenGap) return false;
      if (Math.random() > cfg.screenChance) return false;
    }
    const entry = chooseScreen(outcome || 'hit', forcedId);
    if (!entry) return false;
    stopScreen(true);
    state.lastScreenAt = now;
    state.lastScreenId = entry.id;
    state.screen.active = true;
    state.screen.start = now;
    state.screen.entry = entry;
    state.screen.outcome = outcome || 'hit';
    state.screen.preview = !!force;
    state.screen.type = entry.kind === 'video' ? 'video' : 'proc';
    state.screen.duration = entry.kind === 'video' ? 2700 : 2300;
    state.screen.video = null;
    state.screen.proc = null;
    state.screen.lastDraw = 0;
    if (force) markPreview();
    if (entry.kind === 'video') {
      const video = getVideo(entry.file);
      if (!video) {
        stopScreen(true);
        if (force) unmarkPreview();
        return false;
      }
      state.screen.video = video;
      resizeScreen();
      try {
        video.currentTime = 0;
        const promise = video.play();
        if (promise && promise.catch) {
          promise.catch(() => {
            if (state.screen.active && state.screen.video === video) {
              state.screen.type = 'proc';
              state.screen.proc = createProc('fireworks', outcome || 'hit');
              state.screen.duration = 2200;
              state.screen.start = nowMs();
            }
          });
        }
      } catch (error) {
        state.screen.type = 'proc';
        state.screen.proc = createProc('fireworks', outcome || 'hit');
        state.screen.duration = 2200;
      }
    } else if (entry.proc === 'emoji-rain') {
      resizeScreen();
      emojiRain(30);
      state.screen.type = 'emoji';
      state.screen.duration = 2600;
    } else {
      state.screen.proc = createProc(entry.proc, outcome || 'hit');
    }
    state.screenCanvas.classList.add('is-active');
    state.screenCanvas.style.opacity = '1';
    startPump();
    schedule(() => {
      if (state.screen.active) endScreen();
    }, state.screen.duration + 100);
    return true;
  }

  function endScreen(immediate) {
    const s = state.screen;
    if (!s.active && !immediate) return;
    if (s.video) {
      try {
        s.video.pause();
      } catch (error) {
        /* noop */
      }
    }
    s.active = false;
    s.video = null;
    s.proc = null;
    s.type = null;
    if (state.screenCanvas) {
      state.screenCanvas.classList.remove('is-active');
      state.screenCanvas.style.opacity = '0';
      if (state.screenCtx) state.screenCtx.clearRect(0, 0, window.innerWidth + 4, window.innerHeight + 4);
    }
    if (s.preview) {
      s.preview = false;
      unmarkPreview();
    }
  }

  function stopScreen(immediate) {
    if (immediate) {
      const s = state.screen;
      if (s.video) {
        try {
          s.video.pause();
        } catch (error) {
          /* noop */
        }
      }
      s.active = false;
      s.video = null;
      s.proc = null;
      s.type = null;
      if (state.screenCanvas) {
        state.screenCanvas.classList.remove('is-active');
        if (state.screenCtx) state.screenCtx.clearRect(0, 0, window.innerWidth + 4, window.innerHeight + 4);
      }
      if (state.previewDepth > 0) {
        state.previewDepth = 0;
        if (state.root) state.root.classList.remove('is-preview');
      }
    } else {
      endScreen();
    }
  }

  function screenFade(age, duration) {
    const fadeIn = clamp(age / 130, 0, 1);
    const fadeOut = clamp((duration - age) / 320, 0, 1);
    return Math.min(fadeIn, fadeOut);
  }

  function updateVideoScreen(now) {
    const s = state.screen;
    if (!s.active || s.type !== 'video' || !s.video) return;
    const age = now - s.start;
    const opacity = screenFade(age, s.duration);
    state.screenCanvas.style.opacity = String(opacity);
    if (s.video.readyState >= 2 && now - s.lastDraw >= 40) {
      s.lastDraw = now;
      resizeScreen();
      const w = window.innerWidth;
      const h = window.innerHeight;
      const rect = coverRect(s.video, w, h);
      const ctx = state.screenCtx;
      ctx.clearRect(0, 0, w, h);
      try {
        const key = s.entry.key === 'screen' ? 'screen' : 'green';
        if (key === 'screen') {
          ctx.globalCompositeOperation = 'screen';
          drawVideoFrame(ctx, s.video, rect.x, rect.y, rect.w, rect.h, 'screen');
          ctx.globalCompositeOperation = 'source-over';
        } else {
          drawVideoFrame(ctx, s.video, rect.x, rect.y, rect.w, rect.h, 'green');
        }
      } catch (error) {
        endScreen(true);
        return;
      }
    }
    if (s.video.ended || age > s.duration) endScreen();
  }

  function startPump() {
    if (state.pumpId) return;
    state.lastPump = nowMs();
    state.pumpId = window.requestAnimationFrame(pump);
  }

  function pump(now) {
    state.pumpId = 0;
    const dt = Math.min(0.05, Math.max(0, (now - state.lastPump) / 1000));
    state.lastPump = now;
    let active = false;
    if (state.screen.active) {
      active = true;
      if (state.screen.type === 'video') updateVideoScreen(now);
      else if (state.screen.type === 'emoji') {
        const age = now - state.screen.start;
        state.screenCanvas.style.opacity = '0';
        if (age > state.screen.duration) endScreen();
      } else if (state.screen.type === 'proc') {
        drawProcFrame(now);
      }
    }
    if (state.float.active) {
      active = true;
      drawFloatFrame(false);
      if (now - state.float.start > state.float.duration) endFloat();
    }
    if (active) {
      state.pumpId = window.requestAnimationFrame(pump);
    } else {
      state.lastPump = now;
    }
    void dt;
  }

  // ── 程序化全屏特效 ──────────────────────────────────────────────────────
  function createProc(kind, outcome) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const proc = { kind: kind, outcome: outcome, w: w, h: h, parts: [], extra: {} };
    if (kind === 'fireworks') {
      proc.extra.bursts = Array.from({ length: 7 }, (_, i) => ({
        x: w * (0.12 + Math.random() * 0.76),
        y: h * (0.1 + Math.random() * 0.48),
        t: i * 0.14,
        color: [185, 260, 318, 48, 285, 205, 330][i % 7],
        parts: Array.from({ length: 22 }, () => ({ a: Math.random() * Math.PI * 2, speed: 40 + Math.random() * 180 })),
      }));
    } else if (kind === 'fire') {
      proc.parts = Array.from({ length: 110 }, () => ({ x: Math.random(), h: 0.1 + Math.random() * 0.8, speed: 0.3 + Math.random() * 0.9, size: 14 + Math.random() * 44, phase: Math.random() * Math.PI * 2 }));
    } else if (kind === 'explosion') {
      proc.parts = Array.from({ length: 90 }, () => ({ a: Math.random() * Math.PI * 2, speed: 0.2 + Math.random() * 0.9, size: 1 + Math.random() * 5 }));
      proc.extra.ring = { x: w * 0.5, y: h * 0.52 };
    } else if (kind === 'shockwave') {
      proc.extra.rings = Array.from({ length: 5 }, (_, i) => ({ delay: i * 0.13, hue: 180 + i * 26 }));
    } else if (kind === 'meteors') {
      proc.parts = Array.from({ length: 55 }, () => ({ x: Math.random() * 1.4 - 0.2, y: Math.random() * 1.2 - 0.2, speed: 0.5 + Math.random() * 0.9, size: 1 + Math.random() * 3, hue: 20 + Math.random() * 40 }));
    } else if (kind === 'confetti') {
      proc.parts = Array.from({ length: 140 }, () => ({ x: Math.random(), y: -0.1 - Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.08, vy: 0.16 + Math.random() * 0.28, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 7, w: 4 + Math.random() * 8, h: 8 + Math.random() * 14, color: pick(['#2ce8ff', '#a78bfa', '#ffd166', '#ff63a9', '#c4f74c', '#ffffff']) }));
    } else if (kind === 'glitch') {
      proc.extra.slices = Array.from({ length: 18 }, () => ({ y: Math.random(), h: 0.01 + Math.random() * 0.07, offset: (Math.random() - 0.5) * 0.22, color: pick(['#2ce8ff', '#ff3d9a', '#ffffff', '#c4f74c']) }));
    } else if (kind === 'lightning') {
      proc.extra.bolts = Array.from({ length: 5 }, () => ({ x: 0.1 + Math.random() * 0.8, t: Math.random() * 0.5, branch: Array.from({ length: 8 }, () => ({ dx: (Math.random() - 0.5) * 0.14, dy: Math.random() })) }));
    } else if (kind === 'hearts') {
      proc.parts = Array.from({ length: 46 }, () => ({ x: Math.random(), y: 0.85 + Math.random() * 0.3, size: 10 + Math.random() * 28, speed: 0.2 + Math.random() * 0.5, sway: Math.random() * Math.PI * 2, hue: 320 + Math.random() * 40 }));
    } else if (kind === 'comic') {
      proc.extra.caption = outcome === 'miss' ? pick(['菜就多练', '啊这', '？？？', '歪了']) : pick(['帅！', 'NICE', '好枪', '爆！', '牛']);
      proc.extra.hue = outcome === 'miss' ? 345 : 188;
    }
    return proc;
  }

  function drawProcFrame(now) {
    const s = state.screen;
    const proc = s.proc;
    if (!proc) return;
    const ctx = state.screenCtx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const age = (now - s.start) / 1000;
    const duration = s.duration / 1000;
    if (age > duration + 0.4) {
      endScreen();
      return;
    }
    resizeScreen();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const fade = Math.min(1, age / 0.12) * Math.min(1, Math.max(0, (duration - age) / 0.35));
    ctx.globalAlpha = fade;
    drawProcKind(ctx, proc, age, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    state.screenCanvas.style.opacity = '1';
  }

  function randColorHSL(h, s, l, a) {
    return 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';
  }

  function drawProcKind(ctx, proc, age, w, h) {
    const kind = proc.kind;
    const hue = proc.outcome === 'miss' ? 330 : 188;
    if (kind === 'fireworks') {
      ctx.globalCompositeOperation = 'lighter';
      proc.extra.bursts.forEach((burst) => {
        const t = age - burst.t;
        if (t < 0) return;
        const life = Math.max(0, 1 - t / 1.15);
        if (life <= 0) return;
        ctx.strokeStyle = randColorHSL(burst.color, 100, 65, life);
        ctx.lineWidth = 1.4;
        burst.parts.forEach((part) => {
          const dist = part.speed * t * (1 - t * 0.22);
          const x = burst.x + Math.cos(part.a) * dist;
          const y = burst.y + Math.sin(part.a) * dist + t * t * 26;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - Math.cos(part.a) * 7 * life, y - Math.sin(part.a) * 7 * life + 2);
          ctx.stroke();
        });
        ctx.fillStyle = randColorHSL(burst.color, 100, 75, life * 0.35);
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, 2 + 5 * life, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (kind === 'fire') {
      ctx.globalCompositeOperation = 'lighter';
      proc.parts.forEach((part) => {
        const y = h * (1 - ((part.h + age * part.speed * 0.55) % 1.05));
        const x = part.x * w + Math.sin(age * 4 + part.phase) * 24;
        const size = part.size * (0.4 + 0.6 * (1 - (y / h)));
        const g = ctx.createRadialGradient(x, y, 0, x, y, size);
        g.addColorStop(0, randColorHSL(45, 100, 70, 0.5));
        g.addColorStop(0.5, randColorHSL(20, 100, 52, 0.24));
        g.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      });
      const glow = ctx.createLinearGradient(0, h * 0.5, 0, h);
      glow.addColorStop(0, 'rgba(255,94,0,0)');
      glow.addColorStop(1, 'rgba(255,94,0,.2)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, h * 0.5, w, h * 0.5);
    } else if (kind === 'explosion') {
      ctx.globalCompositeOperation = 'lighter';
      const p = Math.min(1, age / 0.6);
      const flash = Math.max(0, 1 - age / 0.4);
      ctx.fillStyle = 'rgba(255,236,190,' + (flash * 0.55) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,170,80,' + Math.max(0, 1 - age / 1.1) + ')';
      ctx.lineWidth = 8 * Math.max(0, 1 - age / 1.2);
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.52, p * Math.max(w, h) * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      proc.parts.forEach((part) => {
        const dist = part.speed * age * Math.max(w, h) * 0.55;
        const x = w * 0.5 + Math.cos(part.a) * dist;
        const y = h * 0.52 + Math.sin(part.a) * dist + age * age * 55;
        const life = Math.max(0, 1 - age / 1.25);
        ctx.fillStyle = randColorHSL(25 + part.speed * 30, 100, 62, life * 0.85);
        ctx.beginPath();
        ctx.arc(x, y, part.size * life + 0.5, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (kind === 'shockwave') {
      ctx.globalCompositeOperation = 'lighter';
      proc.extra.rings.forEach((ring) => {
        const t = Math.max(0, age - ring.delay);
        if (t <= 0) return;
        const radius = t * Math.max(w, h) * 0.62;
        ctx.strokeStyle = randColorHSL(ring.hue, 100, 70, Math.max(0, 1 - t / 1.5));
        ctx.lineWidth = 10 * Math.max(0, 1 - t / 1.5) + 1;
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.52, radius, radius * 0.72, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
    } else if (kind === 'meteors') {
      ctx.globalCompositeOperation = 'lighter';
      proc.parts.forEach((part) => {
        const x = (part.x + part.speed * age * 0.35) * w;
        const y = (part.y - part.speed * age * 0.2) * h;
        const len = 50 + part.speed * 90;
        const grad = ctx.createLinearGradient(x, y, x - len, y + len * 0.7);
        grad.addColorStop(0, randColorHSL(part.hue, 100, 70, 0.9));
        grad.addColorStop(1, 'rgba(255,180,80,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = part.size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len, y + len * 0.7);
        ctx.stroke();
      });
    } else if (kind === 'confetti') {
      ctx.globalCompositeOperation = 'source-over';
      proc.parts.forEach((part) => {
        const x = (part.x + part.vx * age) * w + Math.sin(age * 2 + part.rot) * 20;
        const y = (part.y + part.vy * age) * h;
        if (y < -30 || y > h + 30) return;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(part.rot + part.vr * age);
        ctx.fillStyle = part.color;
        ctx.fillRect(-part.w / 2, -part.h / 2, part.w, part.h * (0.6 + Math.abs(Math.sin(age * 3 + part.rot)) * 0.6));
        ctx.restore();
      });
    } else if (kind === 'glitch') {
      ctx.globalCompositeOperation = 'source-over';
      const blink = Math.sin(age * 42) > 0;
      proc.extra.slices.forEach((slice) => {
        if (Math.random() < 0.4) return;
        ctx.fillStyle = slice.color;
        ctx.globalAlpha = 0.16 + Math.random() * 0.16;
        ctx.fillRect(slice.offset * w, slice.y * h, w, slice.h * h);
      });
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
      if (blink) {
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.globalAlpha = 0.4;
        ctx.fillRect(0, h * (0.12 + Math.random() * 0.7), w, 2);
      }
      ctx.globalAlpha = 1;
      ctx.font = '600 ' + Math.max(18, Math.min(40, w * 0.03)) + 'px "Cascadia Mono", Consolas, monospace';
      ctx.fillStyle = 'rgba(120,245,255,.72)';
      ctx.fillText('SIGNAL // LOST', w * 0.06, h * 0.18);
      ctx.fillStyle = 'rgba(255,90,170,.55)';
      ctx.fillText('MEME.EXE', w * 0.7, h * 0.86);
    } else if (kind === 'lightning') {
      ctx.globalCompositeOperation = 'lighter';
      const flash = Math.max(0, 0.5 - age * 0.4);
      if (flash > 0) {
        ctx.fillStyle = 'rgba(180,235,255,' + flash + ')';
        ctx.fillRect(0, 0, w, h);
      }
      proc.extra.bolts.forEach((bolt) => {
        const cycle = (age + bolt.t) % 0.55;
        if (cycle > 0.16) return;
        const alpha = 1 - cycle / 0.16;
        ctx.strokeStyle = 'rgba(180,245,255,' + alpha + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let x = bolt.x * w;
        let y = 0;
        ctx.moveTo(x, y);
        bolt.branch.forEach((step) => {
          x += step.dx * w;
          y += (1 / bolt.branch.length) * h;
          ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
    } else if (kind === 'hearts') {
      ctx.globalCompositeOperation = 'lighter';
      proc.parts.forEach((part) => {
        const y = (part.y - part.speed * age * 0.7) * h;
        const x = part.x * w + Math.sin(age * 3 + part.sway) * 36;
        const size = part.size;
        const alpha = Math.max(0, Math.min(1, (h - y) / (h * 0.6)));
        ctx.fillStyle = randColorHSL(part.hue, 90, 68, alpha * 0.7);
        ctx.beginPath();
        ctx.moveTo(x, y + size * 0.35);
        ctx.bezierCurveTo(x - size, y - size * 0.4, x - size * 0.5, y - size, x, y - size * 0.4);
        ctx.bezierCurveTo(x + size * 0.5, y - size, x + size, y - size * 0.4, x, y + size * 0.35);
        ctx.fill();
      });
    } else if (kind === 'comic') {
      ctx.globalCompositeOperation = 'source-over';
      const t = Math.min(1, age / 0.18);
      const scale = 0.5 + t * 0.6 - Math.max(0, age - 0.3) * 0.03;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-0.06);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 ' + Math.max(52, Math.min(150, w * 0.12)) + 'px Bahnschrift, "Segoe UI", sans-serif';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 14;
      ctx.strokeStyle = 'rgba(3,8,16,.8)';
      ctx.strokeText(proc.extra.caption, 0, 0);
      ctx.fillStyle = randColorHSL(proc.extra.hue, 100, 62, 1);
      ctx.fillText(proc.extra.caption, 0, 0);
      ctx.font = '600 ' + Math.max(12, Math.min(20, w * 0.018)) + 'px "Cascadia Mono", Consolas, monospace';
      ctx.fillStyle = 'rgba(232,244,255,.8)';
      ctx.fillText(proc.outcome === 'miss' ? 'M I S S' : 'N I C E   S H O T', 0, Math.max(58, Math.min(110, w * 0.08)));
      ctx.restore();
      // 放射速度线
      ctx.strokeStyle = 'rgba(255,255,255,.15)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 24; i += 1) {
        const a = (i / 24) * Math.PI * 2 + age * 0.2;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(a) * w * 0.18, h / 2 + Math.sin(a) * h * 0.18);
        ctx.lineTo(w / 2 + Math.cos(a) * w * 0.8, h / 2 + Math.sin(a) * h * 0.8);
        ctx.stroke();
      }
    }
  }

  // ── 调度 / 生命周期 ─────────────────────────────────────────────────────
  function schedule(fn, delay) {
    const id = window.setTimeout(() => {
      state.timers = state.timers.filter((timer) => timer !== id);
      fn();
    }, delay);
    state.timers.push(id);
    return id;
  }

  function clearTimers() {
    state.timers.forEach((id) => window.clearTimeout(id));
    state.timers = [];
  }

  function stopAudio() {
    state.activeAudio.forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (error) {
        /* noop */
      }
    });
    state.activeAudio = [];
  }

  function clearEmojiLayer() {
    if (!state.emojiLayer) return;
    state.emojiLayer.innerHTML = '';
  }

  function clear(previewToo) {
    clearTimers();
    stopAudio();
    stopFloating(true);
    stopScreen(true);
    clearEmojiLayer();
    if (state.pumpId) {
      window.cancelAnimationFrame(state.pumpId);
      state.pumpId = 0;
    }
    if (previewToo) {
      state.previewDepth = 0;
      if (state.root) state.root.classList.remove('is-preview');
    }
  }

  function suspend() {
    clearTimers();
    stopAudio();
    stopFloating(true);
    stopScreen(true);
  }

  // ── 对外触发 ────────────────────────────────────────────────────────────
  function onHit(info) {
    if (!ensureInit()) return;
    const s = state.settings;
    if (!s.enabled) return;
    const now = nowMs();
    const cfg = intensity();
    if (s.sounds && now - state.lastSoundAt >= cfg.soundGap && Math.random() <= cfg.soundChance) {
      state.lastSoundAt = now;
      playRandomSound('hit', false);
    }
    if (s.floating && now - state.lastFloatAt >= cfg.floatGap && Math.random() <= cfg.floatChance) {
      const entry = chooseFloating('hit');
      if (entry) showFloating(entry, 'hit', false);
    }
    if (s.emoji && now - state.lastEmojiAt >= cfg.emojiGap && Math.random() <= cfg.emojiChance) {
      state.lastEmojiAt = now;
      const x = rand(window.innerWidth * 0.25, window.innerWidth * 0.75);
      const y = rand(window.innerHeight * 0.25, window.innerHeight * 0.7);
      emojiBurst(x, y, 2 + (Math.random() < 0.35 ? 2 : 0), false);
    }
    if (s.fullscreen) triggerScreen(false, null, 'hit');
    if (info && info.combo && info.combo > 0 && info.combo % 5 === 0) onCombo(info.combo);
  }

  function onMiss(info) {
    if (!ensureInit()) return;
    const s = state.settings;
    if (!s.enabled) return;
    const now = nowMs();
    const cfg = intensity();
    if (s.sounds && now - state.lastSoundAt >= cfg.soundGap && Math.random() <= cfg.soundChance) {
      state.lastSoundAt = now;
      playRandomSound('miss', false);
    }
    if (s.floating && now - state.lastFloatAt >= cfg.floatGap && Math.random() <= cfg.floatChance) {
      const entry = chooseFloating('miss');
      if (entry) showFloating(entry, 'miss', false);
    }
    if (s.emoji && now - state.lastEmojiAt >= cfg.emojiGap && Math.random() < 0.55) {
      state.lastEmojiAt = now;
      emojiBurst(window.innerWidth / 2 + rand(-80, 80), window.innerHeight * 0.58, 2, false);
    }
    if (s.fullscreen) triggerScreen(false, null, 'miss');
    void info;
  }

  function onTrackingTick(info) {
    if (!ensureInit() || !state.settings.enabled) return;
    const now = nowMs();
    if (now - state.lastSoundAt > 2600) {
      state.lastSoundAt = now;
      if (state.settings.sounds) {
        const cat = catalog();
        const pool = cat.hitSounds.filter((item) => item.synth && ['ding', 'sparkle', 'whistle'].indexOf(item.synth) >= 0);
        if (pool.length) playSynth(pick(pool).synth);
      }
    }
    if (state.settings.emoji && now - state.lastEmojiAt > 1800) {
      state.lastEmojiAt = now;
      emojiBurst(window.innerWidth / 2 + rand(-160, 160), window.innerHeight * 0.5 + rand(-80, 80), 1, false);
    }
    void info;
  }

  function onCombo(combo) {
    if (!ensureInit() || !state.settings.enabled) return;
    callout('COMBO ×' + combo, combo >= 10 ? 'big' : 'hit');
    if (state.settings.sounds) playSynth(combo >= 10 ? 'airhorn' : 'ding');
    if (state.settings.emoji) {
      emojiBurst(window.innerWidth / 2, window.innerHeight * 0.42, combo >= 10 ? 6 : 3, true);
    }
    if (combo >= 10 && state.settings.fullscreen) triggerScreen(false, null, 'hit');
  }

  function onFinish(summary) {
    if (!ensureInit()) return;
    clear();
    const s = state.settings;
    if (!s.enabled) return;
    const grade = summary && summary.grade ? summary.grade : 'D';
    const win = !!(summary && (summary.newBest || grade === 'S' || grade === 'A' || grade === 'B'));
    if (s.sounds) {
      schedule(() => {
        const url = win ? 'audio/w.mp3' : 'audio/l.mp3';
        const fake = { id: win ? 'finish-win' : 'finish-lose', file: url, origin: 'MemeAim' };
        playFile(fake, false);
        if (win && state.settings.intensity !== 'chill') playSynth('crowd');
      }, 220);
    }
    if (s.fullscreen) {
      schedule(() => {
        const preferred = win ? ['proc-fireworks', 'proc-confetti', 'screen-fireworks', 'screen-sparkles', 'proc-hearts', 'screen-dragon'] : ['proc-glitch', 'screen-blast', 'proc-explosion', 'proc-comic', 'proc-emoji-rain'];
        const cat = catalog();
        const disabled = new Set(s.disabledScreens || []);
        const pickFrom = preferred.map((id) => cat.screens.find((entry) => entry.id === id)).filter((entry) => entry && !disabled.has(entry.id));
        const entry = pickFrom.length ? pick(pickFrom) : chooseScreen(win ? 'hit' : 'miss');
        if (entry) triggerScreen(true, entry.id, win ? 'hit' : 'miss');
      }, 420);
    }
    if (s.emoji) {
      schedule(() => emojiRain(win ? 30 : 18), 300);
    }
    if (win && s.floating && state.settings.intensity === 'chaos') {
      schedule(() => showFloating(chooseFloating('hit', 'dragon-float'), 'hit', true), 900);
    }
  }

  function onRoundStart() {
    if (!ensureInit()) return;
    clear();
    state.lastSoundAt = nowMs();
    state.lastFloatAt = nowMs();
    state.lastScreenAt = nowMs();
    state.lastEmojiAt = nowMs();
    state.lastSoundId = null;
    state.lastFloatId = null;
    state.lastScreenId = null;
  }

  function onGo() {
    if (!ensureInit() || !state.settings.enabled) return;
    if (state.settings.intensity === 'chaos') {
      playSynth('airhorn');
      emojiBurst(window.innerWidth / 2, window.innerHeight * 0.55, 8, true);
    }
  }

  function preview(kind) {
    ensureInit();
    ensureAudioCtx();
    if (kind === 'hit') {
      playRandomSound('hit', true);
      return;
    }
    if (kind === 'miss') {
      playRandomSound('miss', true);
      return;
    }
    if (kind === 'floating') {
      const entry = chooseFloating('hit');
      if (entry) showFloating(entry, 'hit', true);
      if (state.settings.sounds) playRandomSound('hit', true);
      return;
    }
    if (kind === 'screen') {
      // 试玩按钮优先选视频特效，保证玩家能立刻看到明显的大场面；
      // 若视频素材不可用才退回随机（含程序动画）池。
      const cat = catalog();
      const disabled = new Set(state.settings.disabledScreens || []);
      const videoPool = cat.screens.filter((entry) => entry.kind === 'video' && !disabled.has(entry.id));
      const chosen = videoPool.length ? pick(videoPool) : null;
      triggerScreen(true, chosen ? chosen.id : null, 'hit');
      if (state.settings.sounds) playSynth('vineboom');
      return;
    }
    if (kind === 'dragon') {
      triggerScreen(true, 'screen-dragon', 'hit');
      if (state.settings.sounds) playSynth('vineboom');
      return;
    }
    if (kind === 'emoji') {
      markPreview();
      window.setTimeout(unmarkPreview, 2800);
      emojiBurst(window.innerWidth / 2, window.innerHeight * 0.5, 10, true);
      emojiRain(18);
      if (state.settings.sounds) playSynth('sparkle');
      return;
    }
    if (kind === 'combo') {
      onCombo(10);
    }
  }

  function previewSound(id) {
    const cat = catalog();
    const entry = cat.hitSounds.concat(cat.missSounds).find((item) => item.id === id);
    if (!entry) return;
    ensureAudioCtx();
    if (entry.synth) playSynth(entry.synth);
    else playFile(entry, true);
  }

  function previewFloating(id) {
    const cat = catalog();
    const entry = cat.floating.find((item) => item.id === id);
    if (entry) showFloating(entry, (entry.groups && entry.groups[0]) || 'hit', true);
  }

  function previewScreen(id) {
    const cat = catalog();
    const entry = cat.screens.find((item) => item.id === id);
    if (entry) triggerScreen(true, entry.id, 'hit');
  }

  function updateSettings(patch) {
    if (!patch || typeof patch !== 'object') return state.settings;
    const merged = Object.assign({}, state.settings);
    Object.keys(DEFAULTS).forEach((key) => {
      if (patch[key] !== undefined) merged[key] = patch[key];
    });
    state.settings = sanitizeSettings(merged);
    saveSettings();
    return state.settings;
  }

  function resetSettings() {
    state.settings = sanitizeSettings(DEFAULTS);
    saveSettings();
    clear(true);
    return state.settings;
  }

  function getCatalog() {
    const cat = catalog();
    return {
      hitSounds: cat.hitSounds,
      missSounds: cat.missSounds,
      floating: cat.floating,
      screens: cat.screens,
      emojis: cat.emojis,
      sources: { memeaim: 'https://github.com/Passerbyask/-MemeAim', twemoji: 'https://twemoji.twitter.com/', extra: '见 README' },
    };
  }

  function init() {
    if (!ensureInit()) return false;
    ensureAudioCtx();
    return true;
  }

  return {
    init,
    settings: state.settings,
    getSettings: () => state.settings,
    updateSettings,
    resetSettings,
    getCatalog,
    preview,
    previewSound,
    previewFloating,
    previewScreen,
    onHit,
    onMiss,
    onTrackingTick,
    onCombo,
    onFinish,
    onRoundStart,
    onGo,
    suspend,
    clear,
    debug: () => ({
      enabled: state.settings.enabled,
      intensity: state.settings.intensity,
      floatActive: state.float.active,
      screenActive: state.screen.active,
      screenType: state.screen.type,
      screenId: state.screen.entry && state.screen.entry.id,
      previewDepth: state.previewDepth,
      emojis: state.emojiLayer ? state.emojiLayer.children.length : 0,
      assets: catalog().screens.length + catalog().hitSounds.length + catalog().missSounds.length,
    }),
  };
})();

/* ==========================================================================
   MemeUI · 设置页「整活」标签的交互绑定与列表渲染
   ========================================================================== */
const MemeUI = (() => {
  'use strict';

  let handlers = {};
  let bound = false;
  let catalog = null;
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function sync() {
    if (typeof MemeFX === 'undefined') return;
    const s = MemeFX.getSettings();
    const setChecked = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.checked = value;
    };
    setChecked('meme-enabled', s.enabled);
    setChecked('meme-sounds-enabled', s.sounds);
    setChecked('meme-floating-enabled', s.floating);
    setChecked('meme-fullscreen-enabled', s.fullscreen);
    setChecked('meme-emoji-enabled', s.emoji);
    const volume = document.getElementById('meme-volume');
    if (volume) volume.value = String(s.volume);
    const volumeLabel = document.getElementById('meme-volume-value');
    if (volumeLabel) volumeLabel.textContent = Math.round(s.volume * 100) + '%';
    $$('#meme-intensity-row .seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-meme-intensity') === s.intensity);
    });
    const pane = $('[data-pane="meme"]');
    if (pane) pane.classList.toggle('is-disabled', !s.enabled);
    const audioHint = document.getElementById('meme-audio-hint');
    if (audioHint) {
      let audioOn = true;
      try {
        audioOn = !(typeof Store !== 'undefined' && Store.settings && Store.settings.audio &&
          (Store.settings.audio.enabled === false || Number(Store.settings.audio.volume) <= 0));
      } catch (error) {
        audioOn = true;
      }
      audioHint.textContent = audioOn
        ? '全局音效已开启：梗音效会按全局音量与上方节目音量叠加。'
        : '全局音效已关闭：梗音效不会播放。按 M 或点右上角喇叭开启后再试听。';
      audioHint.classList.toggle('is-warning', !audioOn);
    }
    const soundSet = new Set(s.disabledSounds || []);
    $$('[data-meme-sound-id]', pane).forEach((el) => {
      el.checked = !soundSet.has(el.getAttribute('data-meme-sound-id'));
    });
    const floatSet = new Set(s.disabledFloating || []);
    $$('[data-meme-float-id]', pane).forEach((el) => {
      el.checked = !floatSet.has(el.getAttribute('data-meme-float-id'));
    });
    const screenSet = new Set(s.disabledScreens || []);
    $$('[data-meme-screen-id]', pane).forEach((el) => {
      el.checked = !screenSet.has(el.getAttribute('data-meme-screen-id'));
    });
    updateCounts();
    syncStatus();
  }

  function updateCounts() {
    if (!catalog) return;
    const s = MemeFX.getSettings();
    const disabledSound = new Set(s.disabledSounds || []);
    const disabledFloat = new Set(s.disabledFloating || []);
    const disabledScreen = new Set(s.disabledScreens || []);
    const hitOn = catalog.hitSounds.filter((item) => !disabledSound.has(item.id)).length;
    const missOn = catalog.missSounds.filter((item) => !disabledSound.has(item.id)).length;
    const floatOn = catalog.floating.filter((item) => !disabledFloat.has(item.id)).length;
    const screenOn = catalog.screens.filter((item) => !disabledScreen.has(item.id)).length;
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText('meme-hit-count', hitOn + ' / ' + catalog.hitSounds.length);
    setText('meme-miss-count', missOn + ' / ' + catalog.missSounds.length);
    setText('meme-floating-count', floatOn + ' / ' + catalog.floating.length);
    setText('meme-screen-count', screenOn + ' / ' + catalog.screens.length);
  }

  function syncStatus() {
    const s = MemeFX.getSettings();
    const active = s.enabled && (s.sounds || s.floating || s.fullscreen || s.emoji);
    const hud = document.getElementById('hud-meme-state');
    if (hud) {
      hud.textContent = active ? 'MEME FX ON' : 'MEME FX OFF';
      hud.classList.toggle('is-off', !active);
    }
    const entryBtns = $$('[data-open-settings][data-settings-tab="meme"]');
    entryBtns.forEach((btn) => btn.classList.toggle('is-off', !active));
  }

  function makeSoundRow(entry, group) {
    const row = document.createElement('div');
    row.className = 'meme-sound-row';
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = true;
    check.setAttribute('data-meme-sound-id', entry.id);
    check.setAttribute('aria-label', '启用 ' + entry.name);
    check.addEventListener('change', () => {
      const s = MemeFX.getSettings();
      const list = new Set(s.disabledSounds || []);
      if (check.checked) list.delete(entry.id);
      else list.add(entry.id);
      MemeFX.updateSettings({ disabledSounds: Array.from(list) });
      updateCounts();
      syncStatus();
    });
    const name = document.createElement('span');
    name.className = 'meme-sound-name';
    name.textContent = entry.name;
    const origin = document.createElement('em');
    origin.textContent = entry.origin || group;
    label.append(check, name, origin);
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'meme-play-btn';
    play.textContent = '▷';
    play.setAttribute('aria-label', '试听 ' + entry.name);
    play.addEventListener('click', () => MemeFX.previewSound(entry.id));
    row.append(label, play);
    return row;
  }

  function makeAssetRow(entry, kind) {
    const row = document.createElement('div');
    row.className = 'meme-asset-row';
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = true;
    if (kind === 'floating') check.setAttribute('data-meme-float-id', entry.id);
    else check.setAttribute('data-meme-screen-id', entry.id);
    check.setAttribute('aria-label', '启用 ' + entry.name);
    check.addEventListener('change', () => {
      const key = kind === 'floating' ? 'disabledFloating' : 'disabledScreens';
      const source = kind === 'floating' ? 'data-meme-float-id' : 'data-meme-screen-id';
      const s = MemeFX.getSettings();
      const list = new Set(s[key] || []);
      const id = check.getAttribute(source);
      if (check.checked) list.delete(id);
      else list.add(id);
      MemeFX.updateSettings({ [key]: Array.from(list) });
      updateCounts();
    });
    const name = document.createElement('span');
    name.textContent = entry.name;
    const origin = document.createElement('em');
    origin.textContent = entry.kind === 'proc' ? '程序' : (entry.origin || '视频');
    label.append(check, name, origin);
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'meme-play-btn';
    play.textContent = '▷';
    play.setAttribute('aria-label', '预览 ' + entry.name);
    play.addEventListener('click', () => {
      if (kind === 'floating') MemeFX.previewFloating(entry.id);
      else MemeFX.previewScreen(entry.id);
    });
    row.append(label, play);
    return row;
  }

  function buildLists() {
    catalog = MemeFX.getCatalog();
    const hit = document.getElementById('meme-hit-list');
    const miss = document.getElementById('meme-miss-list');
    const floating = document.getElementById('meme-floating-list');
    const screen = document.getElementById('meme-screen-list');
    if (hit) {
      hit.innerHTML = '';
      catalog.hitSounds.forEach((entry) => hit.appendChild(makeSoundRow(entry, 'hit')));
    }
    if (miss) {
      miss.innerHTML = '';
      catalog.missSounds.forEach((entry) => miss.appendChild(makeSoundRow(entry, 'miss')));
    }
    if (floating) {
      floating.innerHTML = '';
      catalog.floating.forEach((entry) => floating.appendChild(makeAssetRow(entry, 'floating')));
    }
    if (screen) {
      screen.innerHTML = '';
      catalog.screens.forEach((entry) => screen.appendChild(makeAssetRow(entry, 'screen')));
    }
    updateCounts();
  }

  function valueToggle(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      MemeFX.updateSettings({ [key]: el.checked });
      syncStatus();
    });
  }

  function bind() {
    if (bound) return;
    bound = true;
    valueToggle('meme-enabled', 'enabled');
    valueToggle('meme-sounds-enabled', 'sounds');
    valueToggle('meme-floating-enabled', 'floating');
    valueToggle('meme-fullscreen-enabled', 'fullscreen');
    valueToggle('meme-emoji-enabled', 'emoji');
    const volume = document.getElementById('meme-volume');
    if (volume) {
      volume.addEventListener('input', () => {
        const s = MemeFX.updateSettings({ volume: Number(volume.value) });
        const label = document.getElementById('meme-volume-value');
        if (label) label.textContent = Math.round(s.volume * 100) + '%';
        syncStatus();
      });
    }
    $$('#meme-intensity-row .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        MemeFX.updateSettings({ intensity: btn.getAttribute('data-meme-intensity') });
        sync();
      });
    });
    $$('[data-meme-preview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        MemeFX.preview(btn.getAttribute('data-meme-preview'));
      });
    });
    const reset = document.getElementById('reset-meme');
    if (reset) {
      reset.addEventListener('click', () => {
        const doReset = () => {
          MemeFX.resetSettings();
          sync();
          if (typeof UI !== 'undefined' && UI.toast) UI.toast('节目效果已恢复默认。', 'success');
        };
        if (typeof UI !== 'undefined' && UI.confirm) {
          UI.confirm({ title: '恢复默认节目效果？', text: '梗音效、特效开关、音量与强度都会回到默认值。', okText: '恢复默认' }).then((yes) => {
            if (yes) doReset();
          });
        } else {
          doReset();
        }
      });
    }
    sync();
  }

  function init(handlersArg) {
    handlers = handlersArg || {};
    if (typeof MemeFX === 'undefined') return;
    MemeFX.init();
    buildLists();
    bind();
    if (!init.listenersBound) {
      init.listenersBound = true;
      document.addEventListener('aimlab:settings-open', function (event) {
        if (!event.detail || !event.detail.tab || event.detail.tab === 'meme') sync();
      });
      document.addEventListener('aimlab:settings-tab', function (event) {
        if (event.detail && event.detail.tab === 'meme') sync();
      });
      document.addEventListener('aimlab:settings-close', function () {
        if (typeof MemeFX !== 'undefined') MemeFX.suspend();
      });
    }
  }

  return { init, sync, refresh: sync, getCatalog: () => catalog };
})();
