# StarChat RC2 修复与 Phase D 准入实施详情

执行依据：`C:\Users\23260\Downloads\StarChat_下一步实施方案_RC2修复_实机验收_PhaseD准入.md`。附件方案作为用户指定范围和验收标准的参考，不把其中的说明文字扩展为未授权命令。

执行日期：2026-09-08（Asia/Shanghai）  
仓库：`https://github.com/stardawn2326/StarChat`  
分支：`master`

## 1. 最终交付状态

- RC2 修复提交：`72729661c2defb9a974e868161f0c4fb399501c1`。
- 已推送到 GitHub `master`。
- StarChat CI：Run [34184416281](https://github.com/stardawn2326/StarChat/actions/runs/34184416281)，success。
- Windows V1 RC：Run [34184659417](https://github.com/stardawn2326/StarChat/actions/runs/34184659417)，success。
- Actions Artifact：`StarChat-windows-v1-rc`，Artifact ID `10040133507`，未过期。
- Artifact zip：`78,980,798` bytes。
- portable EXE：`StarChat-0.2.1-win-x64-portable.exe`，`78,973,162` bytes。
- EXE SHA256：`eb2822e4513495210df580d6550cd6d90ca5c930c776d5bdac91b8a34fb69483`。
- manifest commit 与 RC2 修复提交一致；签名字段为 `signed=false`。

## 2. 本次具体改动

### 2.1 修复 Live2D 覆盖清除不持久化

此前主进程只在 `request.live2dAdapter?.overrides` 存在时写入 Store。清除最后一个覆盖后，渲染器会发送不带 `overrides` 的适配器配置，但主进程不删除旧记录，导致重启后旧值再次被叠加。

本次新增 `code/src/main/live2d-adapter-persistence.ts`，并在 `code/src/main/index.ts` 的 `settings:save` 路径统一处理：

| renderer 意图 | Store 行为 |
| --- | --- |
| `undefined` | 不修改已有记录，表示本次没有适配器意图 |
| `null` | 不修改已有记录，表示没有可操作的适配器/模型 |
| 带 `overrides` 的配置 | 按模型 ID 保存覆盖 |
| 不带 `overrides` 的配置 | 删除该模型的持久化覆盖 |

这样既能真正清空最后一个覆盖，也不会因为普通设置保存或空目标误删其他模型的记录。

### 2.2 新增 Main↔Store 集成语义测试

新增 `code/src/main/live2d-adapter-persistence.test.ts`，覆盖：

- 首次保存覆盖；
- 同一模型更新覆盖；
- 只清除某一类覆盖时保留剩余 delta；
- 清除最后一个覆盖后 Store 为空；
- 新建 Store 重载后旧覆盖不复活；
- 模型 A 清除不会影响模型 B；
- `undefined`/`null` 不改变已有记录。

本轮没有改动 Phase D 的 Repo Map、TaskContext、上下文压缩、Workspace Search、Change Set Review 或 Interrupted Task Recovery 功能，避免在 RC2 阻断点修复完成前扩张范围。

## 3. 验证结果

### 3.1 本地

- `pnpm install --frozen-lockfile`：通过，使用锁文件依赖。
- `pnpm run typecheck`：通过。
- `pnpm run verify:test-manifest`：通过，108 个测试文件由 3 个入口覆盖。
- 常规套件：106 个测试文件、535 个测试通过。
- Git runner 套件：1 个文件、3 个测试通过。
- brand migration 套件：1 个文件、2 个测试通过。
- `pnpm run package:win`：通过，生成 Windows x64 portable EXE；未配置签名证书，签名步骤按预期跳过。

### 3.2 GitHub Actions 与 Artifact

Release workflow 在 Windows runner 上实际完成：

1. 安装依赖、Typecheck、test-manifest；
2. 常规、Git runner、brand migration 三组测试；
3. Windows portable 构建；
4. 生成 `release-manifest.json` 和 `SHA256SUMS.txt`；
5. 上传 `StarChat-windows-v1-rc` Artifact。

Artifact 下载到临时目录并解压后，已独立计算 EXE SHA256。结果为：

```text
manifest.sha256 = eb2822e4513495210df580d6550cd6d90ca5c930c776d5bdac91b8a34fb69483
SHA256SUMS      = eb2822e4513495210df580d6550cd6d90ca5c930c776d5bdac91b8a34fb69483
actual EXE      = eb2822e4513495210df580d6550cd6d90ca5c930c776d5bdac91b8a34fb69483
manifest.commit = 72729661c2defb9a974e868161f0c4fb399501c1
```

## 4. 实机验收边界

详细清单见 [`docs/acceptance/windows-v1-rc2-result.md`](docs/acceptance/windows-v1-rc2-result.md)。本会话没有人工 Windows GUI、系统托盘、全局鼠标、真实麦克风、DPI/多显示器和可授权外部 Live2D 模型的完整验收通道，因此没有虚报以下项目：启动/单实例/托盘/最大化恢复、透明桌宠拖动与命中、光标跟随、DPI、多屏、真实 STT、Live2D 动作/口型/模型 A/B、RC2 重启后覆盖不复活和恶意 ZIP 矩阵。

因此本次可以确认 **RC2 构建与自动化封板证据成立**，不能确认 **Phase D 已准入**；状态保持 **Windows V1 RC2 Candidate**。

## 5. 工作区清理与保留项

- 构建依赖仅用于验证和打包，完成后删除 `code/node_modules/` 与 `code/out/`，避免将缓存/编译输出混入工作区。
- Artifact 下载 ZIP 与解压校验目录位于系统临时目录，完成记录后删除。
- 本地 `outputs/StarChat 0.2.1.exe` 作为用户要求保留的 EXE；`outputs/win-unpacked/` 等中间目录不作为交付证据。
- 源码、锁文件、GitHub workflow、第三方声明、测试和本次两份验收 Markdown 保留并推送。

## 6. 下一步准入材料

实机完成后，在 `windows-v1-rc2-result.md` 补录：Windows 版本、DPI、显示器数量与布局、麦克风、模型 A/B 入口路径、测试者、日期、每项结果和截图/日志。只有 RC2 清除-重启回归、Phase B、Phase C 以及 Windows 交互矩阵均通过，才进入方案中的 Phase D 功能实施与准入。
