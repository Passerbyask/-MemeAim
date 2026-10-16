# MemeAim Web 开发交接

核对日期：2026-09-08。代码基线：`3ef5201317e410f57d407844662cc28216cff7d7`（Windows `v1.0.0`）。本文面向接手修改 Web 的开发者，后续以当前代码和锁文件为准。

## 1. 先明确项目边界

- **主要改 `web/`**：原生 HTML / CSS / JavaScript + Three.js，没有 React、Vite、后端或数据库。
- **`desktop/` 是同一游戏的 Electron 外壳**：构建时复制 `web/dist/`。修改 Web 会影响下一次打包的 Windows 软件，不会自动改变已经发布的软件。
- **根目录 Python 文件是旧 2D 版**：目前保留作独立旧版，Web 不调用它们。修改 3D 游戏不需要改 Python。
- **根目录 `sounds/` 是共享素材输入**：Web 构建会读取这里，不能只下载 `web/` 一个目录。
- **`web/dist/` 是产物**：不要把修复只写进这里，下次构建会覆盖同名文件。

当前实现：三种训练模式、三种瞄准方式、手持枪、音效管理、本地记录；18 段浮动梗视频、5 段全屏视频、6 种程序全屏动画。18 段浮动梗中也含爆炸、烟花、金龙等片段，不是 18 个不同人物。

## 2. 五分钟跑起来

使用 **Node.js 24**（与发布工作流一致）及 npm，检出完整仓库。在仓库根目录运行：

```sh
npm --prefix web ci
npm --prefix web start
```

访问 `http://localhost:8765`。`start` 会先构建，再启动仅监听 `127.0.0.1` 的服务；`Ctrl+C` 停止。不要双击 HTML。

**没有热更新。** 修改源文件后，重新运行 `npm --prefix web run build`，然后刷新页面。服务运行时也可以在另一个终端构建。端口冲突时可以设置 `PORT`；例如 PowerShell：

```powershell
$env:PORT = '8766'
npm --prefix web start
```

依赖由 `package-lock.json` 固定；Three.js 当前为 `0.180.0`。运行时使用构建复制出的 `vendor/`，不是 CDN。测试与构建：

```sh
npm --prefix web test
npm --prefix web run build
```

## 3. 文件地图：需求对应哪里

以下路径相对仓库根目录。

| 文件 | 职责 / 常见修改 |
| --- | --- |
| `web/index.html` | 页面结构、控件 ID、模式卡片、设置、预览按钮及文案 |
| `web/styles.css` | 页面布局、训练时全屏布局、准星、HUD、特效叠层；现有样式较密集，注意后面的覆盖规则 |
| `web/app.js` | 入口和协调层：DOM 事件、Three.js 场景、帧循环、目标生成、射线命中、状态切换、声音、存档 |
| `web/core.mjs` | 不依赖 DOM 的规则：默认值、设置校验、成绩分类、`Session` 计分与计时 |
| `web/gamepad.mjs` | 标准手柄轮询、按键边沿、连发、死区和帧率无关瞄准增量 |
| `web/weapon.js` | `HeldWeapon`，用几何体组成枪和手；独立场景渲染、后坐、枪口闪光、随动 |
| `web/meme-effects.mjs` | 浮动梗、视频抠绿、全屏视频、程序动画、随机混合调度 |
| `web/effects/` | 已压缩的 MP4；`SOURCES.md` 记录来源和处理方式 |
| `sounds/hit/`、`sounds/miss/` | 命中、打空音效的构建输入；根目录 `sounds/w.mp3`、`l.mp3` 用于结算 |
| `web/build.cjs` | 拷贝公共文件、Three.js、视频和音效，生成 `dist/sounds/manifest.json` |
| `web/server.cjs` | 本地静态预览，仅提供 `dist/`，含媒体 MIME 类型 |
| `web/core.test.mjs`、`web/meme-effects.test.mjs` | 规则、特效开关/清理、随机范围、抠绿、异步播放等测试 |
| `desktop/main.cjs`、`desktop/asset-server.cjs` | 离线软件窗口、私有资源协议、CSP、资源路径和媒体 Range 支持 |
| `desktop/smoke.cjs` | 实际打包程序的自动检查：模式、视频/音效、动画、本地存储 |
| `.github/workflows/windows-release.yml` | Windows 构建、验证和标签发布流程；**不是网站发布流程** |

## 4. 游戏运行链路

`app.js` 读取本地设置 → `sanitizeSettings()` 校验 → 创建场景、枪模和特效对象 → 绑定控件 → `requestAnimationFrame` 持续更新。

主要状态：`preview`（首页预览）→ `ready`（等待进入）→ `running`；运行时可进入 `paused` 或 `results`，返回首页回到 `preview`。

| 环节 | 入口 | 修改时注意 |
| --- | --- | --- |
| 初始化场景 / 窗口尺寸 | `initScene()`、`resize()` | 相机、画布比例、靶球活动范围、枪模尺寸一起检查 |
| 生成 / 更新靶球 | `populate()`、`spawn()`、`frame()` | 模式不同，刷新与到期行为不同 |
| 射击 | `pointerDown()` | 射线检测 → `Session.shoot()` → 靶球反馈、枪模、梗与音效 → HUD |
| 开始 / 暂停 / 返回 | `start()`、`activate()`、`pause()`、`home()` | 鼠标锁定是异步的，失败有自由指针回退；暂停不能继续计时 |
| 结算 | `finish(completed)` | 区分正常完成与提前结束；后者不更新最佳成绩 |
| 保存 | `persist()`、`renderRecords()` | UI 显示、存档字段与设置校验要一致 |

第一人称模式用画面中心射线；自由指针模式用鼠标位置射线。Tracking 是**点击射击**，不是按住持续计算伤害。枪模用单独场景覆盖渲染，后坐只影响枪模，不改变中心射线。

计分基线：命中 +1；打空 -1、最低 0，并清连击；Flick 目标到期不扣分，但计入消失数并清连击。`frame()` 将单帧时间步长限制为最多 0.25 秒，失焦/切页另有暂停处理。

## 5. 修改设置、存档和排行榜

存储位置是 `localStorage`，键为 `memeaim-3d-v1`，值包含：

| 字段 | 用途 |
| --- | --- |
| `settings` | 训练、准星、声音、特效参数 |
| `history` | 最近 50 局 |
| `bests` | 按 `configKey()` 分组的最佳成绩 |
| `disabled` | 被关闭音效的资源 URL |

新增设置通常需要同时改 `core.mjs` 的默认值和 `sanitizeSettings()`、HTML 控件、`app.js` 的读取/同步/保存，以及实际使用该值的逻辑。不要只加一个控件。

影响难度的参数需要评估是否加入 `configKey()`，否则不同难度可能混用最佳成绩。现有分类包括模式、时长、半径、有效目标数、速度/停留时间、控制方式。改变分类或存档结构时处理旧数据，不要随意换存储键导致用户记录“消失”。

不同网站域名、本地预览和桌面版记录相互独立。桌面版安装包与免安装包使用同一应用身份和数据目录；Web 不会读写根目录 Python 的 `save_data.json`。

## 6. 梗与全屏特效怎么改

### 浮动梗：`MemeEffects`

- `memeClips.hit` / `.miss` 是两个池，共 18 个唯一视频地址，部分片段共用。各池避免连续选到相同索引。
- `randomLayout()` 决定位置和大小，范围是**训练场容器**；训练场全屏时覆盖全屏范围。保持在边界内，没有底部说明文字，不能拦截鼠标。
- 同种结果间隔至少 950ms，命中/打空切换至少 400ms；浮动层同时只播放一段，最长约 2.6 秒。
- `keyGreen()` 做软抠绿和绿色溢色处理；按最多约 20fps 绘制。视频播放失败、结束或过期会收起。
- 播放 Promise 用 `generation` 区分新旧请求，防止上一个视频的延迟失败把新视频关掉，修改时保留这层保护。

新增浮动梗：

1. 将短、静音、统一编码的 MP4 放到 `web/effects/`。现有素材常用 H.264、`yuv420p`、20fps、约 2 秒，宽度通常 320–480px；竖屏素材按实际比例处理。
2. 在对应池中加入 `{name:'内部名称', url:'effects/xxx.mp4'}`。`name` 不会作为梗底部字幕显示；`kind:'blast'` 会影响 `app.js` 的声音选择。
3. 在 `effects/SOURCES.md` 记录来源、作者、授权说明和裁剪/合成处理；不要把下载素材说成原创。
4. 检查片段首帧和中段，避免整段只有绿色空背景。更新 HTML 中数量文案及测试中的池数量断言。

### 全屏：`MixedScreenEffects`

**两类必须共存，用户明确要求保留：**

| 类型 | 修改位置 | 当前内容 |
| --- | --- | --- |
| 下载视频 | `screenClips`、`ScreenEffects` | 5 段：两种烟花、两种爆炸、卡通火焰 |
| 程序动画 | `particleKinds`、`ParticleScreenEffects.update()` | 6 种：烟花、火焰、爆炸、冲击波、流星、礼花 |
| 混合选择 | `mixedScreenKinds`、`MixedScreenEffects.trigger()` | `video:名称` / `particle:名称` 共 11 种，避免连续重复 |

正常射击触发全屏效果要满足至少 3.6 秒间隔，再经过 40% 随机触发判断；并非每一枪都出现全屏效果。视频约 2.6 秒、超时上限 2.8 秒，动画约 2.2 秒。预览调用的 `force=true` 会绕过开关与冷却，方便试听/预览；这不是正式训练的触发条件。

浮动梗和全屏效果可同时显示；全屏层一次选择一种视频或动画。暂停、结束、返回首页和关闭特效都应停止两个层。全屏视频使用 `object-fit: cover`，窄屏会裁掉两侧，换素材时需检查主体位置。

添加新的全屏视频要放入 `effects/` 并更新 `screenClips`；添加动画要更新 `particleKinds` 和对应绘制分支。不要仅增加名称，落入现有兜底分支却误以为实现了新动画。

## 7. 音效、枪模和 UI 修改提示

- 加音效：放到根目录 `sounds/hit/` 或 `sounds/miss/` 后重新构建，manifest 自动生成。支持 MP3/WAV/OGG；不要只手改产物 manifest。
- 音效播放入口：`playRandom()` / `playUrl()`；合成短音与爆炸声：`beep()` / `boom()`；清理：`stopAudio()`。声音需要用户交互解锁 AudioContext，不能绕开静音或音量设置。
- 梗 MP4 本身静音，声音由游戏层另行播放。换视频不会自动带入视频原声。
- 枪模：修改 `HeldWeapon`，保留 `app.js` 调用的构造、随动、射击、更新、尺寸与渲染接口；调整视觉后不要意外改变命中射线。
- UI：HTML 的 ID 与 `app.js` 直接耦合。删控件、改 ID 后同步事件绑定，否则入口可能因空元素报错停止执行。
- 样式：关注 `playing` 状态、`hidden`、HUD/暂停弹层与特效的层级。特效必须保留 `pointer-events: none`。

## 8. 构建与部署：分清三个出口

### 网站

```sh
npm --prefix web ci
npm --prefix web run build
```

发布 **`web/dist/` 的全部内容** 到静态托管，保持目录结构，建议 HTTPS。`.mjs` 必须返回 JavaScript 类型，MP4 返回 `video/mp4`。相对资源路径支持放在子路径下，新增代码不要随意改成 `/effects/...` 这样的根路径。

`build.cjs` 使用明确的公共文件列表。新建被浏览器导入的模块时，记得加入列表，否则开发源码存在但发布包里缺文件。新建资源目录也要同步拷贝规则。

构建目前**不会清空 `dist/`**。删除或重命名素材后，旧文件可能残留；发布前核对产物，必要时只清理确认属于本项目的 `web/dist/` 再构建。不要把清理范围扩大到仓库根目录。

### 当前维护者的 Sites 副本

现有 Sites 网站由维护者另一个独立工作副本发布；其工作区相对路径是 `outputs/memeaim-web/`，GitHub 仓库本体位于该工作区的 `work/original/`。这两个路径是原维护者的目录安排，不是新开发者必须照搬的项目结构。

**GitHub 中 `web/` 是交接的修改入口。** 修改并推送 GitHub 不会自动更新现有 Sites 网站。若继续维护该网站，需要将游戏源码/素材同步到 Sites 副本并单独发布；它的构建和服务脚本与仓库版不同，不要整目录覆盖，也不要把个人 `.openai` 配置或发布凭据提交进 GitHub。其他开发者可直接把仓库构建产物部署到自己的静态托管。

### Windows 软件

Windows 使用 `desktop/` 的 Electron 外壳，详见 [desktop/README.md](../desktop/README.md)。首次安装依赖后构建与检查：

```sh
npm --prefix desktop ci
npm --prefix desktop run dist
npm --prefix desktop run smoke
```

前提是已安装 `web/` 依赖；`dist` 会重新构建 Web。`desktop/release/` 中提供 Setup.exe 和 Portable.zip，**免安装 ZIP 需要完整解压后运行其中的 EXE**。不要只拎走 EXE，它依赖旁边的 DLL 和资源目录。

之前试过单文件自解压 Portable.exe，本机实测在视频解码时失败；普通展开版与 ZIP 解压版通过，因此最终采用 ZIP。根因未完全定位，不能据此断言某个系统或所有 Electron 版本都有同样问题；若改回自解压格式，重新验证真正下载文件内的音视频。

桌面版通过 `memeaim://app/` 提供离线资源，沙箱启用、Node 不暴露给页面，并拦截 HTTP/HTTPS 请求。新增远程字体、CDN、API、iframe 或需要新权限的功能，会影响离线运行和 CSP，不能只在普通浏览器中测完就发布软件。

## 9. 自动发布和版本更新

现有 `windows-release.yml` 行为：

- 相关 Web / 桌面 / 声音改动的 PR：构建与检查，保存 Actions 产物，不创建 Release。
- 手动 `workflow_dispatch`：构建与检查，保存产物。
- 推送 `v*` 标签：检查标签与 `desktop/package.json` 版本一致，测试、打包、运行展开版、解压 ZIP 并运行，再上传安装包、ZIP 和 SHA256 校验文件到 Releases。
- 普通 `main` 提交不会自动发布新软件，也不会自动更新网站。

发新软件版本时，更新 `desktop/package.json` 的版本及锁文件、`desktop/RELEASE_NOTES.md`，提交后打对应的新标签。不要复用已经发布的标签。现有软件不会自动更新，需要用户下载新包。

## 10. 改完至少这样验

| 改动范围 | 检查重点 |
| --- | --- |
| 计分、目标、参数 | 跑 Web 测试；检查三种模式的命中、打空、到期、倒计时及提前结束 |
| 状态、输入、枪模 | 第一人称锁鼠标/释放、自由指针、Esc、失焦暂停、恢复、全屏及窗口缩放 |
| 梗或全屏效果 | 命中/打空都可触发；随机边界；无附加底部文字；两类全屏效果保留；开关、暂停和快速切换时无残留 |
| 音效 | 试听、训练、静音、音量、停播；网络请求无 404 |
| UI | 首页、训练、记录、声音页和窄屏；控制台无新错误 |
| 存档 | 刷新后仍保留记录；旧配置可恢复；难度分类不混用 |
| 构建/桌面 | 静态产物包含新模块和素材；桌面 smoke 通过；实际 ZIP 解压后能运行 |

基线 Web 测试共 20 项，桌面资源测试 2 项；数量会随维护变化。自动 smoke 能检查资源解码与基本流程，**不能代替人工确认枪感、真实声音输出、全屏裁剪效果或安装向导体验**。

常见问题速查：修改不生效先重新构建并刷新；模块 404 查公共文件列表和相对路径；没声音先确认用户交互、静音、manifest；视频绿色块查素材/抠绿，视频空白查片段时间、解码和网络响应；帧率低优先检查同时解码的视频数、分辨率和 `getImageData()` 开销。

## 11. 当前限制与下一位开发者的起点

当前没有账号、云同步、联网排行榜、自动更新、英文 UI、背景音乐、完整准星线宽/间隙配置，也不是原 Python 版逐项等价移植。WebGL 2、鼠标锁定和媒体策略受浏览器/系统影响；触屏可点按，但主要体验仍是桌面鼠标。

建议接手时先完整跑通一局并阅读 `core.mjs` → `app.js` → 要修改的专门模块。提交说明写清修改目的、影响到 Web 还是也影响桌面、做了哪些验证和哪些还没验证；新增素材同时补来源。单次改动尽量集中，不要为了改一个梗先整体换框架。


## 手柄支持增补（2026-10-16，v1.1.0）

`app.js` 每帧调用 `updateGamepad()`，从 `navigator.getGamepads()` 读取标准布局设备。`GamepadInput` 固定当前设备，记录按键边沿和 RT 连发时刻，连接/失焦/暂停后要求松开按键。右摇杆经 `stickVector()` 径向死区和曲线处理，再由 `lookDelta()` 按帧时间换算视角；不要按固定每帧角度移动，否则刷新率影响手感。

选择手柄后 `inputMode='gamepad'`，直接使用中心准星，不申请鼠标锁定；鼠标射击在此模式禁用，`shoot(x,y)` 是鼠标和手柄共用的命中/计分入口。`settings.gamepadSensitivity` 和 `gamepadDeadzone` 存入原有设置对象，旧存档缺少时取默认值。`configKey()` 的控制方式字段自然隔离手柄成绩。

全流程支持首页切模式、确认、进入、射击、暂停菜单和返回；复杂设置仍可用鼠标调整。只接受 `mapping='standard'`，不猜测原始非标准设备映射。支持 `vibrationActuator.playEffect("dual-rumble")` 时提供开枪/命中震动，开关 `gamepadVibration` 默认打开，异常或不支持时跳过。没有陀螺仪或自定义键位。页面声音仍遵守浏览器用户交互策略。

断线、切换设备和失焦时不能自动射击或恢复训练；保留 `gamepadInput.suspend()` 及重新松开按键的保护。新增公共模块已加入 Web 与 Sites 的构建拷贝列表。`gamepad.test.mjs` 覆盖输入处理；桌面 smoke 在真实渲染循环中注入虚拟标准手柄，测试模式选择、开始、射击、暂停、断线、重连和返回。它不能证明所有实体手柄/驱动兼容。
