# StarChat RC2 实机签收操作手册执行详情

执行日期：2026-09-08（Asia/Shanghai）  
执行依据：`C:\Users\23260\Downloads\StarChat_RC2实机签收操作手册_PhaseD启动准入方案.md`  
仓库：`https://github.com/stardawn2326/StarChat`  
分支：`master`

## 1. 方案性质与执行结论

该手册明确说明：它是 RC2 实机签收操作手册，不是新的开发需求清单。Phase D Foundation 和 Agent V1.5 只有在 RC2 Artifact 完成真实 Windows Gate A–V 且所有 P0 通过后才允许启动。

本轮按手册执行到实机门禁：

```text
RC2 源码与自动化       PASS
RC2 Release Artifact  PASS
RC2 Artifact 可追溯   PASS
RC2 真实实机签收       PENDING
Phase D Foundation     HOLD
Agent V1.5              HOLD
```

当前环境没有可操作的人工 Windows GUI、系统托盘、全局鼠标、真实麦克风、DPI/多显示器和外部 Live2D 模型验收通道。因此没有伪造 Gate A–V 的 PASS，也没有把 CI 结果替代实机结果。

## 2. RC2 固定测试对象

| 项目 | 固定值 |
| --- | --- |
| RC2 源码冻结点 | `72729661c2defb9a974e868161f0c4fb399501c1` |
| 当前 master（本记录前） | `489d4b6cff963c3d073480d7b72fe7f276030452` |
| RC2 CI | [34184416281](https://github.com/stardawn2326/StarChat/actions/runs/34184416281) · success |
| 当前 master CI | [34196433414](https://github.com/stardawn2326/StarChat/actions/runs/34196433414) · success |
| Windows V1 RC Run | [34184659417](https://github.com/stardawn2326/StarChat/actions/runs/34184659417) · success |
| Artifact | `StarChat-windows-v1-rc` · ID `10040133507` |
| EXE | `StarChat-0.2.1-win-x64-portable.exe` |
| EXE SHA-256 | `eb2822e4513495210df580d6550cd6d90ca5c930c776d5bdac91b8a34fb69483` |
| 签名 | `signed=false` |

Artifact 的 manifest、`SHA256SUMS.txt` 和实际 EXE 已完成下载、解压和三方 SHA256 核对。手册规定实机必须使用这个 Artifact，不得用本地 `outputs/StarChat 0.2.1.exe` 代替。

## 3. 已完成的代码与自动化证据

RC2 的唯一代码修复已在冻结点完成：

- `code/src/main/live2d-adapter-persistence.ts`：保存、清除和无意图三态处理。
- `code/src/main/index.ts`：明确清空最后一个 Live2D Override 时删除模型 Store 记录。
- `code/src/main/live2d-adapter-persistence.test.ts`：保存、更新、部分清除、全部清除、重载、A/B 隔离和 `undefined`/`null` 测试。

自动化检查已通过：

- Typecheck；
- test-manifest，覆盖 108 个测试文件；
- 常规套件 106 个文件、535 个测试；
- Git runner 套件 1 个文件、3 个测试；
- brand migration 套件 1 个文件、2 个测试；
- Windows portable 构建和 Release Artifact 上传。

本轮没有改动上述源码，也没有重新生成一个新的 RC2 二进制。

## 4. 实机执行清单状态

手册中的以下门组仍需在真实 Windows 环境执行并填入仓库已有的 [`docs/acceptance/windows-v1-rc2-result.md`](docs/acceptance/windows-v1-rc2-result.md)：

| 门组 | 内容 | 状态 |
| --- | --- | --- |
| Gate A | Artifact 身份、文件名、SHA | 待测试者记录 |
| Gate B | 首次启动、单实例、托盘、退出、睡眠恢复 | 待实机 |
| Gate C | Workbench、人物窗口、最大化、恢复、缩放、栏位 | 待实机 |
| Gate D | 桌宠弹出、透明命中、拖动、缩放、锁定、放回工作台 | 待实机 |
| Gate E | 100%/125%/150%/200% DPI | 待实机 |
| Gate F | 单屏/双屏、跨屏拖动与重启位置 | 待实机 |
| Gate G-K | Fresh Memory、Memory Off、v1/v2 迁移、Review、隔离、Relationship | 待实机 |
| Gate L | 真实麦克风 STT 生命周期与错误矩阵 | 待实机 |
| Gate O-P | Live2D 模型 A/B 导入、渲染、能力、动作、参数、口型 | 待实机 |
| Gate Q-S | Override 保存、清除单项、清除全部、重启不复活 | 待实机 |
| Gate T | A/B Override 隔离 | 待实机 |
| Gate U | Legacy Adapter 一次性迁移 | 待实机 |
| Gate V | normal/traversal/symlink/encrypted/bad-CRC/oversized ZIP | 待实机 |

每个通过项应记录测试者、日期、Artifact ID、SHA；每个失败项应记录 Case ID、环境、步骤、预期、实际、截图/视频、日志和严重级别。任何 P0 失败都应保持 Phase D HOLD 并进入 RC3 流程。

## 5. Phase D 启动边界

本轮不创建 `feat/phase-d-foundation`，不增加 Agent 权限，不新增 Repo Map、TaskContext、Context Compression、Workspace Search、Change Set Review 或 Interrupted Task Recovery 代码。原因是手册要求先完成 RC2 实机签收，当前门禁尚未具备签收证据。

RC2 全部 P0 通过后，才按以下顺序启动：

```text
docs: accept Windows V1 RC2
→ feat/phase-d-foundation
→ D0 Contracts & Telemetry
→ D1 Repo Map
→ D2 TaskContext
→ D3 Context Compression
→ D4 Workspace Search
→ D5 Change Set Review
→ D6 Interrupted Task Recovery
→ D7 Agent V1.5 E2E
```

如果实机发现任何进入 EXE 的问题，必须创建新修复提交、重新 CI、重新 Release、取得新 Artifact ID 和新 SHA，并将本 RC2 结果保留为历史证据，不能覆盖或继续沿用旧 RC2 结论。

## 6. 本轮实际变更

本轮只新增本文件作为手册执行记录，未修改应用源码、构建配置或 RC2 二进制。文档提交后推送到 GitHub，并由 CI 重新验证文档提交不影响当前工程状态。

最终准确状态：

```text
RC2 自动化封板：PASS
RC2 Artifact 取证：PASS
RC2 真实 Windows 签收：PENDING
Phase D Foundation：HOLD
Agent V1.5：HOLD
```
