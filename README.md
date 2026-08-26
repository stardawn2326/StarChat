# StarChat · Project-008-白音AI助手

- 创建日期：2026-08-20
- 项目编号：008
- 目标：开发人格、声音、表演和外部形象可替换的 StarChat Windows AI 桌宠，未来扩展移动端。
- 技术栈：Electron、React、TypeScript、electron-vite、OpenAI-compatible HTTP API。
- 当前进度：第一阶段桌宠窗口、在线流式对话、角色包、外部 Live2D 模型只读导入/诊断/适配骨架已完成。
- 角色策略：白音是默认人格与视觉参考，不绑定白音专属 PSD、Cubism 工程或分层模型；同一人格可切换到任意合法的外部 Live2D 模型。

## 外部 Live2D 模型支持（当前主路径）

设置界面允许用户选择一个 `.model3.json`，或选择包含唯一 `.model3.json` 的模型目录。程序只读取外部目录，不复制、不修改、不打包外部文件；只把入口路径和生成的适配元数据保存到 Electron 用户数据目录。

当前只读检查包括：

- `FileReferences` 中的 `.moc3`、纹理、physics、CDI3、exp3 和 motion3 引用；
- 模型目录同级的额外 `.exp3.json`、`.motion3.json` 扫描；
- CDI3 参数信息与模型级语义参数映射，例如头部、眼睛、嘴型、呼吸和发束；
- 表情/动作语义路由、资源缺失诊断和未知语义回退到 `neutral`；
- 同目录许可说明、署名、商用/二次发布/二改提示；切换模型前必须确认已获得资源使用许可；
- `.can3` 等编辑器文件仅标记为非 runtime 资源，不会被当作可运行模型。

当前 renderer 已接入单一 Cubism runtime 控制桥：它消费现有 `Live2DAdapterConfig`，提供参数/表情/动作/变换/注视/口型/自动眨眼/指标接口；人格层仍只能发送白名单语义，不直接写 Cubism 参数。外部模型已拆为默认显示的透明 `PetWindow` 与默认隐藏的 `SettingsWindow`；冷启动、真实透明 alpha 和设置显隐已在 Miku 外部资源桌面会话中取证，鼠标/托盘/快捷键及完整动作压力仍待补齐。

## 第一阶段已完成

- 无边框、透明、置顶的 Windows `PetWindow`，以及默认隐藏的 `SettingsWindow` 生命周期；
- 设置界面与普通设置/敏感 API Key 分离持久化；
- OpenAI-compatible `/chat/completions` SSE 流式回复；
- 白音角色包协议与 12 个表情、8 个动作语义白名单；
- 外部 Live2D 入口选择、只读解析、目录扫描、参数映射、语义回退和许可提示；
- 主进程 IPC 隔离，渲染层不接触 API Key，也没有任意系统命令执行能力。

## 运行方式

项目依赖安装需要网络访问包源。Windows PowerShell 可使用工作区提供的运行时：

```powershell
$nodeBin = 'C:\Users\23260\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$pnpm = 'C:\Users\23260\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
$env:PATH = $nodeBin + ';' + $env:PATH
Set-Location '.\code'
& $pnpm install
& $pnpm dev
```

验证命令：

```powershell
& $pnpm typecheck
& $pnpm test
& $pnpm build
& $pnpm package:win
```

`package:win` 会把 Windows portable EXE 输出到项目内的 `outputs/`。外部模型不会随安装包进入 EXE；用户需要在首次启动后重新选择模型路径。

## 默认人格与视觉参考

- 名称：白音
- 身份：18 岁成年女性外观的人类形象 AI 伴侣。
- 外观参考：长白发、紫瞳、月白/淡紫/深灰配色。
- 性格：刀子嘴豆腐心、耐心、傲娇；保留拒绝、吐槽和反驳能力。
- 设定图：`assets/character/白音-统一设定稿-v1.png`，仅作视觉参考，不是 Live2D 分层源。

人格、称呼和关系阶段位于角色包；外部模型只负责视觉表现和模型参数，不反向决定人格。

## 本阶段：全局光标注视与智能点击穿透

本阶段在既有透明 PetWindow 和 Cubism 控制桥上补充了最小垂直切片：主进程以约 30 Hz 读取全局光标屏幕坐标，通过受限 IPC 传给 Pet renderer；renderer 做窗口局部归一化、死区、平滑与限速，并以可配置的眼睛 100%、头部 35%、身体 8% 权重驱动存在性受保护的 Cubism 参数。光标静止约 4 秒后进入自然空闲眼动，重新移动时平滑接管；动作期间头/身体追踪让位，动作结束恢复。

同时补充了锁定后的完全穿透、模型交互区点击、拖动/回中/设置入口所需的最小桥接，以及可复核脚本 `tools/cdp-cursor-interaction-check.ps1`。脚本产生的原始帧与 JSON 位于 `outputs/cursor-interaction-2026-08-21-r10/`，但本次当前运行实例的 Pet renderer 页面为空，截图没有取得模型视觉或参数变化证据，因此这些文件只能作为探针记录，不能视为真实 GUI 验收通过；详见 `logs/cursor-gaze-interaction-2026-08-21.json`。

## 明确不属于当前阶段

完整语音输入输出、本地唤醒词常驻链路、主动观察和电脑控制、Home Assistant、移动端和成人模式尚未完成；Cubism 的真实 GUI 参数/动作回归、鼠标穿透/拖动、托盘物理点击、快捷键物理按键和退出后 GPU 释放证据仍待补齐。旧的 B1 分层/PSD/Cubism 文档与日志保留作历史记录，不再是当前实施计划，也不构成白音专属模型依赖。
