# StarChat Phase A RC2 → Phase B 变更详情

- 项目：StarChat / Project-008
- 日期：2026-09-07
- 参考方案：`C:\Users\23260\Downloads\StarChat_下一步实施方案_PhaseA-RC2到PhaseB (1).md`
- 执行范围：按方案完成 Phase A RC2 安全基线，并落地 Phase B Companion V1 的记忆、关系和手动语音输入基础。
- 说明：附件中的文字仅作为需求参考；没有把附件示例文字当作额外指令。

## 一、Phase A RC2

### 1. Workspace Trust 与 Agent 工具矩阵

Agent 不再根据用户消息中的“修改/读取”等措辞推断最终权限，而是根据当前工作区的信任状态直接决定工具注册：

| 信任状态 | 读取 | 文件写入 | 项目验证脚本 | Git 提交 |
| --- | --- | --- | --- | --- |
| `untrusted` | 允许 | 允许，但每次都要精确审批 | 禁止 | 禁止 |
| `read-only` | 允许 | 不注册写入工具 | 禁止 | 禁止 |
| `trusted-execution` | 允许 | 允许，但仍需精确审批 | 仅白名单脚本 | 仅用户主动提交已暂存内容 |

涉及文件：

- `code/src/main/agent-service.ts`
- `code/src/main/agent-tools.ts`
- `code/src/main/agent-runtime.ts`
- `code/src/main/agent-tools.test.ts`
- `code/src/main/agent-service.test.ts`

### 2. Workspace Write Lock

- 新增 `code/src/main/workspace-lock-manager.ts`。
- 写工具在有效补丁/文件变更预览进入审批边界后才预留工作区锁。
- 同一工作区的读任务可以并行；不同写任务不能同时运行，也不能在已有待审批写任务时绕过锁。
- 批准后锁从 `reserved` 进入 `active`。
- 任务完成、失败、取消、超时、拒绝、异常和应用退出都会释放锁。
- 写锁按真实路径规范化，避免大小写、尾斜杠或符号路径造成重复锁。

### 3. GitRunner 与提交边界

- 新增 `code/src/main/git-runner.ts`，WorkBench、Agent Git 只读边界和 Git 根目录检查统一走该入口。
- 只读命令有固定白名单、参数校验、`shell: false`、超时和输出上限。
- Git 根目录必须等于授权工作区根目录，不能把授权子目录扩大为仓库根目录。
- Workbench 提交入口只接受已暂存内容，提交前要求 `trusted-execution`。
- 提交可能执行 Git Hooks，因此不通过 Agent 自动触发；应用不会自动 `git add`、`push`、`pull`、`fetch` 或访问远程凭据。

涉及文件：

- `code/src/main/git-runner.ts`
- `code/src/main/git-runner.test.ts`
- `code/src/main/git-boundary.ts`
- `code/src/main/workbench-service.ts`
- `code/src/renderer/src/AgentWorkbench.tsx`
- `code/src/renderer/src/SettingsDetailsV2.tsx`
- `code/src/renderer/src/settings-schema.ts`

### 4. IPC Guard 收口

- `code/src/main/index.ts` 对工作台、设置窗口和透明桌宠窗口建立明确的 sender 策略。
- 设置、工作台、聊天、Agent、角色、音色、Live2D、窗口、桌宠和 presentation IPC 均按窗口角色放行或拒绝。
- presentation 事件只接受设置窗口发出的安全事件；桌宠只接收转发结果。
- 应用退出统一调用 `agentService.shutdown()`，避免遗留任务或写锁。

### 5. README 与 CI

- 更新根目录 `README.md`，同步信任矩阵、Git 提交边界、写锁、Phase B 和记忆/语音限制。
- 新增 `.github/workflows/ci.yml`：Windows runner、冻结依赖安装、typecheck、test、build。

## 二、Phase B Companion V1

### 1. Memory Domain 与持久化

- 新增 `code/src/shared/memory.ts`：`ProfileMemory`、`EpisodicMemory`、`ConversationSummary`、检索结果、敏感内容过滤和上下文格式化。
- 新增 `code/src/main/memory-store.ts`：原子临时文件替换、版本号、数量上限和加载清洗。
- 新增 `code/src/main/memory-service.ts` 与 `MemoryExtractor`：从用户明确陈述提取姓名、身份、偏好、习惯、人物、项目和边界事实。
- 运行时文件位于 Electron 用户数据目录的 `memory.json`，不写入仓库，不进入 EXE。
- 资料记忆支持设置页查看、逐条删除和清空当前角色记忆。
- `longTermMemoryEnabled` 默认开启；关闭后停止记忆写入和召回，但不会自动删除已有资料，用户可显式清空。

拒绝写入的内容包括 API Key、密码、Token、Bearer、私钥、Cookie、授权头、身份证、银行卡、信用卡等敏感信息。

### 2. Conversation Summary

- 普通对话完成后按当前会话记录消息。
- 每 20 条消息或累计字符超过阈值时生成摘要。
- 摘要保留近期消息、开放问题、未完成问题和近期情绪，并限制长度及数量。
- 下一次请求上下文由人格、关系状态、会话历史和结构化长期记忆共同组成；关闭长期记忆时不会召回。

### 3. Episodic Memory 与 Retrieval

- 事件记忆只接受 `importance >= 0.6`，普通寒暄不会形成 Episode。
- 检索不依赖向量数据库，使用关键词/短语匹配、重要性、置信度和新鲜度评分。
- 每次最多取 8 条，默认取 5 条，保留 3–8 条的结构化上限。

### 4. RelationshipEngine

- 新增 `code/src/shared/relationship-engine.ts`。
- 维护熟悉度、信任、冲突、连续性、互动次数和最近互动时间。
- 支持普通互动、积极互动、个人披露、共享事件、冲突、修复、边界、长期离开和回归事件。
- 阶段由多指标推导为“初识 / 熟悉 / 信赖 / 亲密”，不再只依赖互动次数。
- `CompanionState` 已持久化关系状态，并在每次对话交换后更新。

### 5. STT 与 VAD

- 新增 `code/shared/stt.ts`、`code/src/renderer/src/stt-provider.ts` 和 `code/src/renderer/src/vad.ts`。
- `BrowserSpeechRecognitionProvider` 是可替换的 Provider 抽象，支持 interim/final 结果和错误/结束回调。
- 主对话窗口麦克风为手动输入：点击开始、填入输入框、用户确认发送；不会自动发送。
- 基础 VAD 在约 1.4 秒没有新识别结果后停止监听。唤醒词、持续监听和自动发送明确留到后续阶段。

## 三、验证结果

| 检查 | 结果 |
| --- | --- |
| TypeScript 类型检查 | `pnpm run typecheck` 通过 |
| 完整自动化测试 | 98 个测试文件、508 个测试通过 |
| 生产构建 | `pnpm run build` 通过 |
| Windows portable 打包 | `pnpm run package:win` 通过 |
| Git 差异检查 | `git diff --check` 通过；仅有 Windows 换行格式提示 |
| Electron 交互验收 | 本次未启动 EXE 做逐项点击/截图验收；以上为源码契约、单元测试、构建和制品证据 |

新增测试覆盖：

- trust matrix 和写入审批边界；
- 工作区写锁串行化与释放；
- GitRunner 只读白名单、精确仓库根和已暂存提交；
- 记忆敏感信息拒绝、摘要阈值、持久化、检索上限和关闭开关；
- RelationshipEngine 阶段递进与冲突修复；
- STT Provider partial/final 映射和不可用环境；
- 基础 VAD 静音结束逻辑。

## 四、EXE 与清理结果

- 文件：[outputs/StarChat 0.2.1.exe](outputs/StarChat%200.2.1.exe)
- 类型：Windows x64 portable，未签名
- 大小：78,966,972 bytes
- SHA-256：`F610E204D6B93E0E0E7FDDC724F549720ABBEB17EA51EA84A02C2915DD3C6C98`
- `outputs/` 仅保留上述 EXE。
- 已删除 `code/node_modules`、`code/out`、`outputs/win-unpacked`、`outputs/builder-debug.yml`、`.firecrawl` 和 `logs`。
- EXE 被 `.gitignore` 忽略，不会作为二进制提交到 GitHub；源码、构建配置、CI 和本变更详情会推送。

## 五、GitHub 发布

- 目标远程：`https://github.com/stardawn2326/StarChat`
- 目标分支：`master`
- 仓库可以保持私有；最终提交哈希以推送后的 Git 核验为准。
