# MemeAim 3D-DeepSeek V41 桌面版

`dpsk` 分支专用外壳，版本 1.0.0。安装身份 `io.github.passerbyask.memeaim.dpsk`，窗口名 `MemeAim 3D-DeepSeek V41`。应用数据目录单独命名，可与 main 版并存。

游戏源文件在 `../dpsk/src/`，构建为含全部素材的单文件 `../dpsk/dist/index.html`，再随 Electron 打包。渲染页启用沙箱、不暴露 Node；内联脚本按实际内容生成 CSP 哈希，音视频仅使用本地内嵌数据。

在仓库根目录运行：

```sh
npm --prefix desktop ci
node dpsk/tests/store.cjs
npm --prefix desktop test
npm --prefix desktop run dist
npm --prefix desktop run smoke
```

产物在 `desktop/release/`，提供 Setup.exe、Portable.zip。免安装 ZIP 需要完整解压，不要只复制 EXE。Windows 10/11 x64；当前没有商业代码签名。

工作流只接受 `dpsk-v*` 标签，版本必须等于 `desktop/package.json` 的版本。自动构建、检查打包程序、解压 ZIP 检查后再发布。正式 Release 不设为 Latest，保留 main 版的默认下载入口；不部署网站。手动运行只保存构建产物。

自动检查覆盖六模式、命中/打空/跟枪、暂停、结算、记录保存、全部内嵌音视频解码及默认静音；不代表实际音响输出、显示器 HDR 亮度或安装向导已人工体验。
