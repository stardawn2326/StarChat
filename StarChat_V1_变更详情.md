# StarChat V1 Phase A 变更详情

- 项目：StarChat / Project-008
- 日期：2026-09-07
- 参考方案：`C:\Users\23260\Downloads\StarChat_项目评审与V1实施方案汇总.md`
- 本次范围：按方案先落地 Phase A“工作区、Agent 与安全基线”，并保留已有工作台/桌宠运行链路。

## 交付结果

### 1. 个人会话与工作区会话分离

- 新增 `personal:default` 个人空间会话，不再因为启动应用而隐式授权项目目录。
- 个人会话可以正常进行陪伴对话，但没有文件系统根目录，不能运行 Agent 项目工具。
- 选择工作区后创建或恢复工作区会话；工作区会话仍按工作区隔离消息、标题和任务上下文。
- 旧版 v1 会话数据可读取并迁移到 v2；旧工作区的信任级别默认迁移为 `untrusted`。
- 工作区信任级别为：`untrusted`、`read-only`、`trusted-execution`。

涉及文件：

- `code/src/shared/session.ts`
- `code/src/main/session-store.ts`
- `code/src/main/session-store.test.ts`
- `code/src/shared/ipc.ts`
- `code/src/preload/index.ts`
- `code/src/renderer/src/window.d.ts`
- `code/src/renderer/src/App.tsx`
- `code/src/renderer/src/AgentWorkbench.tsx`

### 2. Agent 文件变更必须精确审批

- 保留原有“补丁预览后审批”流程。
- 新增 `apply_file_changes`，支持创建、更新、删除文件，但先生成完整 JSON 计划和差异预览。
- 批准计划与实际执行计划必须逐字一致；路径、重复文件、敏感文件、符号链接、文本大小、文件数量和总变更大小均有边界。
- 文件写入采用临时文件后替换；删除只允许删除已通过工作区安全检查的目标。
- Agent 记录 `apply_patch` 和 `apply_file_changes` 为写操作，并在工作区不信任脚本执行时不自动运行验证脚本。

涉及文件：

- `code/src/shared/agent.ts`
- `code/src/main/agent-security.ts`
- `code/src/main/agent-security.test.ts`
- `code/src/main/agent-tools.ts`
- `code/src/main/agent-tools.test.ts`
- `code/src/main/agent-service.ts`

### 3. 受控命令与项目检测

- 新增项目检测器，识别当前授权根目录或其直接项目目录中的 `package.json`、项目类型和 pnpm/npm/yarn 包管理器。
- 验证脚本只允许项目声明过的 `test`、`typecheck`、`build`、`verify:live2d`。
- 新增受控进程执行器：`shell: false`、隐藏子进程窗口、限制参数数量和内容、限制工作目录、超时、输出大小，并支持取消时结束 Windows 子进程树。
- Git 只读命令和验证命令都通过受控入口执行；应用内没有任意 PowerShell、Shell 或网络命令入口。
- Git 根目录必须与已授权工作区根目录一致，授权子目录不会被当成整个仓库使用。

涉及文件：

- `code/src/main/project-detector.ts`
- `code/src/main/process-runner.ts`
- `code/src/main/process-runner.test.ts`
- `code/src/main/git-boundary.ts`
- `code/src/main/workbench-service.ts`
- `code/src/main/workbench-service.test.ts`
- `code/src/main/workbench-command-browser.test.ts`
- `code/src/main/agent-tools.ts`

### 4. API Key 安全存储

- 主进程使用 Electron `safeStorage` 适配器保存 API Key，`secrets.json` 保存密文而不是新写入的明文。
- 系统安全存储不可用时，新的 API Key 保存请求会被拒绝，避免回退保存明文。
- 旧版本已有的明文 API Key 仅在安全存储可用时迁移为密文；迁移后删除 `apiKey` 字段。
- 增加密文保存、读取和旧数据迁移测试。

涉及文件：

- `code/src/main/settings-store.ts`
- `code/src/main/settings-store.test.ts`
- `code/src/main/index.ts`

### 5. IPC 窗口来源校验

- 会话、工作台、设置保存、角色、音色、Live2D、聊天和 Agent 入口统一校验调用来源为合法工作台窗口。
- 状态读取只允许工作台或桌宠窗口；桌宠相关 IPC 继续保留桌宠窗口限定。
- 工作台环境信息中的执行权限可以切换为“允许脚本”或“仅读取”，控件采用与工作台环境卡片一致的紧凑样式。

涉及文件：

- `code/src/main/ipc-guard.ts`
- `code/src/main/index.ts`
- `code/src/renderer/src/workbench/reference.css`

### 6. 工作台与对话行为

- 个人空间仍可使用主对话；只有 Agent 模式需要先选择工作区。
- “选择工作区”入口从个人会话提示直接进入授权流程。
- 新建对话按当前上下文创建个人会话或工作区会话。
- 保留工作台启动优先、桌宠弹出时工作台人物隐藏、桌宠返回工作台的现有窗口路由。
- 保留右侧栏、底部验证栏的折叠状态，以及工作台已有的缩放、拖动、最大化和 Live2D/PetWindow 运行逻辑。

涉及文件：

- `code/src/renderer/src/CompanionChat.tsx`
- `code/src/renderer/src/AgentConsole.tsx`
- `code/src/renderer/src/SettingsDetailsV2.tsx`
- `code/src/renderer/src/AgentWorkbench.tsx`
- `code/src/renderer/src/App.tsx`

### 7. 文档同步

- `README.md` 增加 Phase A 安全边界、个人空间、信任级别、受控命令、密钥保存和人工 Git 发布说明。

## 验证记录

| 检查项 | 命令/结果 |
| --- | --- |
| 类型检查 | `pnpm run typecheck` 通过 |
| 聚焦安全回归 | 5 个文件、29 个测试通过 |
| 完整自动化测试 | 92 个测试文件、493 个测试通过 |
| 生产构建 | `pnpm run build` 通过 |
| Windows portable 打包 | `pnpm run package:win` 通过 |
| 差异检查 | `git diff --check` 通过；仅有 Windows 换行格式提示 |
| GUI 运行验收 | 本次未进行交互式 Electron 截图/点击验收，以上为静态、单元测试、构建和打包证据 |

## 生成物

- EXE：`outputs/StarChat 0.2.1.exe`
- 类型：Windows x64 portable，未签名
- 大小：78,957,295 bytes
- SHA256：`064C1E02539EA6616FF119309E7B6AC3660592F66D1EAC06444786119A8C3AE2`
- `outputs` 中已删除 `win-unpacked` 和 `builder-debug.yml`，只保留上述 EXE。
- EXE 属于本地生成物并被 Git 忽略，不会作为二进制提交到 GitHub。

## 本次明确未实现

- 方案后续 Phase B/C 的长期记忆、RAG、向量库、完整 Live2D 适配器、STT、浏览器自动化、电脑控制和主动观察闭环。
- Agent 内部自动 `git commit`、`git push` 或 GitHub API 操作；发布动作由本次明确的人工 Git 推送完成。
- Electron 真机 GUI 的逐项点击、DPI、多显示器和外部 Live2D 视觉验收仍需单独执行。

## GitHub 发布

- 目标仓库：`https://github.com/stardawn2326/StarChat`
- 仓库可保持私有；本文件与源码会随本次提交推送到 `master`。
- 最终提交哈希以推送后的 Git 核验结果为准。
