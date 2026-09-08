# StarChat RC 封板与 Phase D 准入实施详情

执行依据：`C:\Users\23260\Downloads\StarChat_下一步实施方案_RC封板_实机验收_PhaseD准入.md`。附件内容作为本次用户指定方案的参考，未被当作额外命令扩展范围。

执行日期：2026-09-08（Asia/Shanghai）  
仓库：`https://github.com/stardawn2326/StarChat`  
分支：`master`

## 1. 最终交付状态

- RC 修复提交：`0e410a8e7222a093f3517d0f7655ba9564e4bbd1`。
- 已推送到 GitHub `master`。
- StarChat CI：Run [34180555297](https://github.com/stardawn2326/StarChat/actions/runs/34180555297)，success。
- Windows V1 RC：Run [34180663089](https://github.com/stardawn2326/StarChat/actions/runs/34180663089)，success。
- Actions Artifact：`StarChat-windows-v1-rc`，Artifact ID `10038843184`，未过期。
- Artifact 中的 portable EXE：`StarChat-0.2.1-win-x64-portable.exe`，78,973,354 bytes。
- EXE SHA256：`c6a2973874b032d430f8ae724296d3283e990bfb901676fdd2d4ca5caf453bd9`。
- Artifact manifest commit 与 RC 修复提交一致；签名字段为 `signed=false`。

## 2. 本次具体改动

### 2.1 Live2D 覆盖真正可逆

- 新增 `code/src/shared/live2d-adapter-overrides.ts`，集中提供语义覆盖、参数覆盖、单项清除和全部清除的纯函数。
- 清除操作删除 delta 键；不再把旧的手动值伪装成“自动检测”。空 delta 会被清理为没有 `overrides`。
- `Live2DModelState` 增加自动检测基线 `autoAdapter`。
- 主进程每次公开状态都以当前模型重新解析自动 adapter，再叠加用户 delta。
- 设置页的语义与参数下拉框加入“恢复自动检测”，并提供“恢复全部自动”。

### 2.2 旧适配器迁移一次性消费

- 精确匹配模型入口路径后才迁移旧覆盖。
- 成功迁移后将 `live2d-adapter.json` 改名为 `live2d-adapter.v1.migrated.json`，避免重置后再次导入旧值。
- 仍保留 `live2d-adapter.v1.backup.json` 作为迁移前备份。

### 2.3 Memory v1/v2 与旧 Profile

- 记忆迁移备份改为 `memory.v${sourceVersion}.backup.json`，v1/v2 互不覆盖。
- 旧版待审资料遇到用户新的显式同事实时会晋级为 active；例如 `我喜欢紫色` 与 `我现在还是喜欢紫色` 会合并而不重复要求人工审核。
- 仅对同角色、同资料类型且经过受限稳定化的事实进行合并，避免把无关资料误合并。

### 2.4 CI 与第三方声明

- GitHub Actions 升级到当前 Node 24-compatible 主版本：checkout `v7`、setup-node `v6`、upload-artifact `v7`、pnpm/action-setup `v6`。
- 新增 `THIRD_PARTY_NOTICES.md`，索引 Live2D Cubism Web Core/Framework 的 LICENSE 与 NOTICE。
- 新增许可证/声明存在性测试，确认 bundled Cubism Core 与对应文本仍在仓库。

## 3. 验证结果

### 本地

- `pnpm run typecheck`：通过。
- `pnpm run verify:test-manifest`：通过，107 个测试文件由 3 个入口覆盖。
- 常规套件：105 个测试文件、533 个测试通过。
- Git runner 套件：1 个文件、3 个测试通过。
- brand migration 套件：1 个文件、2 个测试通过。
- Electron Vite build：通过。

### GitHub Actions

Release workflow 按方案要求实际执行了 Windows runner 上的 Typecheck、manifest 校验、三组测试、portable EXE 构建、release manifest 生成和 Artifact 上传。Artifact 已下载到临时目录并解压成功；manifest、SUMS 和实际 EXE 的 SHA256 完全一致。

## 4. 实机验收边界

实机验收结果详见 [`docs/acceptance/windows-v1-rc1-result.md`](docs/acceptance/windows-v1-rc1-result.md)。本会话没有人工 GUI、系统托盘、全局鼠标、真实麦克风、DPI/多显示器和可授权外部 Live2D 模型的完整验收通道，因此以下内容没有虚报为通过：启动/单实例/托盘/最大化恢复、透明桌宠拖动与命中、光标跟随、DPI、多屏、真实 STT、Live2D 动作/口型/模型 A/B、恶意 ZIP 矩阵。

因此本次可以确认 **RC 构建与自动化封板证据成立**，不能确认 **Phase D 已准入**；状态保持 Windows V1 RC Candidate，待实机记录补齐后再判定。

## 5. 工作区清理

- `code/node_modules/`、`code/out/`、本地 RC zip、解压校验目录和 `.firecrawl/` 均为临时/生成内容，不进入 GitHub；完成记录后删除。
- 用户源码、构建配置、锁文件、第三方源文件、测试和验收文档保留。

## 6. 后续准入材料

实机完成后，应在验收结果文件补录：Windows 版本、DPI、显示器数量与布局、麦克风、模型 A/B 入口路径、测试者、日期、每项结果和截图/日志。只有这些项与 Phase B/Phase C 结果均通过，才进入方案中 Phase D 的 repo map、任务上下文、上下文压缩、搜索、diff review 与 recovery 交付。
