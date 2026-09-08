# StarChat Phase D Batch 1 实施与验收详情

## 1. 执行范围

- 依据方案：`C:\Users\23260\Downloads\StarChat_跳过人工验收前置门禁_PhaseD-Batch1实施方案.md`
- 执行分支：`feat/phase-d-foundation`
- 本轮范围：D0 Contracts & Telemetry、D1 Repo Map、D2 TaskContext。
- 未实现范围：D3 Context Compression、D4 Workspace Search、D5 Change Set Review、D6 Interrupted Recovery、D7 Agent V1.5 E2E。
- 人工 Windows GUI、Live2D、托盘、DPI 和真实设备验收按方案延期到 Windows V1 Public Release Gate；本文件不把自动化结果冒充人工验收结果。

## 2. 具体代码变更

### D0：共享契约与指标

- `code/src/shared/repo-map.ts`
  - 新增 RepoMap、RepoMapEntry、RepoMapLimits 及部分结果/不可用状态字段。
  - 记录工作区 ID、工作区/项目根、项目类型、包管理器、源码根、测试根、配置文件、重要文件、语言统计和生成时间。
- `code/src/shared/task-context.ts`
  - 新增 TaskContext、TaskPlanItem、FileReadRecord、TaskFinding、PendingChange、VerificationRecord。
  - 明确定义运行中、等待审批、等待输入、中断、完成、失败等状态及运行时 Agent 状态映射。
- `code/src/shared/agent-metrics.ts`
  - 新增工具调用、文件读取、搜索、写入、验证和上下文压缩六类指标。
  - 指标复制和递增会校正 NaN、负数和小数，默认从零开始。

### D1：工作区 Repo Map

- `code/src/main/agent-security.ts`
  - 在现有 `WorkspaceGuard` 中增加受控 `walkFiles` 遍历能力，复用真实路径、授权根、敏感路径和符号链接边界。
  - 默认限制为最大深度 8、最大条目 5000、超时 3000ms；支持返回部分结果和警告，不因单个目录失败而使 Agent 崩溃。
  - 遍历跳过 `.git`、`node_modules`、`out`、`dist`、`build`、`coverage`、`.cache`、`tmp`、`temp` 以及 `.env`、密钥、凭据等敏感路径。
- `code/src/main/repo-map.ts`
  - 复用 `ProjectDetector` 识别 Electron、Web、Node、unknown 项目和包管理器。
  - 识别 package/lock/workspace、tsconfig、Vite/Vitest/Electron、ESLint/Prettier 等配置及 README/文档。
  - 统计扩展名语言数量，推导单体项目和 monorepo 的源码/测试根。
  - 以内存缓存保存结果，键为工作区 ID、规范化工作区根和项目根；支持工作区清理和手动刷新，不创建文件监听器。
- `code/src/main/project-detector.ts`
  - 将 `pnpm-workspace.yaml` 作为 pnpm monorepo 的包管理器识别依据。

### D2：TaskContext 持久化与运行时接入

- `code/src/main/task-context-store.ts`
  - 支持 create、read/get、update、list、markCompleted、markInterrupted、delete、prune。
  - 以原子临时文件写入，存储位置由主进程指定为 Electron `userData/agent-task-contexts.json`，不写入项目仓库。
  - 仅保存任务目标、计划、相对文件路径、发现摘要、待变更摘要、验证记录、状态和指标；不保存完整文件内容、工具参数原文、API Key 或隐藏推理。
  - 对路径做相对路径/敏感路径/`..` 校验，对摘要、请求、命令和失败信息做长度限制及凭据脱敏；限制计划、读取记录、发现、变更和验证记录数量。
  - 保留最新失败、待审批摘要和用户约束；清理时保留运行中/等待中的上下文并淘汰过期或超额的终态记录。
- `code/src/main/agent-runtime.ts`
  - 工具事件增加受控路径元数据，仅用于读取文件路径和变更路径统计，不传递文件内容。
- `code/src/main/agent-service.ts`
  - 任务启动时生成 Repo Map 并创建 TaskContext。
  - 工具事件同步工具/读取/搜索/写入/验证指标及读取文件相对路径。
  - 等待审批、等待输入、完成、失败和自动验证结果同步到 TaskContext；同步失败只作为 best-effort telemetry，不阻断 Agent。
- `code/src/main/index.ts`
  - 在 `app.getPath('userData')` 下初始化 `agent-task-contexts.json`，注入 AgentService。

## 3. 测试覆盖

新增/扩展测试覆盖：

- 共享指标和 Agent 状态映射：2 项。
- Repo Map：单体 Node/Web、monorepo、unknown 项目、忽略目录、敏感文件、最大深度、最大条目、超时部分结果、符号链接跳过、缺失工作区降级：8 项。
- TaskContext Store：持久化重载、生命周期更新、审批/失败保留、凭据和危险路径过滤、内容不落盘、过期/数量清理、坏数据容错：5 项。
- AgentService：工作区绑定、Repo Map 创建、工具指标/读取路径、审批待变更、自动验证记录、原有写入和失败流程：7 项。

验证结果：

- `pnpm run typecheck`：通过。
- `pnpm run verify:test-manifest`：通过，111 个测试文件全部被 3 个测试入口覆盖。
- 全量 Vitest：111 个测试文件、557 个断言全部通过。
- 关键新增/安全测试：5 个测试文件、26 个断言全部通过。
- `pnpm run build`：Electron 主进程、预加载和渲染层生产构建通过。
- `pnpm run package:win`：Windows x64 portable 打包通过。

## 4. Windows EXE 产物

- 文件：`outputs\StarChat 0.2.1.exe`
- 类型：Windows x64 Portable
- 大小：78,981,064 bytes
- SHA256：`86CA91EDA885C36D7F68BC6E1F64F901738DC3A231E00740643D24F4D8551A1D`
- 代码签名：未配置签名证书，未签名
- 本轮未启动 EXE 做人工 GUI/Live2D 验收；该边界按 Batch 1 方案保留为 deferred。

## 5. Git 提交

本轮提交：

1. `9781dad` `feat: add agent foundation contracts`
2. `b40a47c` `feat: add workspace repo map`
3. `9670a5e` `feat: persist agent task context`
4. `5bb70b8` `test: cover repo map limits and project shapes`
5. 本详情文件随本轮最终文档提交。

## 6. 清理与边界

- 已清理本轮构建生成的 `code/out`、`outputs/win-unpacked`、`outputs/builder-debug.yml` 和本地 `.pnpm-store`。
- `outputs/` 保留 portable EXE；源码、`package.json`、锁文件及构建配置保留。
- 本轮测试生成的日志和安装目录会在提交前删除；历史 `docs/` 验收记录未修改。
- 当前分支只完成 Phase D Batch 1；不代表 Windows V1 Public Release 已放行。
