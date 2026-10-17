## 🖥️ Windows 3D 软件版

现有 3D 版本支持打包为独立 Windows 软件，提供 **免安装版（Portable.zip）** 和 **安装版（Setup.exe）**。两者均自带运行环境、音效及视频，安装或解压后直接运行，可离线游玩，不需要安装 Python 或 Node.js。

发布文件位于仓库 **Releases**。Windows 10 / 11 x64；需支持 WebGL 2 的显卡。当前安装包未做商业代码签名，可能显示未知发布者。旧 Python 版源码继续保留，下面的桌面版原说明仍适用于它。

构建、自动发布和版本管理详见 **[desktop/README.md](desktop/README.md)**。GitHub Actions 在推送版本标签后自动构建、检查打包后的程序，再发布安装版和免安装版。

---

## 🌐 3D 网页版：运行与部署

网页版位于 `web/`，使用 Three.js 提供 Gridshot、Tracking、Flick 三种训练模式、第一人称手持枪、梗音效与全屏特效。网页构建后是纯静态文件，无需 Python、数据库或常驻游戏后端；下方仍保留原桌面版说明。

### 1. 准备环境

- 安装 **Node.js 22 或更新版本**（包含 npm）。
- 克隆或下载**整个仓库**，不要只复制 `web/`：构建还会读取仓库根目录的 `sounds/`。
- 首次安装依赖需要联网；构建完成后，Three.js、音效和视频均由部署的网站自身提供。

### 2. 本地启动

在仓库根目录打开终端，执行：

```sh
cd web
npm ci
npm start
```

`npm start` 会先自动构建，然后在本机启动静态服务。浏览器打开 `http://localhost:8765`，按 `Ctrl+C` 停止服务。

此服务仅监听 `127.0.0.1`，用于本机预览。请通过 HTTP 服务访问，不要直接双击 `index.html`，否则浏览器可能阻止 JavaScript 模块加载。

### 3. 构建可部署文件

在 `web/` 目录执行：

```sh
npm ci
npm run build
```

输出目录是 **`web/dist/`**，其中包含页面、脚本、Three.js、音效和特效视频。只部署这个目录的**全部内容**，不要上传整个源码仓库或 `node_modules/`。

### 4. 部署到静态托管或自己的服务器

支持静态文件的托管平台或 Web 服务器即可运行本项目。若平台从 Git 仓库自动构建，可按下面配置：

| 配置项 | 值 |
| --- | --- |
| 检出内容 | 完整仓库，包含根目录 `sounds/` |
| 构建工作目录 | 仓库根目录 |
| Node.js 版本 | 22 或更新版本 |
| 安装与构建命令 | `npm --prefix web ci && npm --prefix web run build` |
| 发布目录 | `web/dist` |
| 运行时后端 / 启动命令 | 不需要，直接提供静态文件 |

如果平台把构建工作目录设为 `web/`，命令改为 `npm ci && npm run build`，发布目录改为 `dist`；仍须确保构建时能读取上一级 `sounds/`。

自行部署时，将 `web/dist/` 内的文件复制到站点目录，使 `index.html` 位于访问路径的首页位置，并保持 `vendor/`、`sounds/`、`effects/` 等目录结构。建议启用 HTTPS；服务器须正确提供 `.js` / `.mjs` 的 JavaScript 类型及 `.mp4` 的 `video/mp4` 类型。

### 手柄与体感

新增「手柄测试」页，可测摇杆原始值、死区输出、中心漂移、外圈范围、按键、扳机和短震动。支持 DualSense / Edge 的 WebHID 体感读取与静止校准；Xbox 标准输入没有陀螺仪数据。飞智等型号可在驱动提供真实 DSU 运动输出时通过 Windows 版接入，具体取决于型号和模式。使用和限制见 **[web/README.md](web/README.md)**，开发协议见 **[web/MOTION.md](web/MOTION.md)**。

### 5. 更新与检查

修改源码、音效或视频后，重新运行 `npm run build`，再用新的 `web/dist/` 更新站点。若托管平台配置了自动构建，推送代码后由平台重新构建发布。

部署后检查：三种模式能进入训练、鼠标能锁定和释放、命中与打空音效正常、特效可以预览和关闭。浏览器需要在用户点击后才能播放声音或锁定鼠标。设置和成绩保存在当前浏览器，不会跨设备同步；清除网站数据会删除本地记录。

更多操作、功能说明及素材来源见 **[web/README.md](web/README.md)**。

---

# MemeAim (特别热闹的练枪软件)

**MemeAim** is an AimLab-style **2D aim trainer** that helps you improve your FPS accuracy and speed. Built around shooting small balls, it offers multiple training modes, sensitivity adjustment, crosshair customization, sound management, and score tracking — packed with meme sound effects.

---

## ✨ Features

- **3 training modes**: Gridshot, Tracking, Flick
- **Timed challenge**: 60 seconds by default, with a results screen showing score / accuracy / best combo / best score
- **Full parameter panel**: duration, ball size, target count, speed, lifetime, sensitivity, resolution, fullscreen
- **Crosshair customization**: style (cross / dot / circle), color, size, thickness, gap
- **Sound system**: hit / miss sounds play randomly, individually previewable, enable/disable per sound; result sounds play by score; background music support
- **Visual effects**: hit particle bursts, floating text, combo popups, crosshair feedback, gradient grid background, animated menu
- **Local score saving**: best scores and all settings persisted to a local file
- **Bilingual UI**: Chinese / English toggle

---

## 🚀 Getting Started

### Option 1: Run the packaged build (recommended)

Open `dist/` and double-click `MemeAim.exe`. **No Python or dependencies required** — runs on any Windows machine.

> On first run, `save_data.json` is created next to the exe to store scores and settings.

### Option 2: Run from source

Requires [Python 3.12](https://www.python.org/) and pygame:

```bash
pip install pygame
python main.py
```

You can also double-click `运行游戏.bat` in the project root (it prefers the packaged exe, otherwise runs from source).

---

## 🎮 Controls

| Action | Description |
|--------|-------------|
| Move mouse | Move crosshair |
| Left click | Shoot |
| `F11` | Toggle fullscreen / windowed |
| `Esc` | Go back / exit (in-game: abort and show results) |
| Mouse wheel | Scroll in sound manager lists |

> During training the mouse is grabbed and hidden (relative-motion mode); it is released when you press `Esc` or finish a session.

---

## 🎯 Game Modes

| Mode | Description | Scoring |
|------|-------------|---------|
| **Gridshot** | Balls appear at random positions; snap between them to build speed and precision | Hit +1, miss -1 (floor 0) |
| **Tracking** | Balls move and bounce continuously; track them to train your aim | Hit +1, miss -1 |
| **Flick** | Balls flash in, stay briefly, then vanish; trains reaction and flick accuracy | Hit +1, miss -1; a despawned ball doesn't deduct score, only counts |

**Result sound rule**: when a session ends, a score **below 60** plays `l.mp3`, and **60 or above** plays `w.mp3` (replaceable).

---

## ⚙️ Settings

All settings are under **Settings** in the main menu and save instantly:

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Duration | 10 ~ 180 s | 60 | Length of a session |
| Ball radius | 6 ~ 40 px | 15 | Ball size (based on 1280×720) |
| Targets at once | 1 ~ 10 | 3 | Simultaneous balls in Gridshot / Tracking |
| Move speed | 50 ~ 600 px/s | 240 | Ball speed in Tracking |
| Flick lifetime | 0.2 ~ 3.0 s | 1.0 | How long a Flick ball stays |
| Mouse sensitivity | 0.2 ~ 3.0 | 1.0 | In-game sensitivity multiplier |
| Resolution | 4 presets | 1280×720 | 1280×720 / 1600×900 / 1920×1080 / 2560×1440 |
| Fullscreen | On / Off | Off | Uses native desktop resolution in fullscreen |
| Language | 中文 / English | 中文 | UI language |

> **About sensitivity (eDPI)**: the software cannot read your mouse's physical DPI, so this is an in-game sensitivity multiplier. Effective feel = your mouse DPI × this multiplier. The default 1.0 is the raw feel; tune between 0.2 and 3.0 to find what suits you.

**Crosshair settings** (main menu → Crosshair): style, color, size, thickness, and gap are all adjustable with live preview.

---

## 🔊 Sound Customization

Sound files live in the `sounds/` directory and support `.mp3` / `.wav` / `.ogg`:

```
sounds/
├── hit/          # Hit sounds (multiple, played randomly on hit)
├── miss/         # Miss sounds (multiple, played randomly on miss)
├── l.mp3         # Result sound: score < 60
├── w.mp3         # Result sound: score ≥ 60
└── bgm.ogg       # Background music (optional, loops automatically)
```

- Hit / miss sounds can be previewed, enabled, or disabled individually in the in-game **Hit Sounds / Miss Sounds** menus.
- Toggle states are saved and persist across launches.
- Missing sound files are silently skipped and won't break anything.

---

## 📁 Project Structure

```
aim_trainer/
├── main.py           # Entry point: state machine, game loop, menus, results
├── targets.py        # Ball class and generation/movement/hit logic for 3 modes
├── ui.py             # UI components: buttons, sliders, gradient text, crosshair
├── audio.py          # Sound loading, playback, and toggle management
├── effects.py        # Visual effects: particles, floating text
├── settings.py       # Config and score persistence
├── i18n.py           # Chinese / English UI strings
├── sounds/           # Sound asset directory
├── dist/
│   └── MemeAim.exe   # Packaged standalone executable
├── MemeAim.spec      # PyInstaller build config
├── 运行游戏.bat       # One-click launcher
├── _smoke_test.py    # Headless smoke test script
└── save_data.json    # Auto-generated scores and settings at runtime
```

---

## 🔧 Building the exe

To rebuild after modifying the code:

```bash
pip install pyinstaller
pyinstaller --noconfirm --onefile --noconsole --name MemeAim --add-data "sounds;sounds" main.py
```

The output goes to `dist/MemeAim.exe`.

---

## 🧪 Running Tests

The project includes a headless smoke test to quickly verify core logic (requires pygame):

```bash
python _smoke_test.py
```

---

## ❓ FAQ

**Q: Why does my antivirus flag the exe as "unknown program"?**
A: The exe isn't code-signed, which is normal. Choose "Run anyway".

**Q: Where are scores and settings stored?**
A: In `save_data.json`, next to the exe.

**Q: How do I replace or add sounds?**
A: Drop sound files into `sounds/hit/` (hit) or `sounds/miss/` (miss); the game picks them up on next launch. For a packaged build, you can also create a `sounds/` folder next to the exe to add sounds without rebuilding.

**Q: How do I reset to default settings?**
A: Close the app, delete `save_data.json` next to the exe, and relaunch.

---

## 🛠️ Tech Stack

- **Python 3.12**
- **pygame 2.6** (rendering, input, audio)
- **PyInstaller** (packaging as a standalone exe)

## 3D Web Version / 3D 网页版

A standalone browser version is available in [`web/`](web/README.md), with Gridshot, Tracking, Flick, first-person controls, a held 3D weapon, and the existing meme sounds. The Python desktop version is unchanged.

需要 Node.js 22+：在 `web/` 中运行 `npm ci`、`npm start`，然后打开 http://localhost:8765 。详细操作、测试及静态托管说明见 [网页版文档](web/README.md)。
