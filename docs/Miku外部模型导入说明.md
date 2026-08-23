# Miku 外部模型导入说明

## 定位

Miku 是本项目的外部只读兼容测试夹具，不是白音专属模型，也不会进入角色包、项目资源目录、portable EXE 或仓库发布物。当前产品方向是“外部 Live2D 优先”：白音人格与视觉参考保持独立，模型只提供视觉资源、参数、表情和动作。

本次测试入口：

```text
D:\BaiduNetdiskDownload\miku\miku\miku.model3.json
```

程序保存的是用户选择的入口路径和用户数据目录中的模型级适配元数据；不会复制、重命名、修改或写入 D 盘模型目录。

## 许可边界

同目录说明文件给出的限制已记录到机器报告：

- 人物绘制：玄宝酱；人物建模：怂怂koe。
- 可免费作为桌宠或 VTube Studio 面捕使用。
- 禁止二传、二改、商用、盈利直播和违法用途。
- 水印按键默认打开；测试不删除水印资源，也不把关闭状态固化为绕过许可。
- 若内部测试截图或视频将对外发布，必须保留上述署名；本次报告和内部证据只放在项目 `logs/` 内。

导入或切换模型时，设置界面必须勾选“已获得该外部模型及其纹理、表情、动作资源的使用许可”。未知许可条款不会被推断为允许商用。

## 导入方法

设置界面支持两种入口：

1. 选择一个 `.model3.json` 文件；
2. 选择一个包含唯一 `.model3.json` 的目录。

主进程只接受 `model3.json` 或模型目录，拒绝脚本、可执行文件和目录外资源引用。导入器读取 `Version`、`FileReferences`、JSON 元数据和 PNG 头；不会执行外部文件。

兼容范围是 Cubism 3/4/5 的 `model3` 兼容格式（当前 Miku 的 JSON `Version` 为 3）。同目录扫描结果分为：

- `.exp3.json`：解析 `Parameters`，记录每个实际参数 ID、值和 Blend；
- `.motion3.json`：解析 Meta、曲线数量和曲线 ID；
- `.can3`：只记录存在，明确标为编辑器动画，不作为浏览器运行时动作。

适配文件保存在 Electron 用户数据目录的 `live2d-adapter.json`，与普通 `settings.json` 分开；外部模型仍是路径引用。模型路径改变时会重新生成适配数据，并在切换前要求许可确认。

## Miku 只读检查结果

报告由导入器实际读取外部文件生成：

- model3 / physics3 / cdi3：解析通过；
- moc3：存在且可读；
- 6 张纹理：PNG 头有效，全部为 `4096 × 4096`；
- 同目录 exp3：8 个全部解析通过；
- 同目录 motion3：`Scene1.motion3.json` 解析通过，记录 5 条曲线；
- `Untitled Animation.can3`：存在，已标记为编辑器文件；
- 16 个标准参数语义目标：在 cdi3 中全部找到；
- 机器报告：31 项静态检查通过、0 项失败、11 项真实 runtime/视觉项未验证。

机器可读报告：[`logs/miku-external-model-verification.json`](../logs/miku-external-model-verification.json)

## 验证命令

在 `code/` 目录使用工作区运行时：

```powershell
& $pnpm typecheck
& $pnpm test
$env:BAOYIN_MIKU_MODEL_ENTRY = 'D:\BaiduNetdiskDownload\miku\miku\miku.model3.json'
& $pnpm verify:live2d
```

测试夹具位于 `code/src/main/live2d-importer.test.ts`，会在临时目录模拟缺失纹理、损坏 JSON、越界引用和脚本路径；不会改写 D 盘源模型。

## 2026-08-21 Web SDK 真实透明渲染追加

用户提供的 `C:\Users\23260\Downloads\CubismSdkForWeb-5-r.5.zip` 已作为本地 SDK 输入。项目只提取官方 Core、Framework、示例 TypeScript 源码和许可证文件；没有提取 SDK 样例模型，也没有复制 Miku。真实渲染启动链为：

```text
外部 miku.model3.json
  -> live2d://model/ 受限只读资源协议
  -> Cubism Core + Framework
  -> WebGL2 alpha framebuffer
  -> Electron transparent BrowserWindow
```

本次已直接验证：

- Electron 页面显示真实 Miku 模型，不再是 CSS 占位；
- WebGL2 context `alpha=true`，画布角落像素为 `[0, 0, 0, 0]`；
- 截图保留模型自带水印/许可说明文字；
- 外部资源仍从 `D:\BaiduNetdiskDownload\miku\miku` 读取，项目没有写回模型目录。

截图：[`outputs/live2d-real-transparent-window.png`](../outputs/live2d-real-transparent-window.png)。追加机器报告：[`logs/miku-real-transparent-rendering-2026-08-21.json`](../logs/miku-real-transparent-rendering-2026-08-21.json)。旧的静态报告仍保留其原始 `not_verified=11` 结果，不覆盖、不改写。

## 当前仍未验证项

本次真实渲染只覆盖初始模型加载、透明 framebuffer 和水印保留。以下仍不能由初始截图代替：头部极值与回中、独立/同步眨眼、眼球和眉毛画面、嘴型与音量口型、physics3 回弹、逐个 exp3 触发/恢复 neutral、Scene1 播放/停止/中断、50 次真实渲染压力、模型切换后的 GPU/纹理释放，以及水印开关的真实视觉切换。它们已在追加报告中保留为 `not_verified`，没有把初始渲染证据扩张成完整功能声明。

## 2026-08-21 双窗口桌宠追加

当前真实渲染入口已从设置/聊天合并窗口拆为独立 `PetWindow` 与隐藏 `SettingsWindow`。PetWindow 独占 Cubism/WebGL 实例；SettingsWindow 页面不包含 canvas，不会创建第二个 runtime。冷启动、设置显示/隐藏、Pet WebGL `alpha=true` 与 `[0,0,0,0]` 角落像素已通过 Electron CDP 回读，截图和机器报告见 [`docs/外部Live2D双窗口桌宠说明.md`](外部Live2D双窗口桌宠说明.md) 与 [`logs/miku-real-transparent-rendering-2026-08-21.json`](../logs/miku-real-transparent-rendering-2026-08-21.json)。鼠标穿透、拖动、托盘真实点击、快捷键物理按键、退出后 GPU 读数和完整参数/动作压力仍标为未验证。
