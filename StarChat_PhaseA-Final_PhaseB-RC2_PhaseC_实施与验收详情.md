# StarChat Phase A Final → Phase B RC2 → Phase C 实施与验收详情

- 项目：StarChat / Project-008
- 执行日期：2026-09-07
- 参考方案：`C:\Users\23260\Downloads\StarChat_下一步实施方案_PhaseA-Final_PhaseB-RC2_PhaseC.md`
- Git 分支：`master`
- 源码提交：`4a9c6f0`（完整提交号见 Git 记录）
- 说明：附件内容作为项目方案和验收标准参考；附件中的示例文字没有被当作额外工具指令执行。

## 一、执行结论

本轮已按方案完成 Phase A Final、Phase B RC2 Foundation 和 Phase C Live2D Productization 的源码实现，并完成自动化测试、类型检查、生产构建和 Windows portable 打包。

当前结论分为两类：

- 自动化与静态验收：通过。
- 真实 Windows 窗口交互、托盘菜单、Live2D 实机动作和 GitHub Actions 远端绿色状态：本轮没有伪造为已通过，需按文末清单继续验收。

## 二、具体代码变更

### 1. Phase A Final：路径、Git 与工作区安全边界

- 新增 `code/src/main/path-identity.ts`：统一使用绝对路径、`realpath` 和 Windows 文件身份信息（`dev/ino`）判断目录身份。
- 新增 `code/src/main/path-identity.test.ts`：覆盖大小写、尾斜杠、正反斜杠、父子目录、不同仓库、符号链接或 junction 以及不存在路径。
- 修改 `code/src/main/git-runner.ts`：
  - Git 可执行文件优先使用 `STARCHAT_GIT_EXECUTABLE`，并强制校验为绝对路径和真实文件。
  - 未配置时调用 `where.exe git`，解析并缓存真实 Git 路径。
  - 提交前使用目录身份比较，拒绝把父目录、子目录或别的仓库当成当前工作区。
- 修改 `code/src/main/git-boundary.ts` 和 `code/src/main/workspace-lock-manager.ts`：统一使用 canonical workspace identity，避免路径别名绕过边界或工作区锁。
- 修改 `code/src/main/git-runner.test.ts`：增加绝对 Git 路径、环境变量覆盖和非法覆盖值测试。

### 2. Phase B RC2：Memory Scope 与长期记忆单一来源

- 新增 `code/src/shared/memory-scope.ts`：定义 `personal` 与 `workspace` 两类上下文，并区分 `workspaceId`、`sessionId`。
- 修改 `code/src/shared/memory.ts`：
  - 记忆 schema 从 v1 升到 v2。
  - Episodic Memory 和 Conversation Summary 都保存 scope。
  - 增加 `name`、`person`、`preference` 等 Profile Memory 类型白名单。
- 修改 `code/src/main/memory-store.ts`：兼容读取 v1，统一以 v2 保存；个人记忆跨会话可读，工作区记忆只在同一工作区可读，会话摘要限制在同一会话。
- 修改 `code/src/main/memory-service.ts`：
  - 增加带 role、session、scope、source 的会话上下文。
  - 只有 Companion 的 personal context 可以写入 Profile Memory。
  - Agent 和 Workspace 上下文不得写入 Personal Profile。
- 新增 `code/src/main/memory-migration.ts`：在长期记忆开启时，把旧 `CompanionState.memories` 安全迁移到新的 MemoryStore，并清空旧写入入口。
- 修改 `code/src/shared/companion.ts`：
  - `RelationshipEngine` 成为关系状态的权威来源。
  - 旧 `memories` 字段仅作为迁移兼容字段保留，不再作为长期记忆读取源或写入源。
  - 提示词改为由 Memory Scope 服务注入记忆上下文。
- 修改 `code/src/main/index.ts`：启动迁移旧记忆；Agent、聊天和工作区会话按来源写入正确 scope；公开状态使用真实 Profile Memory 数量。
- 修改 `code/src/main/memory-service.test.ts` 与 `code/src/shared/companion.test.ts`：覆盖姓名、偏好持久化、工作区隔离、Agent 禁止写个人档案以及关系状态来源。

### 3. Phase B RC2：Relationship Engine 与 STT 状态机

- 新增 `code/src/shared/relationship-event-classifier.ts`：将 boundary、repair、conflict、personal disclosure、positive interaction、shared event 和普通互动归类。
- 修改 `code/src/shared/relationship-engine.ts`：增加关系分数和阶段索引，支持修复、边界和冲突事件。
- 新增 `code/src/renderer/src/stt-state-machine.ts` 与测试：
  - 初始等待讲话最长 8 秒。
  - 只有检测到首个语音后才进入静音计时。
  - 静音结束阈值为 1.4 秒。
  - 状态显式区分 idle、starting、waiting、speech、silence、stopping、error。
- 修改 `code/src/renderer/src/CompanionChat.tsx`：接入状态机，处理首次超时、结束和错误。
- 修改 `code/src/renderer/src/stt-provider.ts`：将权限拒绝、无音频输入、网络、无语音和中止等错误映射为用户可读提示。

### 4. Phase C：Live2D 适配产品化

- 修改 `code/src/shared/live2d.ts`：增加参数绑定来源 `user-override`、适配器 override 结构及应用函数。
- 新增 `code/src/renderer/src/Live2DAdapterEditor.tsx`：
  - 支持表情、动作、参数的手动映射。
  - 提供表情/动作 tester。
  - 提供参数调试滑块、能力报告和兼容性标签。
- 修改 `code/src/renderer/src/SettingsDetailsV2.tsx`、`code/src/renderer/src/App.tsx`、`code/src/shared/ipc.ts`：设置页可编辑、预览并持久化当前模型的适配器 override。
- 新增 `code/src/shared/live2d-compatibility.ts` 及测试：为标准参数、非标准表情、有限动作、缺少 CDI、缺少 physics 和 ZIP 模型输出兼容性报告。
- 修改 `code/src/main/live2d-model-registry.ts`：ZIP 条目解压增加 `maxOutputLength`，避免异常压缩条目无限膨胀。
- 修改 `code/src/renderer/src/settings-center.css`：加入适配器编辑器的两列/窄屏布局样式，并保持设置页主题契约隔离。

## 三、自动化验收证据

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| Vitest 全量测试 | 通过 | 102 个测试文件，522 个测试全部通过 |
| TypeScript 类型检查 | 通过 | `pnpm run typecheck` |
| 生产构建 | 通过 | `pnpm run build` / electron-vite |
| Windows portable 打包 | 通过 | `pnpm run package:win` / electron-builder 25.1.8 |
| Git 空白检查 | 通过 | `git diff --cached --check` 返回 0 |
| 代码提交 | 已完成 | `4a9c6f0` |

第一次生产构建在受限环境中遇到 `spawn EPERM`，确认属于 Windows 沙箱对子进程的限制；在提升权限后使用同一命令成功完成，未发现源码编译错误。

## 四、Windows 产物

- 文件：`outputs\StarChat 0.2.1.exe`
- 类型：Windows x64 Portable
- 大小：78,969,691 bytes（约 75.29 MiB）
- SHA-256：`B8B9E43DDF2C34F703BB7D71B0C094D5FA0B12AB41F5E9877F4847DCF82930E8`
- 签名：未配置代码签名证书，因此为未签名产物。
- 保留策略：保留最终 exe；`outputs\win-unpacked` 和 builder 调试文件已清理。

`outputs/` 在 `.gitignore` 中被定义为生成物目录，因此 exe 保留在本地工作区，没有强行把 75 MiB 生成物塞进源码提交。

## 五、清理结果

已删除本轮产生且不应进入交付目录的内容：

- `code\node_modules`
- `code\out`
- `outputs\win-unpacked`
- `outputs\builder-debug.yml`
- `.firecrawl`

保留内容：源码、`pnpm-lock.yaml`、项目文档、Git 仓库和 `outputs\StarChat 0.2.1.exe`。

## 六、GitHub 推送状态

- 目标 remote：`https://github.com/stardawn2326/StarChat.git`
- 目标分支：`master`
- 本轮源码提交：`4a9c6f0`。
- 本文件将在源码提交之后单独提交，然后与源码一起推送。

## 七、尚需进行的人工验收

以下项目需要在真实 Windows 桌面运行最终 exe 后确认，本轮没有用静态测试替代：

1. 启动后默认进入工作台，右侧栏和底部栏默认折叠。
2. 主窗口最大化后再次点击可恢复；恢复前人物窗口不显示多余最小化按钮。
3. 工作台人物窗口跟随光标开关真实生效。
4. “弹出为桌宠”后工作台人物窗口消失，桌宠窗口出现；桌宠右键或托盘右键可以放回工作台。
5. 桌宠拖动、缩放、透明边缘、窗口定位和返回工作台逻辑与工作台人物窗口一致。
6. 设置页保持工作台样式，仅保留两层：左侧导航融入第一层，右侧内容作为第二层卡片；无多余第三层容器。
7. Live2D 替换模型后，人物背景圆环按预期移除或由新背景替换；边框保持低对比度。
8. Live2D 表情、动作、参数调试和 override 重启后仍然生效。
9. 托盘、最大化/恢复、右键菜单和关闭流程在实际窗口中无异常。

## 八、下一步方案

### 下一步 1：完成远端 CI 验收

- 推送后取得 GitHub Actions run ID 和 URL。
- 确认 Windows 路径、typecheck、Vitest 和 build 在 GitHub Runner 上全部为 green。
- 若失败，只针对 CI 日志中的环境差异修复，不扩大功能范围。

### 下一步 2：完成 Phase B Final 人工验收

- 使用上面的 9 项 Windows checklist。
- 分别验证 personal memory、workspace isolation、memory off、关系修复、STT 首次超时和静音结束。
- 记录截图、操作步骤和实际结果；未通过项单独登记，不回写成“通过”。

### 下一步 3：完成 Phase C Acceptance

- 使用至少一个标准 Live2D 模型和一个非标准参数/动作模型。
- 导出适配器 capability report，确认 override 持久化和模型切换隔离。
- 验证 ZIP 大条目拒绝或受限解压。

### 暂不执行

按方案，Browser Use、Computer Use、任意 Shell、Agent Push 等 Phase D 能力暂不在本轮扩展；除非另行确认，不把它们混入当前提交。
