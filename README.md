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
