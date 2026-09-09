# StarChat Phase D Batch 2：D3 累积压缩封板 v2 实施与验收详情

> 日期：2026-09-09  
> 依据方案：`StarChat_PhaseD-Batch2复验_D3累积压缩封板_Batch3方案.md`  
> 仓库：`stardawn2326/StarChat`  
> PR：[#1](https://github.com/stardawn2326/StarChat/pull/1)  
> 分支：`feat/phase-d-foundation`  
> D3 v2 功能提交：`2590eb4792ff06846ff9ec2269283a158d7d6704`  
> D3 v2 功能 CI：`34306879099` · success  
> Windows / Live2D 人工验收：继续 `DEFERRED`

## 1. 本轮结论

```text
D3 Seal v1                  PASS
D3 Repeated Compression     FIXED
D3 Lifecycle Hardening      PASS
D3 Seal v2                  FINAL PASS
D4 Workspace Search         FINAL PASS
Phase D Batch 2             FINAL PASS
PR #1                       OPEN（按方案暂不合并）
Phase D Batch 3             HOLD
Windows / Live2D            DEFERRED
```

本轮只处理 D3 累积压缩封板，不实施 D5 Change Set Review、D6 Interrupted Task Recovery 或其他 Batch 3 功能。

## 2. 修复内容

### 2.1 结构化上下文累积

`ContextCompressionInput` 新增：

```ts
previousContext?: CompressedTaskContext
```

`AgentRuntime` 新增结构化状态：

```ts
private compressedContext?: CompressedTaskContext
```

每次真实压缩后保存新的结构化 context；下一次压缩把它作为 `previousContext` 输入。Runtime 每次新任务开始时清空该状态，避免任务之间串上下文。

### 2.2 纯结构化 merge

新增 `mergeCompressedTaskContext(previous, current)`，不解析人类可读摘要字符串，也不通过字符串拼接累积。

合并规则：

```text
goal             优先保留最初目标
repoSummary      有新的有效摘要时使用最新值，否则继承旧值
files            按相对路径去重，同路径使用最新摘要，最多 60 个
findings         去重并保留失败/错误优先事实，最多 40 个
decisions        去重并保留最近决策，最多 40 个
verification     去重并优先保留失败诊断，最多 40 个
constraints      合并去重，保留最近 20 条
```

所有合并后的列表继续受原有字符与条数上限约束，摘要默认仍为 16 KiB 上限。

### 2.3 生命周期终态不可降级

`toolLifecycle` 按 `toolCallId` 合并：

```text
requested → completed / failed / rejected：允许升级
completed / failed / rejected → requested：禁止降级
终态与终态再次出现：使用最新事实
```

`pendingChanges` 不再合并旧字符串，而是从最终生命周期重新推导，仅收录 `state === 'requested'` 的精确变更。因此已完成的 A 不会在第二次压缩后重新变成 pending，仍待执行的 B 会继续保留。

### 2.4 成败判断收紧

写入生命周期不再扫描补丁正文中的宽泛中文词语。现在只识别稳定的 Runtime 输出前缀：

```text
无 tool result                         → requested
以“用户拒绝了这次精确计划”开头          → rejected
以“工具执行错误：”开头                  → failed
其他已有 tool result                    → completed
```

因此，成功写入的文件内容即使包含“失败”“错误”“超时”等词语，也不会被误判为失败；工具错误和用户拒绝仍分别进入 findings 或 decisions。

### 2.5 多轮事实保留

`recordToolResult()` 仍把 `userInput` 转换为可读澄清，并与 Runtime `respond()` 立即更新的约束集合合并。用户澄清、历史错误、历史验证结果、文件相对路径和写入决策均可跨第二次及第三次压缩继续存在。

## 3. 具体文件变更

```text
code/src/main/context-compressor.ts
  - 扩展 previousContext 输入
  - 新增 mergeCompressedTaskContext
  - 累积 files/findings/decisions/verification/constraints
  - 按 toolCallId 合并生命周期终态
  - 从生命周期重新计算 pendingChanges
  - 收紧 write lifecycle 成败判定

code/src/main/agent-runtime.ts
  - Runtime 保存每次真实压缩后的 CompressedTaskContext
  - 后续压缩传入 previousContext
  - 新任务启动时清理上一任务的压缩状态

code/src/main/context-compressor.test.ts
  - 两次压缩的 goal、applied decision、pending lifecycle 保留
  - 第一轮用户澄清在第二次压缩仍保留
  - 成功补丁包含“失败/错误”内容时仍为 completed

code/src/main/agent-runtime.test.ts
  - 真实 Runtime 连续触发三次压缩
  - 第一轮错误与失败验证在后续摘要仍存在
  - 后续文件、搜索和成功验证事实持续累积
```

## 4. D3 封板测试对应关系

| 验收项 | 覆盖情况 |
| --- | --- |
| completed write 不再 pending | 已有 v1 用例并由 merge lifecycle 复验 |
| failed write 保留错误 | 已有 v1 用例并由终态 merge 保持 |
| rejected write 保留决策 | 已有 v1 用例并由终态 merge 保持 |
| waiting write 保留 pending | 已有 v1 用例；跨压缩 A/B 用例通过 |
| 用户澄清经过第二次压缩 | `context-compressor.test.ts` 专项用例通过 |
| 三次压缩仍保留关键事实 | `agent-runtime.test.ts` 专项用例通过 |
| 历史失败验证不丢失 | typecheck failed + later test passed 用例通过 |
| 成功正文含“失败/错误”不误判 | lifecycle false-positive 回归用例通过 |
| 约束数量与敏感值边界 | v1 多澄清/脱敏用例继续通过 |
| 摘要长度与条数上限 | `maxSummaryChars`、section bounds 继续生效 |
| 无文件正文、隐藏推理、绝对敏感路径 | 既有压缩安全用例继续通过 |
| contextCompactions 只计真实压缩 | Runtime 回调计数用例通过 |

## 5. 本地验证

| 检查 | 结果 |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm run verify:test-manifest` | PASS：113 个测试文件由 3 个调用覆盖 |
| D3 targeted tests | PASS：2 个文件、13 项测试 |
| 主测试（排除 Git/品牌迁移） | PASS：111 个文件、572 项测试 |
| `git-runner.test.ts` | PASS：3 项测试 |
| `brand-migration.test.ts` | PASS：2 项测试 |
| 全部合计 | PASS：113 个文件、577 项测试 |
| `pnpm run build` | PASS：main、preload、renderer 均构建成功 |
| `git diff --check` | PASS |

验证期间依赖安装和 Electron/esbuild 构建均在提权环境成功完成；此前沙箱中的 `spawn EPERM` 属于环境权限限制，不是源码或测试失败。

## 6. GitHub 验证

- D3 v2 功能提交：[2590eb4](https://github.com/stardawn2326/StarChat/commit/2590eb4792ff06846ff9ec2269283a158d7d6704)
- 对应最终功能 CI：[34306879099](https://github.com/stardawn2326/StarChat/actions/runs/34306879099)
- HEAD SHA：`2590eb4792ff06846ff9ec2269283a158d7d6704`
- Job `verify`：success
- Setup、Install dependencies、Typecheck、Test、Build、Complete job：全部 success

旧 Run 不作为本轮 D3 v2 的唯一证据；本轮功能结论以 `2590eb4` 与 `34306879099` 的 SHA 对应关系为准。

## 7. 交付边界

- D3 v2 功能提交已推送至 `feat/phase-d-foundation`。
- PR #1 保持 OPEN，当前不自动合并。
- D5、D6、D7、Browser Automation、Desktop Computer Use、Agent Git Push/Rebase/Reset-hard 均未实施。
- Windows 实机窗口、托盘、桌宠拖动/缩放、Live2D 替换与动作覆盖仍需真实环境人工验收；CI 不替代该验收。
- 构建后的 `code/out`、`code/node_modules` 和项目根 `.pnpm-store` 清理后不进入提交；源码、锁文件、实施报告与现有 EXE 保留。

## 8. 下一步准入

D3 v2 已达到方案要求的累积压缩封板条件，D4 继续保持 FINAL PASS，Phase D Batch 2 可判定 FINAL PASS。Batch 3 仍须在后续按方案完成 PR 合并并确认 `master` CI 绿色后，从 `master` 创建 `feat/phase-d-change-review-recovery`，再实施 D5 与 D6。
