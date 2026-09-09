# StarChat Phase D Batch 1 封板与 Batch 2 实施详情

> 执行日期：2026-09-08
> 依据方案：`C:\Users\23260\Downloads\StarChat_PhaseD-Batch1验收结论_封板修复_Batch2准入方案.md`
> 仓库：`stardawn2326/StarChat`
> 分支：`feat/phase-d-foundation`
> 最终 HEAD：`2629dedb358c6163d19af2f02034671308227abf`

## 1. 最终结果

本轮已完成附件方案要求的 Batch 1 封板修复，并实现 Batch 2 的 D3 Context Compression 与 D4 Workspace Search 基础能力。

```text
Phase D Batch 1 封板修复       PASS
D3 Context Compression        PASS
D4 Workspace Search           PASS
Typecheck                     PASS
Test manifest                 PASS（113 个测试文件）
Full Vitest                   PASS（113 个文件 / 570 个测试）
Production build              PASS
GitHub Windows Actions        PASS（Run 34220149386）
Windows / Live2D 人工验收      DEFERRED（按方案，不作为本轮开发门禁）
```

已创建并保持为 OPEN 的 GitHub PR：

- [PR #1：fix: seal Phase D foundation and add Batch 2 core](https://github.com/stardawn2326/StarChat/pull/1)
- Actions：[Run 34220149386](https://github.com/stardawn2326/StarChat/actions/runs/34220149386)

Actions 运行的 HEAD 与本地最终 HEAD 一致：

```text
2629dedb358c6163d19af2f02034671308227abf
```

## 2. Batch 1 封板修复

### 2.1 Repo Map 安全边界

修改 `code/src/main/repo-map.ts` 与 `code/src/main/agent-security.ts`：

- `RepoMapBuildOptions` 增加 `deniedRoots`。
- Repo Map 创建 `WorkspaceGuard` 时传入与 Agent Runtime 相同的 denied roots。
- Repo Map 缓存键包含安全边界信息，避免不同 denied roots 复用错误缓存。
- `WorkspaceGuard.walkFiles` 支持受控 `rootPath`，仍由同一个 guard 做路径、敏感文件、符号链接和目录边界检查。
- denied 路径只产生不带路径名的通用 warning，避免通过 warning 泄露不可见目录名。
- 新增回归测试确认 denied 目录不出现在：
  - Repo Map 文件条目
  - `languageStats`
  - `importantFiles`
  - `configFiles`
  - warnings 中的路径信息

### 2.2 Repo Map 进入 Agent Model Context

新增 `buildRepoContextSummary(repoMap)`：

- 只发送项目类型、包管理器、source/test roots、配置文件、重要文件元数据和语言统计。
- 不发送文件正文、绝对 workspace root、绝对 project root 或敏感路径。
- Repo Map `unavailable` 时省略该上下文，不阻断 Agent；`partial` 时保留可用摘要并标记状态。
- `AgentRuntimeInput` 增加 `repositoryContext`，启动模型时以受控 system message 注入。
- Agent Service 在构建任务时使用与 Runtime 相同的 `live2dPath` denied root。
- 新增模型消息测试，确认模型收到项目摘要且看不到工作区绝对路径。

### 2.3 PendingChange 操作类型修复

修改 `code/src/shared/agent.ts`、`code/src/main/agent-security.ts` 和 `code/src/main/agent-service.ts`：

- `AgentChangePreview` 增加冻结的 `changes` 列表。
- `apply_patch` 明确记录为 `update`。
- `apply_file_changes` 直接保留原始 `create`、`update`、`delete` 类型。
- TaskContext 审批同步不再将所有文件统一写成 `update`。
- 覆盖单文件和混合 create/update/delete 的审批前、批准后行为。
- 审批等待时不会提前写入；完成后 `pendingChanges` 清空。

### 2.4 持久化 RepoMap 隐私收紧

修改 `code/src/shared/task-context.ts`、`code/src/main/repo-map.ts` 和 `code/src/main/task-context-store.ts`：

- 新增 `TaskRepoSummary`，作为持久化 RepoMap 的相对路径投影。
- 保留运行时 RepoMap 的绝对根路径能力，但写入 userData 的 TaskContext 不再保存 `workspaceRoot` 或 `projectRoot`。
- `projectRoot` 如需保存只允许相对形式 `projectRootRelative`。
- 保留项目类型、包管理器、source/test roots、配置文件、重要文件元数据和语言统计。
- 原始 JSON 回归测试确认绝对路径、Windows 用户目录、`workspaceRoot` 和 `projectRoot` 不会落盘。

## 3. Batch 2：D3 Context Compression

新增：

- `code/src/main/context-compressor.ts`
- `code/src/main/context-compressor.test.ts`

实现内容：

- `CompressedTaskContext` 保存 goal、仓库摘要、相对文件路径、发现/错误、决策、待处理变更、验证记录和约束。
- 默认触发条件：消息数达到 8，或 tool output 达到 24 KiB；两者任一满足即可触发。
- 摘要有长度、条目和路径边界。
- 保留可审计的相对路径、`create/update/delete`、错误编号、验证脚本与失败输出片段。
- 文件正文不复制进压缩摘要。
- 不保存模型 assistant 内容，因此不把隐藏推理当作任务状态持久化。
- 压缩后重建合法的 system/context/user 消息结构，避免留下孤立 tool call。
- 每次真实压缩通过 `onContextCompaction` 回调使 `contextCompactions` 加 1；未触发压缩不会增加指标。

## 4. Batch 2：D4 Workspace Search

新增：

- `code/src/main/workspace-search.ts`
- `code/src/main/workspace-search.test.ts`

实现内容：

- `filename`：返回相对路径、`kind` 和文件大小。
- `text`：返回相对路径、行号和受限行文本。
- `symbol-lite`：对 `.ts/.tsx/.js/.jsx` 识别 function、class、interface、type、const、let、var 声明。
- 新增 Agent `workspace_search` 工具；保留已有 `search_text` 兼容能力。
- 搜索直接复用传入的 `WorkspaceGuard`，不调用 Shell、PowerShell、任意 ripgrep 参数或网络。
- 继承 workspace root、denied roots、敏感文件过滤、符号链接边界。
- 具备最大结果数、扫描条目数、扫描深度、超时和单行输出限制。
- 覆盖 filename/text/symbol-lite、denied root、`node_modules`、敏感文件和限额测试。

## 5. 具体文件变更清单

### 源码

```text
code/src/shared/agent.ts
code/src/shared/task-context.ts
code/src/main/agent-security.ts
code/src/main/repo-map.ts
code/src/main/task-context-store.ts
code/src/main/agent-runtime.ts
code/src/main/agent-service.ts
code/src/main/agent-tools.ts
code/src/main/context-compressor.ts
code/src/main/workspace-search.ts
```

### 测试

```text
code/src/main/repo-map.test.ts
code/src/main/task-context-store.test.ts
code/src/main/agent-tools.test.ts
code/src/main/agent-runtime.test.ts
code/src/main/agent-service.test.ts
code/src/main/context-compressor.test.ts
code/src/main/workspace-search.test.ts
```

## 6. 自动化验收证据

本地执行结果：

```text
pnpm run typecheck
通过

pnpm run verify:test-manifest
test-manifest verified: 113 test files covered by 3 invocations

pnpm exec vitest run
Test Files  113 passed (113)
Tests       570 passed (570)

pnpm run build
通过（main / preload / renderer 均生成）
```

GitHub Actions `StarChat CI`：

```text
Run ID       34220149386
Event        pull_request
Branch       feat/phase-d-foundation
HEAD         2629dedb358c6163d19af2f02034671308227abf
Job          verify
Conclusion   success
Steps        Install dependencies / Typecheck / Test / Build 全部 success
```

## 7. EXE 与临时产物

按照本方案“本轮不要求新的 Windows Release Artifact”的边界，本轮只执行生产 `build`，没有重新生成 RC3 EXE，也没有把人工 Windows 验收状态伪称为通过。

当前保留的既有便携版 EXE：

```text
路径：outputs\StarChat 0.2.1.exe
大小：78,981,064 bytes
SHA-256：86CA91EDA885C36D7F68BC6E1F64F901738DC3A231E00740643D24F4D8551A1D
类型：Windows x64 Portable，未签名
```

本轮构建后的临时目录已清理并确认不存在：

```text
code\out
code\node_modules
.pnpm-store
```

历史 `docs` 与既有验收材料未删除，以保留项目审计记录；本轮没有改动它们。

## 8. Git 交付

```text
Commit：2629dedb358c6163d19af2f02034671308227abf
Message：fix: seal phase d boundaries and add batch 2 foundations
Push：origin/feat/phase-d-foundation 成功
PR：#1，目标 master，状态 OPEN
```

本轮不自动合并 PR，保留 PR 作为代码审查和 Windows Actions 证据入口。

## 9. 未覆盖边界

- Windows 真窗口最大化/恢复、托盘、桌宠拖动/缩放、Live2D 实机替换与动作、麦克风和 DPI 行为仍需真实 Windows 人工验收。
- GitHub Actions 的 Typecheck/Test/Build 不能替代上述 GUI、Live2D 和设备交互验收。
- 本轮没有实施方案明确暂缓的 D5 Change Set Review、D6 Interrupted Recovery、D7 Agent V1.5 E2E。
