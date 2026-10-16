# MemeAim 3D Windows 软件

这是现有 3D 网页版的离线桌面发行版。Electron 随包提供 Chromium，页面、Three.js、音效和视频全部打进安装包，玩家不需要安装 Node.js、Python 或启动浏览器服务。

## 下载与运行

在仓库的 **Releases** 中选择 Windows x64 文件：

- `MemeAim-3D-版本-Windows-x64-Portable.zip`：免安装，完整解压到一个文件夹后双击 `MemeAim 3D.exe`。
- `MemeAim-3D-版本-Windows-x64-Setup.exe`：安装向导，可选安装目录，创建桌面快捷方式。
- `SHA256SUMS.txt`：两个下载文件的 SHA-256 校验值。

适用于 Windows 10 / 11 64 位。电脑需支持 WebGL 2；显卡驱动会影响 3D 性能。当前安装包未做商业代码签名，Windows 可能显示未知发布者。

操作与网页版本一致，额外支持 F11 切换窗口全屏。设置与成绩保存在当前 Windows 用户的应用数据目录；安装版与免安装版使用同一份记录，与浏览器内的网页记录独立。卸载默认保留记录。

## 手柄测试与陀螺仪

顶部「手柄测试」可测摇杆、死区、漂移、扳机、按键和短震动。DualSense / Edge 可通过连接按钮授权读取体感，放稳两秒校准后，在手柄训练中开启；默认按住 LT / L2 生效。Xbox 标准输入不提供陀螺仪。飞智等其他型号只有在已有驱动提供 Cemuhook DSU 运动输出时，才可通过本机服务入口接入；默认端口 26760，槽位 1–4。软件不自带品牌专有驱动，详见 [Web 体感说明](../web/MOTION.md)。

## 本地开发与构建

开发者需要 Node.js 24、npm 和完整仓库。在仓库根目录执行：

```sh
npm --prefix web ci
npm --prefix desktop ci
npm --prefix desktop start
```

Windows x64 安装版及免安装版：

```sh
npm --prefix web test
npm --prefix desktop test
npm --prefix desktop run dist
npm --prefix desktop run smoke
```

输出在 `desktop/release/`。`win-unpacked/` 是用于验证的展开版，安装版 `.exe` 和免安装版 `.zip` 才是给玩家的下载文件。不要把 `desktop/node_modules/` 或 `desktop/release/` 提交到 Git。

`smoke` 隐藏启动实际打包后的程序，使用临时用户目录，检查 3D 初始化、三个模式、暂停、全部梗视频和全屏视频解码、音效、动画及本地存储。不会修改玩家现有成绩。完整的手动枪感、声音输出与安装向导仍可在发布前补充体验。

## GitHub Actions 发布

工作流位于 `.github/workflows/windows-release.yml`。手动运行 Actions 会构建并保存下载产物；相关 PR 也会执行构建验证。推送 `v*` 标签时，验证成功后自动创建 GitHub Release 并上传安装版 `.exe` 和免安装版 `.zip` 和校验文件。

发布新版本：

1. 修改 `desktop/package.json` 的 `version`，在 `desktop/` 内运行 `npm install --package-lock-only` 同步锁文件。
2. 更新 `desktop/RELEASE_NOTES.md`，提交并推送代码。
3. 给该提交打与版本对应的标签，例如 `v1.0.1`，再推送标签。
4. 等待 Windows 构建及打包程序验证成功，Releases 中会出现下载文件。

工作流检查标签与软件版本一致。正式发布仅在标签事件中执行，PR 验证不会发布。首次或后续发布都不需要把个人 GitHub token 写入仓库，使用 Actions 自带的短期权限。

## 源码与素材

`desktop/` 只负责窗口、离线资源加载及打包；游戏逻辑继续共用 `web/`。旧 Python / pygame 源码保留在根目录，本发行包不包含旧的 Python 可执行文件、存档或构建缓存。

Three.js 许可证随资源包附带；梗视频及特效素材来源记录在 `web/effects/SOURCES.md`。素材权利仍属于各自权利人。
