# 素材来源与许可证

本项目是本地、非商业的粉丝作品。代码与页面设计由本项目完成；下列第三方素材按各自许可证使用，
许可证不因被本项目打包而改变。获取/整合日期：2026-10-18。

---

## 1. Passerbyask / MemeAim

- 仓库：<https://github.com/Passerbyask/-MemeAim>
- 使用内容：原项目 `sounds/hit/*`、`sounds/miss/*` 音效，`sounds/w.mp3`、`sounds/l.mp3`，
  以及 `web/effects/*` 中的 18 段绿幕梗视频和 5 段全屏特效视频。
- 说明：MemeAim 仓库本身未对素材另行授予许可证。这些素材权利归原项目/上游站点/原作者所有；
  本项目仅作为个人本地娱乐使用，不再分发素材原件。若你计划公开发布或商用，请先自行取得授权。
- 音效在打包前统一转码为 64 kbps 单声道 MP3 以控制文件体积；视频为仓库原始压缩版本。

## 2. Mixkit（Envato）

- 许可证：**Mixkit Free License**
  - 音效：<https://mixkit.co/license/#sfxFree>
  - 视频：<https://mixkit.co/license/#videoFree>
- 使用内容：
  - 额外音效 26 个（命中/打空）：空气喇叭、Vine Boom 风格低频、唱片刮擦、Cartoon Boing、滑哨、
    悲伤长号、Ding、人群欢呼、卡通笑、观众笑、猴子鼓掌、电影呼啸、错误蜂鸣、消音哔、失败钢琴等。
  - 全屏视频 3 段：*Fireworks at night sky*（夜空烟花）、*Sparks of fire on a black background*（星火迸溅）、
    *Particle explosion, smoke and fire*（粒子爆燃）。为控制单文件体积，统一裁剪为约 3 秒、640px 宽、无音轨。
- 来源页示例：
  - <https://mixkit.co/free-stock-video/fireworks-at-night-sky-4064/>
  - <https://mixkit.co/free-stock-video/sparks-of-fire-on-a-black-background-3463/>
  - <https://mixkit.co/free-stock-video/particle-explosion-smoke-and-fire-18052/>
  - <https://mixkit.co/free-sound-effects/cartoon/>、<https://mixkit.co/free-sound-effects/funny/>、
    <https://mixkit.co/free-sound-effects/boom/>、<https://mixkit.co/free-sound-effects/transition/> 等。
- 每个额外音效的精确直链、来源页、作者与时长记录在工程目录：
  `work/assets-extra/manifest.json`。

## 3. Wikimedia Commons

### 绿幕爆炸

- 文件：`EXPLOSION green screen (no copyright) - the chosen one (720p, h264).webm`
- 作者：the chosen one
- 许可证：**CC BY 3.0** — <https://creativecommons.org/licenses/by/3.0/>
- 来源页：<https://commons.wikimedia.org/wiki/File:EXPLOSION_green_screen_(no_copyright)_-_the_chosen_one_(720p,_h264).webm>
- 使用：裁剪为约 3 秒、640×360，运行时按绿幕抠像叠加。

### 闪电劈落

- 文件：`Blitze während Tief Lambert in Hof (Saale), 20230622 003.webm`
- 作者：PantheraLeo1359531
- 许可证：**CC BY 4.0** — <https://creativecommons.org/licenses/by/4.0/>
- 来源页：<https://commons.wikimedia.org/wiki/File:Blitze_w%C3%A4hrend_Tief_Lambert_in_Hof_(Saale),_20230622_003.webm>
- 使用：裁剪为约 3 秒、640px 宽，运行时以 screen/滤色方式叠加。

## 4. Twemoji

- 图形：44 个 Twemoji SVG（😂 🤣 💀 😭 🤡 😡 🥴 😱 🤔 👀 🔥 💥 ✨ 🎆 🎇 🚀 🐉 🦆 👽 🤖 🍿 🎯 💯 👏 🙏 😎 🤯 🥳 🫠 🎉 🎊 🏆 👻 💢 💩 💫 🙈 🤌 🤪 🤮 ⚡ ✅ 😵 😤 等）。
- 作者：Twitter, Inc. and other contributors（维护分支 `jdecked/twemoji` v15.1.0）
- 许可证：**CC BY 4.0** — <https://creativecommons.org/licenses/by/4.0/>
- 仓库：<https://github.com/jdecked/twemoji>
- 来源 URL 格式：`https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/<codepoint>.svg`

## 5. 字体与界面

- 未加载任何外部字体或图标库。界面字体来自系统字体栈：
  `Bahnschrift / Segoe UI / Microsoft YaHei UI / Cascadia Mono / Consolas`；
  图标全部为项目内联 SVG 或 CSS 绘制。
- 页面背景、图案、边框均为 CSS 渐变/伪元素/内联 SVG data URI，不引用第三方图片。

---

## 许可证汇总

| 来源 | 内容 | 许可证 |
|---|---|---|
| Passerbyask / MemeAim | 命中/打空音效、w/l 结算音、18 段绿幕梗、5 段全屏视频 | 未单独授权（上游素材） |
| Mixkit / Envato | 26 个额外音效、3 段全屏视频 | Mixkit Free License |
| Wikimedia Commons | 绿幕爆炸（the chosen one） | CC BY 3.0 |
| Wikimedia Commons | 闪电劈落（PantheraLeo1359531） | CC BY 4.0 |
| Twemoji | 44 个表情 SVG | CC BY 4.0 |

如果你要公开分发、商用或修改发布，请依上述许可证保留署名，并自行处理 MemeAim 上游素材的授权问题。
