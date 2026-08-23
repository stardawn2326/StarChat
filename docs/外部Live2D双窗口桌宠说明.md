# 外部 Live2D 双窗口桌宠说明

## 当前架构

外部模型优先方向现在由两个 Electron 窗口组成：

- `PetWindow`：透明、无边框、默认显示，只承载真实 Live2D WebGL canvas 和极简状态；模型实例、纹理和 Cubism controller 只在此窗口创建。
- `SettingsWindow`：默认隐藏，承载聊天、API、人格、外部模型导入、许可确认和调试设置；该窗口不加载 Cubism Core，不创建 canvas。

两者使用同一个 preload bridge。设置保存后的公共状态、语义表情/动作事件由主进程转发到 PetWindow；渲染层不能直接发送任意 Cubism 参数。外部模型仍通过 `live2d://model/` 受限只读协议读取，路径、扩展名、真实路径和资源边界均在主进程校验。

## 启动与生命周期

冷启动顺序是先创建隐藏的 SettingsWindow，再显示已经准备好的 PetWindow。设置窗口的关闭按钮只隐藏窗口；托盘“退出白音”才进入 `before-quit`，注销快捷键、销毁托盘并向桌宠运行时发送释放信号。隐藏和再次打开 SettingsWindow 不会重载 PetWindow 的模型。

托盘菜单提供：

- 显示/隐藏设置；
- 显示/隐藏桌宠；
- 退出白音。

默认设置快捷键为 `CommandOrControl+Shift+B`，可在设置中修改。桌宠右键菜单也能打开设置、锁定/解锁位置或退出。

## 桌宠窗口行为

模型窗口支持置顶开关、缩放、X/Y 偏移、显示器选择、锁定位置和边界安全恢复。位置写入用户设置侧的 `petBounds`，不写入外部模型目录。透明输入采用动态策略：透明边缘设置为 passthrough，模型中心和状态区域切回 interactive，避免全窗口永久 `ignoreMouseEvents`；拖动通过受限 IPC 更新窗口位置。

这套输入策略的代码与主进程 IPC 已完成，但鼠标实际点击穿透、拖动、多显示器和 DPI 恢复仍需要人工桌面回归，不能用静态代码检查替代。

## Miku 本轮真实证据

入口仍是只读外部路径：

`D:\BaiduNetdiskDownload\miku\miku\miku.model3.json`

本轮冷启动与 CDP 证据：

- `PetWindow` 可见，`SettingsWindow` 隐藏；
- Pet 页面显示 `LIVE2D · WEBGL` 与 `真实 Cubism WebGL 已启动 · 外部资源只读引用`；
- Pet 只有一个 WebGL canvas，`alpha=true`，角落像素为 `[0,0,0,0]`；
- Settings 页面 canvas 数量为 `0`；
- 打开/隐藏设置回读分别为 `{petVisible:true,settingsVisible:true}` 与 `{petVisible:true,settingsVisible:false}`；
- 截图保留模型自带水印与许可说明，未删除或固化关闭状态。

证据文件：

- [`outputs/pet-window-transparent.png`](../outputs/pet-window-transparent.png)
- [`outputs/settings-window.png`](../outputs/settings-window.png)
- [`outputs/pet-window-toggle-check.png`](../outputs/pet-window-toggle-check.png)
- [`logs/miku-real-transparent-rendering-2026-08-21.json`](../logs/miku-real-transparent-rendering-2026-08-21.json)

## 尚未宣称完成的项目

真实窗口拆分已验证到冷启动、透明 framebuffer、设置隐藏/显示和单 canvas 边界；以下仍未取得完整 GUI 证据：鼠标穿透/拖动逐项行为、托盘真实点击、全局快捷键物理按键、退出后的 GPU 资源读数、50 轮真实压力、模型切换后回切、逐个 exp3/motion3 视觉动作和全参数回归。

Miku 仅作为合法来源下的本机非商用测试夹具。模型不复制、不修改、不打包、不重新发布；若内部截图或录屏对外发布，必须保留人物绘制“玄宝酱”、人物建模“怂怂koe”的署名。
