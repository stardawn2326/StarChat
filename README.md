# StarChat

- 创建日期：2026-08-20
- 项目编号：008
- 目标：开发人格、声音、表演和外部形象可替换的 StarChat Windows AI 桌宠，未来扩展移动端。
- 技术栈：Electron、React、TypeScript、electron-vite、OpenAI-compatible HTTP API。
- 当前进度：StarChat Agent 工作台、桌宠窗口、在线流式对话、角色包、外部 Live2D 模型只读导入/诊断/适配骨架已完成。
- 角色策略：StarChat 是默认中性角色；白音作为内置可选角色包保留。角色人格与外部 Live2D 模型相互独立，可组合使用任意合法模型。

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
- StarChat 默认角色、白音内置角色包，以及受限的表情/动作语义白名单；
- 外部 Live2D 入口选择、只读解析、目录扫描、参数映射、语义回退和许可提示；
- 主进程 IPC 隔离，渲染层不接触 API Key，也没有任意系统命令执行能力。

## StarChat V1 Agent 工作台

主工作台已从概念卡片推进为可操作的本地 Agent 外壳：

- 资源管理器支持在当前授权工作区内逐级浏览目录，并安全预览文本文件；
- 源代码管理展示只读变更列表和单文件 diff；仅在工作区为 `trusted-execution` 时允许用户确认提交已暂存变更，仍不提供自动暂存、推送或远程操作；
- 任务管理展示会话任务、步骤、审批和输入请求，并允许批准、拒绝、回复或取消；
- “终端”是受控验证页，只能运行项目声明的 `test`、`typecheck`、`build`、`verify:live2d` 白名单脚本，不接受 PowerShell、Shell 或任意命令；
- 侧边聊天回到持久会话；浏览器卡片明确标记为未启用，不伪装成可用功能；
- 左栏、右栏和底部验证栏均可折叠、展开和调整尺寸；右栏在底栏开启及 150% DPI 下仍保持在可视窗口内。

V1 的安全边界沿用本地工作区授权、受限 IPC 和显式审批。任意 Shell、浏览器自动化、Agent 自动 Git 提交/推送，以及远程凭据操作不属于工作台闭环；用户主动提交已暂存内容仍受 `trusted-execution`、Git Hooks 提示和统一 GitRunner 约束。

## Phase A：工作区与 Agent 安全基线

- 启动时创建独立的“个人空间”会话；个人空间可以继续陪伴对话，但不会隐式获得项目文件或执行权限。
- 选择工作区后才进入项目会话。每个工作区有 `untrusted`、`read-only`、`trusted-execution` 三档信任状态，新工作区默认不信任。
- Agent 的创建、更新、删除文件都先生成精确计划并等待审批；审批计划发生任何变化都会被拒绝。路径、敏感文件、符号链接、文本大小和变更数量均受限制。
- 验证脚本和 Git 只读命令通过受控子进程运行：禁用 Shell，限制命令、参数、工作目录、超时和输出大小；Git 根目录必须与授权工作区一致。
- Agent 工具注册直接由信任级别决定：`read-only` 不注册任何写入工具；`untrusted` 允许逐次审批写入但不执行脚本；`trusted-execution` 才注册白名单验证脚本。写入审批前预留工作区写锁，任务结束、取消、失败、超时、拒绝或应用关闭时释放。
- Workbench、Agent 和 Git 边界统一使用受控 `GitRunner`；应用不自动 `git add`，用户提交可能触发 Git Hooks，Agent 不拥有 `commit`、`push`、`pull` 或远程凭据能力。
- API Key 通过 Electron `safeStorage` 持久化；系统安全存储不可用时不会保存新的明文 API Key。旧版本明文配置只在可迁移时转换为密文。
- 主进程 IPC 对工作台、桌宠和设置能力做窗口来源校验。内部 Agent 不包含 GitHub 推送能力；代码发布由明确的人工 Git 操作完成。

## Phase B Companion V1

- `MemoryStore` 将资料记忆、重要事件和会话摘要写入用户数据目录的 `memory.json`，采用原子替换、数量上限和敏感信息过滤；默认每 20 条消息或上下文字符达到阈值生成摘要。
- `MemoryExtractor` 只从用户明确陈述中提取资料记忆，支持设置页查看、逐条删除和清空当前角色记忆；API Key、密码、Token、私钥、证件及银行卡等内容不会写入。
- 对话请求按关键词、短语、重要性和新鲜度检索最多 8 条结构化记忆；长期记忆开关关闭时停止写入和召回，不自动发送消息。
- `RelationshipEngine` 根据熟悉度、信任、冲突和连续性推导关系阶段，支持普通互动、积极互动、个人披露、共享事件、冲突、修复、长期离开和回归等事件。
- 对话输入提供可替换的手动 STT Provider；点击麦克风后填充输入框，基础 VAD 在约 1.4 秒静音后停止监听，必须由用户确认发送，不启用唤醒词或自动发送。

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

## 内置可选角色：白音

- 名称：白音
- 身份：18 岁成年女性外观的人类形象 AI 伴侣。
- 外观参考：长白发、紫瞳、月白/淡紫/深灰配色。
- 性格：刀子嘴豆腐心、耐心、傲娇；保留拒绝、吐槽和反驳能力。
- 设定图：`assets/character/白音-统一设定稿-v1.png`，仅作视觉参考，不是 Live2D 分层源。

StarChat 默认角色不绑定固定人物模型。白音的人格、称呼和关系阶段位于独立角色包；外部模型只负责视觉表现和模型参数，不反向决定人格。

## 本阶段：全局光标注视与智能点击穿透

本阶段在既有透明 PetWindow 和 Cubism 控制桥上补充了最小垂直切片：主进程以约 30 Hz 读取全局光标屏幕坐标，通过受限 IPC 传给 Pet renderer；renderer 做窗口局部归一化、死区、平滑与限速，并以可配置的眼睛 100%、头部 35%、身体 8% 权重驱动存在性受保护的 Cubism 参数。光标静止约 4 秒后进入自然空闲眼动，重新移动时平滑接管；动作期间头/身体追踪让位，动作结束恢复。

同时补充了锁定后的完全穿透、模型交互区点击、拖动/回中/设置入口所需的最小桥接，以及可复核脚本 `tools/cdp-cursor-interaction-check.ps1`。脚本产生的原始帧与 JSON 位于 `outputs/cursor-interaction-2026-08-21-r10/`，但本次当前运行实例的 Pet renderer 页面为空，截图没有取得模型视觉或参数变化证据，因此这些文件只能作为探针记录，不能视为真实 GUI 验收通过；详见 `logs/cursor-gaze-interaction-2026-08-21.json`。

## 明确不属于当前阶段

持续唤醒词、本地常驻监听、主动观察和电脑控制、Home Assistant、移动端和成人模式尚未完成；当前 STT 仅是浏览器 SpeechRecognition 的手动输入适配，VAD 仅负责静音结束监听。Cubism 的真实 GUI 参数/动作回归、鼠标穿透/拖动、托盘物理点击、快捷键物理按键和退出后 GPU 释放证据仍待补齐。旧的 B1 分层/PSD/Cubism 文档与日志保留作历史记录，不再是当前实施计划，也不构成白音专属模型依赖。
