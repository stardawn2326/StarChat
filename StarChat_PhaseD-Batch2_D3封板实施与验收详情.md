# StarChat Phase D Batch 2：D3 语义封板实施与验收详情

> 日期：2026-09-08  
> 依据方案：`StarChat_PhaseD-Batch2验收结论_D3封板_Batch3准入方案.md`  
> 仓库：`stardawn2326/StarChat`  
> PR：[#1](https://github.com/stardawn2326/StarChat/pull/1)  
> 分支：`feat/phase-d-foundation`  
> D3 封板提交：`b6bb3f3a9469f2f6dc096fa5f8e82ff94e1bc047`  
> 本轮最终 CI：`34223315048` · success  
> Windows / Live2D 人工验收：继续 `DEFERRED`

## 1. 本轮范围与结论

本轮只执行 D3 Context Compression 语义封板，不提前实施 D5 Change Set Review 或 D6 Interrupted Task Recovery。

```text
D3 Context Compression      FINAL PASS
D4 Workspace Search         保持 FINAL PASS
Typecheck / Tests / Build   PASS
GitHub Actions              PASS
PR #1                       OPEN（按方案暂不合并）
Windows / Live2D            DEFERRED
Batch 3                     HOLD，等待后续准入条件
```

## 2. 解决的问题

### 2.1 写入工具生命周期归因

新增 `ToolLifecycleFact`，把 Agent assistant tool call 与同一 `toolCallId` 的 tool result 建立关联：

```ts
interface ToolLifecycleFact {
  toolCallId: string
  toolName: string
  state: 'requested' | 'completed' | 'failed' | 'rejected'
  changes: Array<{
    path: string
    operation: 'create' | 'update' | 'delete'
  }>
}
```

压缩器现在按以下规则生成任务事实：

```text
无对应 tool result       → requested → 仅保留为 pendingChanges
成功 tool result         → completed → 记录 applied decision
工具异常                 → failed    → 记录 finding/error
用户拒绝精确计划         → rejected  → 记录 rejection decision
```

因此，已完成的 `create/update/delete` 不会在压缩后错误地继续出现在 `pendingChanges` 中；失败和拒绝也不会被误判为等待执行。

### 2.2 用户补充信息在压缩后保留

`recordToolResult()` 识别 Runtime 回注的：

```json
{"userInput":"..."}
```

并将其转换为可读约束：

```text
User clarification: 只修改 src/a.ts，不要修改 src/b.ts
```

Runtime 的 `respond()` 会立即把同一条澄清写入最新约束集合，保证用户回答后下一轮立即触发压缩时也不会丢失。约束集合限制为最多 20 条、每条最多 2,000 字符，并对 API Key、Bearer、Token、Password 等敏感值进行脱敏。

### 2.3 摘要边界

继续保持既有安全约束：

```text
相对路径保留
错误与验证事实保留
文件正文不进入摘要
assistant prose / hidden reasoning 不进入摘要
绝对路径与敏感路径不进入摘要
contextCompactions 只在真实压缩时递增
```

## 3. 具体文件变更

### 源码

```text
code/src/main/context-compressor.ts
  - 新增 ToolLifecycleFact
  - 解析 apply_patch / apply_file_changes 的精确变更操作
  - 建立 toolCallId 与 tool result 的生命周期关联
  - 区分 requested / completed / failed / rejected
  - 识别并脱敏 userInput 澄清
  - 限制澄清数量与长度

code/src/main/agent-runtime.ts
  - Runtime 维护最新用户澄清约束
  - respond() 后立即记录澄清
  - 对 Runtime 约束做长度、数量和敏感值边界控制
```

### 测试

```text
code/src/main/context-compressor.test.ts
  - completed write 不再进入 pendingChanges
  - failed write 保留错误且不标记 completed
  - rejected write 清除 pending 并保留拒绝决策
  - 未返回结果的 write 仍保留为 pending
  - 多条用户澄清有数量上限并可读
  - 敏感澄清被替换为 REDACTED

code/src/main/agent-runtime.test.ts
  - waiting_for_input 后的用户澄清在后续真实压缩中仍可见
  - 压缩摘要不保留原始 userInput JSON 噪声
```

## 4. 本地验证

| 检查 | 结果 |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm run verify:test-manifest` | PASS：113 个测试文件由 3 个调用覆盖 |
| D3 targeted tests | PASS：2 个文件、9 项测试 |
| 主测试（排除 Git/品牌迁移） | PASS：111 个文件、568 项测试 |
| `git-runner.test.ts` | PASS：3 项测试 |
| `brand-migration.test.ts` | PASS：2 项测试 |
| 全部合计 | PASS：113 个文件、573 项测试 |
| `pnpm run build` | PASS：main、preload、renderer 均构建成功 |
| `git diff --check` | PASS |

本地第一次执行依赖安装和构建时，沙箱阻止 Electron/esbuild 子进程并返回 `spawn EPERM`；使用提权方式重跑后安装、测试和构建均成功。该现象属于执行环境权限限制，不是源码或测试失败。

## 5. GitHub 验证

### D3 seal CI

- Run：[34223315048](https://github.com/stardawn2326/StarChat/actions/runs/34223315048)
- HEAD：`b6bb3f3a9469f2f6dc096fa5f8e82ff94e1bc047`
- Job：[verify](https://github.com/stardawn2326/StarChat/actions/runs/34223315048/job/102051336322)
- 状态：`completed / success`
- Setup、Install dependencies、Typecheck、Test、Build、Complete job：全部成功

旧 Run `34220149386` 和 `34220703218` 仅作为前序提交证据，本轮最终结论以 D3 seal SHA 对应的 `34223315048` 为准。

## 6. 交付与边界

- D3 封板提交已推送到 `feat/phase-d-foundation`。
- PR #1 保持 OPEN，按当前方案不在本轮自动合并。
- D5、D6、D7、Browser Automation、Desktop Computer Use、Agent Git Push/Rebase/Reset 均未实施。
- Windows 实机窗口、托盘、桌宠拖动/缩放、Live2D 替换与动作覆盖仍需真实环境人工验收，CI 不替代该验收。
- 构建后的 `code/out`、`code/node_modules` 和项目根 `.pnpm-store` 已清理；源码、锁文件、报告与现有 EXE 保留。

## 7. 下一步准入

本轮 D3 已满足封板条件。Batch 3 仍需遵循方案中的顺序：PR 合并并确认 `master` CI 绿色后，创建 `feat/phase-d-change-review-recovery`，再分别实施 D5 和 D6。
