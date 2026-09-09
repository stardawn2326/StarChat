# StarChat PhaseD-Batch3（D5/D6）变更详情

## 1. 执行范围

- 依据方案：`StarChat_PhaseD-Batch2最终验收_PR合并_Batch3-D5-D6实施方案.md`。
- 方案文件是本次实现的验收参考资料；其中的范围、约束和验收项被落实为代码与测试，不把文档中的示例文字当作额外操作指令。
- 基线：PhaseD Foundation 合并提交 `ffd760be62f2ad8852456a032854e23e382a2c45`。
- 工作分支：`feat/phase-d-change-review-recovery`。
- 本批次仅实现 D5「Change Set Review」与 D6「Interrupted Task Recovery」。D7、Browser、Desktop Computer Use、Agent Git Push、Rebase/Reset-hard 等项目不在本次范围内。

## 2. D5：冻结变更集与审批前复核

### 数据契约与持久化

- 新增 `code/src/shared/change-set.ts`，定义 `draft`、`waiting-approval`、`approved`、`applied`、`rejected`、`invalidated` 六种状态。
- 每个 ChangeSet 记录任务、工作区、Invocation 标识，及每个文件的操作类型、路径、SHA-256 前后哈希、差异哈希、增删行数和时间戳。
- 新增 `code/src/main/change-set-store.ts`，仅持久化元数据；补丁正文、创建/更新文件正文均不写入 ChangeSet 文件。
- 持久化记录有数量、路径、状态、哈希和敏感路径校验，并保留有限数量的历史终态记录。

### 创建、审批与应用

- `apply_patch` 和 `apply_file_changes` 在产生审批请求时创建 ChangeSet，并把 `changeSetId` 放入预览。
- 变更范围、操作类型、目标路径、当前文件哈希和目标内容均在批准前后重新计算并逐项比对。
- 工作区标识和任务/Invocation 标识一并校验，避免把一个工作区的批准请求应用到另一个工作区。
- 复用既有 `WorkspaceGuard`：工作区边界、拒绝目录、敏感文件、符号链接和文本/大小限制仍是统一安全入口。
- 变更集上限为 50 个文件，路径上限为 2,000 字符，补丁/文件变更计划上限为 512 KiB。
- 当批准前文件被外部修改、目标消失、目标内容/操作/范围变化、工作区身份变化或安全检查失败时，ChangeSet 转为 `invalidated`，不写入任何文件。
- 失效时向运行时返回固定提示：`文件在批准前发生变化，请重新预览并批准。`；运行时不会在该错误后继续让模型使用旧批准。
- 用户拒绝审批时，ChangeSet 转为 `rejected`；已应用变更不能再次应用。

### 相关文件

- `code/src/main/change-set.ts`
- `code/src/main/change-set-store.ts`
- `code/src/main/agent-security.ts`
- `code/src/main/agent-tools.ts`
- `code/src/main/agent-runtime.ts`
- `code/src/shared/change-set.ts`
- `code/src/shared/agent.ts`
- `code/src/main/change-set.test.ts`
- `code/src/main/change-set-store.test.ts`
- `code/src/main/agent-tools.test.ts`

## 3. D6：重启后的中断任务恢复

### 启动归一化

- `AgentStore` 启动时把 `queued`、`running`、`waiting_for_approval`、`waiting_for_input` 统一归一化为 `interrupted`。
- 清除旧的审批和输入状态，取消未完成 Invocation，但保留任务步骤、调用历史、消息和结果上下文。
- 记录 `application-restart` 中断原因，避免重启后误把旧运行时当作仍然有效。
- 启动时让等待审批或已批准但未应用的旧 ChangeSet 失效，并清理上下文中的活跃变更集与待审批状态。

### 上下文与恢复路径

- `TaskContext` 新增结构化中断原因和 `activeChangeSetId`。
- 运行时丢失时记录精确审计 Finding：`Task interrupted because previous runtime no longer exists.`
- 重试只创建新任务：新任务拥有新 ID、新 Invocation 和新的 RepoMap，并通过 `resumedFromTaskId` 保留来源关系；不会复用旧 Runtime、审批、用户输入或 ChangeSet。
- 任务结束、失败、取消、超时或移除时，清理待处理变更和活跃 ChangeSet，避免残留批准继续生效。

### 工作台最小入口

- 在任务详情中增加渐进式的「查看上下文」，仅显示结构化状态、文件数量、Finding/验证数量、中断原因和活跃变更集状态，不展开敏感正文。
- 对非活动任务提供「重新执行」和「移除记录」；活动任务仍必须先停止，不能直接移除。
- 新增受控 IPC：`agent:context`、`agent:dismiss`，并同步 preload 与渲染器类型声明。

### 相关文件

- `code/src/main/agent-store.ts`
- `code/src/main/task-context-store.ts`
- `code/src/main/agent-service.ts`
- `code/src/main/index.ts`
- `code/src/preload/index.ts`
- `code/src/shared/task-context.ts`
- `code/src/renderer/src/AgentWorkbench.tsx`
- `code/src/renderer/src/App.tsx`
- `code/src/renderer/src/window.d.ts`
- `code/src/renderer/src/workbench/workbench.css`
- `code/src/main/agent-store.test.ts`
- `code/src/main/task-context-store.test.ts`
- `code/src/main/agent-service.test.ts`
- `code/src/renderer/src/workbench-functionality-contract.test.ts`

## 4. 自动化验收记录

在 `code` 目录执行：

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm verify:test-manifest` | 通过；115 个测试文件由 3 个入口覆盖 |
| `pnpm exec vitest run` | 通过；115 个测试文件、592 个测试 |
| `pnpm build` | 通过 |
| `pnpm package:win` | 通过 |
| `git diff --check` | 通过；仅有 Windows 换行转换提示 |

新增覆盖包括：哈希与元数据不落正文、创建/更新/删除组合、外部修改/目标消失、内容/操作/范围/工作区身份变化、拒绝目录/敏感文件/符号链接、大小限制、重启归一化、上下文审计、重试新任务和 UI/IPC 契约。

## 5. Windows 交付物

- 类型：Windows x64 Portable。
- 文件：`outputs/StarChat 0.2.1.exe`。
- 大小：78,986,682 bytes。
- SHA-256：`35113ED2D8B85A4E82F5DC64780299DBEC0D878BDEB1C63A5C3C0E99C07D8745`。
- 未配置代码签名证书，EXE 保持未签名；打包过程未启动应用。

## 6. 验收边界与清理策略

- 自动化检查不能替代真实 Windows 窗口、托盘、Live2D、拖动/缩放和桌宠交互验收；这些实机项目仍标记为 `DEFERRED`，未虚报为已通过。
- 本批次未实现 D7 及方案明确排除的浏览器、桌面控制、Agent 自动 Git 推送、Rebase 或硬重置能力。
- Git 中仅保留源码、必要构建配置、测试和本变更详情；构建生成的 `code/out`、`outputs/win-unpacked`、builder 调试文件、依赖目录、缓存和日志按既有清理要求移除，最终 EXE 保留在 `outputs`。

## 7. Git 交付

- D5 提交：`c84b052`（`feat: add frozen agent change sets`）。
- D6 提交：`472ab56`（`feat: reconcile interrupted agent tasks`）。
- 目标远程仓库：`https://github.com/stardawn2326/StarChat.git`。
- 推送分支：`feat/phase-d-change-review-recovery`。
- GitHub PR、Actions 运行编号和最终远端提交以本次推送后的交付回执为准。
