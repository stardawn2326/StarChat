# StarChat 工作台真实调用链与功能矩阵

## Codex 来源审计与架构映射

审计日期：2026-08-26。官方源码固定提交：
[`f5420174dafba153913a3e697f89002c338dfd7e`](https://github.com/openai/codex/commit/f5420174dafba153913a3e697f89002c338dfd7e)。本机
`C:\Users\23260\AppData\Local\OpenAI\Codex` 只读检查到二进制和 CUA 运行时包；安装目录中除 `cua_node` 下的通用
`@oai/sky` 类型外，没有可读取的 Codex Desktop 源码、source map 或协议实现。因此不反编译、不修改安装，也不把
Desktop 私有实现当作已知事实。公开协议参考为 [app-server README](https://github.com/openai/codex/blob/f5420174dafba153913a3e697f89002c338dfd7e/codex-rs/app-server/README.md)、
[app-server protocol](https://github.com/openai/codex/tree/f5420174dafba153913a3e697f89002c338dfd7e/codex-rs/app-server-protocol)、
[TypeScript SDK](https://github.com/openai/codex/tree/f5420174dafba153913a3e697f89002c338dfd7e/sdk/typescript) 和
[OpenAI Responses streaming 文档](https://platform.openai.com/docs/api-reference/responses-streaming/response/web_search_call?lang=curl)。

| Codex 源模块（固定提交） | StarChat 模块 | 处理决定 |
| --- | --- | --- |
| `codex-rs/app-server/src/request_processors/thread_processor.rs`；`codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs` 的 `Thread` | `code/src/renderer/src/App.tsx` 的 `conversationKey`、`AgentWorkbench.tsx` 左侧会话行、`CompanionChat.tsx` | 适配为一个明确的 active session：保留稳定会话键、标题和消息计数；当前架构只承诺单会话，移除虚假历史，不声称已有 Codex durable thread store。 |
| `codex-rs/app-server-protocol/src/protocol/v2/thread.rs` 的 `ThreadStart/Resume/Read/TurnsList/ItemsList`；`sdk/typescript/src/codex.ts` 的 `startThread/resumeThread` | `code/src/renderer/src/App.tsx` 的新对话重置，`code/src/shared/ipc.ts` 的 chat/agent 契约 | 只复用“创建/恢复/读取是不同生命周期”的边界；本迭代不实现多会话恢复、fork、归档、分页历史，新增对话以卸载并取消当前请求的单会话清空实现。 |
| `codex-rs/app-server-protocol/src/protocol/v2/turn.rs`；`codex-rs/app-server/src/request_processors/turn_processor.rs` | `code/src/renderer/src/CompanionChat.tsx` → preload `chat.start/cancel/onEvent` → main chat handlers | 适配为 request id 关联的输入、流式 delta、完成、失败和取消；保留输入校验和错误显式显示，不把聊天 promise 的返回当作“已完成”事件。 |
| `codex-rs/app-server-protocol/src/protocol/v2/item.rs`；`codex-rs/app-server-protocol/src/protocol/event_mapping.rs`；`sdk/typescript/src/events.ts`、`items.ts` | `code/src/renderer/src/CompanionChat.tsx` 的消息投影、`AgentConsole.tsx` 的步骤投影、`code/src/shared/agent.ts` | 适配“事件先到、item/task 后定稿”的投影方式：delta 更新当前 assistant 消息，完成事件落最终消息，工具状态落 AgentStep/ToolInvocation；不展示未授权的原始推理或私有协议字段。 |
| `codex-rs/core/src/state/turn.rs` 的 `ActiveTurn/RunningTask/TurnState`；`codex-rs/core/src/tasks/regular.rs` | `code/src/main/agent-runtime.ts`、`agent-service.ts`、`shared/agent.ts`、preload `agent.*`、`AgentTaskPanel` | 适配为 StarChat AgentTask 状态机：queued → running → waiting_for_approval/waiting_for_input → completed/failed/cancelled/timed_out/interrupted；每个任务保存步骤、当前请求和取消控制器。 |
| `codex-rs/app-server/src/outgoing_message.rs`；`codex-rs/app-server-protocol/src/protocol/common.rs` 的 `ServerRequestPayload` 与 `ServerRequest` | `code/src/main/agent-service.ts` 的 `approval/input` 请求；preload `agent.approve/respond/cancel` | 复用“服务端请求必须有 opaque callback id、回调完成后清理”的原则；StarChat 用 `taskId + requestId + invocationId` 做匹配并过期拒绝，未复制 JSON-RPC 实现。 |
| `codex-rs/app-server-protocol/src/protocol/common.rs` 的 `CommandExecutionRequestApproval`、`FileChangeRequestApproval`、`ToolRequestUserInput`、`PermissionsRequestApproval`；`v2/item.rs`、`v2/permissions.rs` | `code/src/main/agent-tools.ts` 的审批/补充输入工具，`CompanionChat.tsx` 的批准/拒绝/回复按钮 | 适配批准、拒绝、补充输入和取消的真实 IPC 链路；写入补丁仍需精确计划批准。没有把“拒绝”当成成功，也没有开放任意命令、权限升级或浏览器访问。 |
| `codex-rs/app-server/src/thread_status.rs`；`v2/thread.rs` 的 `ThreadStatus/ThreadActiveFlag` | `code/src/shared/agent.ts` 的 AgentTaskStatus、`AgentConsole.tsx`、`AgentWorkbench.tsx` 底部受控日志 | 复用“运行中”和“等待审批/等待输入”是可观察状态；映射成 StarChat 任务标签与步骤。没有伪造 Codex thread watcher 或将静态页面状态称为运行中。 |
| `codex-rs/app-server-protocol/src/protocol/v2/environment.rs`；`codex-rs/app-server/src/request_processors/environment_processor.rs`；`codex-rs/worktree/src/git.rs`、`metadata.rs` | `code/src/main/workbench-service.ts`、`code/src/shared/workbench.ts`、`AgentWorkbench.tsx` 环境浮层/资源/源码面板 | 适配为真实本地工作树快照：绝对路径校验、真实 Git root/HEAD/分支/状态/变更文件、受控目录读取和刷新；Git 只读且不固定为 `main`，不实现 worktree 绑定/移动。 |
| `codex-rs/app-server-protocol/src/protocol/v2/project.rs` 与 README 的 project/thread assignment | `AgentWorkbench.tsx` 左侧项目与单会话展示 | 只借鉴“项目身份与线程归属应由后端状态提供”；当前 StarChat 没有 project store，因此展示真实授权工作区和一个 active session，不实现虚假项目列表、项目 CRUD 或线程迁移。 |
| `codex-rs/app-server-protocol/src/protocol/v2/permissions.rs`；`codex-rs/core/src/tools/approvals.rs`；`code/src/main/agent-security.ts`、`agent-tools.ts` | WorkspaceGuard、只读 `git_status/git_diff`、审批后受控 patch、明确禁用入口 | 适配 capability/permission 的 fail-closed 边界：越界、符号链接、敏感文件和未授权写入被拒；不实现 `dangerFullAccess`、任意 shell、任意 Git 写入、可输入终端或未授权浏览器。 |
| `codex-rs/app-server-protocol/src/protocol/v2/config.rs`、`thread.rs` 的 settings update；README 的 `config/read`/`config/value/write` | `code/src/main/settings-store.ts`、`SettingsHome.tsx`、`SettingsDetailsV2.tsx`、既有 settings/roles/voices/live2d/debug IPC | 不复制 Codex 配置协议；适配为现有本地 JSON 设置体系，保留 chat/personality/model/voice/service/behavior、角色、密钥、主题、窗口与调试配置的可达性和保存效果。外部 Live2D 源文件仍只读。 |
| `codex-rs/app-server-protocol/src/protocol/v2/command_exec.rs`、`fs.rs`、`browser_use_config.rs`；README 的 `thread/shellCommand`、`command/exec`、`process/*` | `AgentWorkbench.tsx` 右侧入口与底部区域 | 只保留资源/源码只读面板和 Agent 任务日志；“终端”准确命名为“受控验证日志”，浏览器明确禁用。未授权或无后端的入口必须可见地 disabled，不做点击无反应的假按钮。 |
| OpenAI 官方 [Developer quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request) 与 [Responses streaming events](https://platform.openai.com/docs/api-reference/responses-streaming/response/web_search_call?lang=curl) | `code/src/main/agent-runtime.ts` 的 model/tool loop 与 `CompanionChat.tsx` 的流式投影 | 仅参考“流式事件逐步投影、最终事件定稿”的公开模式；底层仍走项目现有 provider/Agent Runtime，不宣称 StarChat 已实现 Codex app-server 或 OpenAI Responses 全量协议。 |

## 按映射调整后的实施计划

1. 以 `conversationKey`、request/task/invocation id 为关联主键，先补失败测试覆盖新对话、流式/错误/取消、审批/补充输入和入口禁用语义。
2. 保持 `AgentService` 与 `AgentRuntime` 的安全工具白名单，补齐真实环境快照、只读 Git、设置保存及窗口 IPC；不引入 Codex 私有协议、不开放任意 Shell/浏览器/Git 写入。
3. 对每个面板只投影可验证的后端状态：任务步骤、审批状态、资源目录、Git 状态、设置值；没有后端的能力明确禁用或改名。
4. 先跑自动化测试、typecheck、build、diff-check，再做真实 Electron 点击/路由/窗口 IPC 证据；代码、自动化、真实 GUI、PetWindow/Live2D 分开报告。
5. 以小提交交付，最终列出固定提交、实际源码路径、映射决策和仍受限功能；不打包、不修改外部 Live2D 资产。

## 调用链

```text
工作台 React
  ├─ 新对话 → App.startNewConversation → conversationKey 变化 → CompanionChat 卸载清空本地消息并取消活动请求
  ├─ 文本输入 → preload chat.start → main chat:start → AgentService / CompanionChat → chat.onEvent 流式 delta/complete/error
  ├─ Agent 任务 → main agent:start / agent:approve / agent:respond / agent:cancel → AgentStore → App.agent.onEvent → AgentTaskPanel/受控验证日志
  ├─ 工作区工具 → preload workbench.inspect → main WorkbenchService → WorkspaceGuard + git 只读命令 → 资源/源码面板
  ├─ 环境分享 → preload workbench.share → main WorkbenchService → clipboard.writeText（只读摘要）
  ├─ 设置 → hash 路由 → SettingsHome/SettingsDetailsV2 → 既有 settings/roles/live2d/voices/debug IPC
  └─ 窗口控制 → preload window:minimize/hide/toggle-maximize → main sender 校验 → BrowserWindow
```

## 功能矩阵

| 入口 | 当前行为 | 后端/状态 | 安全边界 |
| --- | --- | --- | --- |
| 新对话 | 清空当前渲染会话并回到工作台 | `conversationKey`、会话标题和消息计数 | 单会话诚实实现；卸载时取消活动请求 |
| Agent 输入器 | 文本发送、流式回复、停止、错误、审批、补充输入、取消 | `chat` 与 `agent` IPC、`AgentStore`、`AgentService` | 继续使用既有路由、审批和工具白名单 |
| 资源管理器 | 展示授权工作区的安全目录项 | `workbench:inspect(resources)`、`WorkspaceGuard` | 排除敏感文件、符号链接和越界路径 |
| 源代码管理 | 展示真实 Git 根目录、HEAD/分支、状态、变更文件 | `workbench:inspect(source)`、只读 `git` | 不提供提交、写入、补丁或任意 Git 命令 |
| 任务管理 | 打开底部 Agent 任务日志，可停止活动任务 | `agent:list/get/onEvent/cancel` | 任务取消仍经 Agent IPC |
| 终端 | 打开“受控验证日志” | 白名单验证任务与 Agent 状态 | 明确不提供 PowerShell/Shell 输入 |
| 浏览器 | 显示“未启用”且不可点击 | 无后端 | 不伪造浏览器能力 |
| 侧边聊天 | 回到当前 Agent 会话 | 当前单会话状态 | 不伪造历史会话 |
| 设置 | 六个设置域、模型/角色/语音/API/主题/窗口/调试配置均沿既有 IPC 保存 | hash 路由 + settings/roles/live2d/voices/debug IPC | 外部 Live2D 源文件保持只读 |
| 分享 | 复制真实环境摘要 | `clipboard.writeText` | 只复制路径、Git 状态和数量，不读取敏感内容 |
| 最大化/恢复 | 切换 BrowserWindow 状态并更新按钮语义 | `window:toggle-maximize` | 仅允许设置窗口发送者调用 |

## 证据边界

自动化测试、类型检查、构建和 `git diff --check` 只能证明静态/自动化契约；不能替代真实 Electron 中的点击、流式网络回复、透明 PetWindow 和多显示器行为验收。浏览器入口当前是明确禁用状态，任意 Shell 输入也保持禁用。
