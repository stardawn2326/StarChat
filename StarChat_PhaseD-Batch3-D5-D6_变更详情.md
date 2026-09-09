# StarChat PhaseD-Batch3（D5/D6）与 D7 Agent V1.5 变更详情

## 1. 执行范围

- 依据方案：`StarChat_PhaseD-Batch3验收_D5事务封板_审计链恢复_D7准入方案.md`；其中包含前序 D5/D6 封板要求和本轮 D7 准入要求。
- 方案文件是本次实现的验收参考资料；其中的范围、约束和验收项被落实为代码与测试，不把文档中的示例文字当作额外操作指令。
- 基线：PhaseD Foundation 合并提交 `ffd760be62f2ad8852456a032854e23e382a2c45`。
- D5/D6 封板分支：`feat/phase-d-change-review-recovery`；D7 验收分支：`feat/phase-d-agent-v1-5-e2e`。
- 本轮完成 D5「Change Set Review」事务封板、D6「Interrupted Task Recovery」审计恢复和 D7 Agent V1.5 受控组合验收。Browser、Desktop Computer Use、Agent Git Push、Rebase/Reset-hard 等项目不在范围内。

## 2. D5：冻结变更集与审批前复核

### 数据契约与持久化

- 新增 `code/src/shared/change-set.ts`，定义 `draft`、`waiting-approval`、`approved`、`applied`、`apply-failed`、`partial-failure`、`rejected`、`invalidated` 八种状态。
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

### D5 Seal：多文件事务与诚实失败语义

- 将写入拆分为 `stagePreparedFileChanges`、`commitPreparedFileChanges`、`rollbackPreparedFileChanges` 三个阶段。
- Stage 阶段先完成所有路径/安全/前置内容复核，再为创建/更新写同目录临时文件，为更新/删除保存同目录快照。
- Commit 阶段按文件提交：创建使用临时文件替换目标，更新/删除先将目标移入备份，再提交更新临时文件。
- 任一提交失败后按逆序回滚：撤销创建、恢复更新备份、恢复删除备份；回滚完整时状态为 `apply-failed`。
- 回滚自身失败时状态为 `partial-failure`，保留受影响相对路径和回滚失败信息，并向 TaskContext 写入 `risk` Finding；Agent 立即失败，不再继续模型循环。
- 增加可注入文件系统适配器，覆盖首项失败、第二项失败、创建/更新/删除回滚以及回滚失败场景。

### 相关文件

- `code/src/main/change-set.ts`
- `code/src/main/change-set-store.ts`
- `code/src/main/agent-security.ts`
- `code/src/main/agent-tools.ts`
- `code/src/main/agent-runtime.ts`
- `code/src/main/agent-service.ts`
- `code/src/shared/change-set.ts`
- `code/src/shared/agent.ts`
- `code/src/main/change-set.test.ts`
- `code/src/main/change-set-store.test.ts`
- `code/src/main/agent-tools.test.ts`
- `code/src/main/agent-runtime.test.ts`
- `code/src/main/agent-service.test.ts`

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
| `pnpm verify:test-manifest` | 通过；116 个测试文件由 3 个入口覆盖 |
| `pnpm exec vitest run --exclude=src/main/git-runner.test.ts --exclude=src/main/brand-migration.test.ts` | 通过；114 个测试文件、598 个测试 |
| `pnpm exec vitest run src/main/git-runner.test.ts` | 通过；1 个测试文件、3 个测试 |
| `pnpm exec vitest run src/main/brand-migration.test.ts` | 通过；1 个测试文件、2 个测试 |
| `pnpm build` | 通过；D7 Windows 打包前置构建再次通过 |
| `pnpm run package:win` | 通过；在 D7 代码合并提交 `ab9d6f3e31dc9bc69920ca637902ca336bcb17dc` 上生成 Windows x64 portable EXE；后续仅文档收尾合并，未改变打包代码 |
| `git diff --check` | 通过；仅有 Windows 换行转换提示 |

新增覆盖包括：哈希与元数据不落正文、创建/更新/删除组合、外部修改/目标消失、内容/操作/范围/工作区身份变化、拒绝目录/敏感文件/符号链接、大小限制、事务阶段失败、三类回滚、回滚失败、Agent 终止模型循环、重启归一化、上下文审计、重试新任务、D7 组合链路和 UI/IPC 契约。

## 5. D7：Agent V1.5 受控组合验收

### 受控 fixture 与主链路

- 新增 `code/src/main/agent-v1-5-e2e.test.ts`，每个测试创建独立临时 fixture 和独立状态目录，不污染项目源码、任务状态或真实 Git 历史。
- 基线任务为在 `src/math.ts` 增加 `clamp(value, min, max)`，在 `tests/math.test.ts` 增加边界测试，并请求 `typecheck` 与 `test`。
- 主链路按方案串联：Repo Map → `workspace_search` 文本检索 → `read_file` → `workspace_search` 文件名检索 → ChangeSet 预览 → 审批 → 多文件 Apply → 验证 → Final Summary。
- 验收断言确认审批前文件完全不变、预览含 `changeSetId` 和两项相对路径、批准后 ChangeSet 为 `applied`，以及 TaskContext 清空待处理变更并保存终态验证。
- 验证执行器在组合测试中使用受控注入，验证 AgentService 的权限、调用和审计编排；不把临时 fixture 的模拟执行冒充真实 Windows 命令验收。

### D7 场景与实测指标

- Happy path：4 个 D7 组合测试中的基线场景通过；审批前指标为 `toolCalls=4`、`readFileCalls=1`、`searchCalls=2`、`writeCalls=1`，完成后为 `toolCalls=6`、`verificationRuns=3`，上下文压缩至少 2 次。
- TOCTOU：外部编辑后旧 ChangeSet 转为 `invalidated` 且不写入；重新生成不同 `changeSetId` 并再次审批后成功应用。
- Interrupted/Retry：启动归一化将旧等待审批任务变为 `interrupted`，旧 ChangeSet 失效，重试创建新任务并写入 `resumedFromTaskId`。
- Security/Read-only：`read-only` 信任不提供写入和脚本执行工具；`.env` 与工作区外路径被 `WorkspaceGuard` 拦截。
- Multi-compaction：D7 基线链路保留至少 2 次累计上下文压缩；既有运行时专项测试继续验证 3 次压缩后的文件、错误和验证事实不丢失。
- 组合测试共 4 个测试全部通过；测试指标只记录数量、路径和状态，不记录密钥、文件正文或绝对工作区路径。

## 6. Windows Final RC 产物

- D7 Final 后已从最终 master 生成本地 Windows x64 portable EXE：`outputs/StarChat 0.2.1.exe`。
- 文件大小：`78,990,521` bytes；SHA-256：`DD1555DC34622C3ECFC2D8338522C5AAC048BF6C5C93B3A837E519817FD5B26B`。
- 产物未配置代码签名证书，构建日志确认跳过签名；使用前 Windows 可能显示未签名提示。
- 该 EXE 是本机打包结果，不提交到 Git（`outputs/` 已被 `.gitignore` 忽略），不作为 GitHub Release Artifact 或 Windows/Live2D 实机验收证据。
- Windows / Live2D 实机验收继续标记为 `DEFERRED`；便携 EXE 的打包成功只证明本地构建流程和文件存在性。

## 7. 验收边界与清理策略

- 自动化检查不能替代真实 Windows 窗口、托盘、Live2D、拖动/缩放和桌宠交互验收；这些实机项目仍标记为 `DEFERRED`，未虚报为已通过。
- D7 不扩大权限：不实现 Browser、Desktop Computer Use、任意 Shell、Agent 自动 Git add/commit/push、checkout/rebase/reset-hard。
- 已从基线 `ffd760be62f2ad8852456a032854e23e382a2c45` 精确恢复 `docs/acceptance` 下 5 个历史验收文档，不改写其内容。
- 最终交付后删除 `code/node_modules`、`code/out`、`outputs/win-unpacked`、`outputs/builder-debug.yml`、pnpm 临时 store、缓存和日志；保留源码、`package.json`/`pnpm-lock.yaml` 等构建依赖声明、最终 EXE 和审计文档。
- 依据本方案的审计链恢复要求，保留并核对 `docs/acceptance` 五个历史验收文档；这项留存优先于前序“删除 docs”的清理要求。

## 8. Git 交付

- D5 提交：`c84b052`（`feat: add frozen agent change sets`）。
- D6 提交：`472ab56`（`feat: reconcile interrupted agent tasks`）。
- D5/D6 详情提交：`9bd362e`（`docs: record phase d batch 3 delivery`；本轮继续更新）。
- 清理提交：`a4aaa9a`（`chore: remove obsolete acceptance artifacts`；本轮已用基线恢复验收文档）。
- 目标远程仓库：`https://github.com/stardawn2326/StarChat.git`。
- D5/D6 推送分支：`feat/phase-d-change-review-recovery`，已合并 PR #2；D5/D6 Seal PR CI 与合并后的 master CI 均通过。
- D7 提交：`02bae1b`（`test: add agent v1.5 e2e acceptance`）。
- D7 PR：[#3](https://github.com/stardawn2326/StarChat/pull/3)，PR HEAD `02bae1b0a803ea79ce1a1f41ecbfcc5f8bdf2756`，已合并。
- D7 PR CI：Actions run `34348153314`，通过；合并提交：`ab9d6f3e31dc9bc69920ca637902ca336bcb17dc`。
- D7 合并后 master CI：Actions run `34348335347`，通过；D7 代码最终提交为 `ab9d6f3e31dc9bc69920ca637902ca336bcb17dc`。
- D5/D6 Seal PR #2：最终提交 `7de02af`，PR CI run `34346796811` 通过；合并提交 `069a2890c0cf95f4b2322616c4798baf36572ff7`，master CI run `34347002823` 通过。
- 详情文档收尾 PR #4：合并提交 `0b7dff48acc603afca86b45930a88419458cfe58`，master CI run `34349163859` 通过；该合并只更新交付回执，不改变 D7 代码或 EXE。
- D7 推送分支：`feat/phase-d-agent-v1-5-e2e`；详情文档、验收代码和交付回执均已推送到 `https://github.com/stardawn2326/StarChat.git`。
