# StarChat RC2 实机签收 → Phase D Foundation → Agent V1.5 执行记录

执行日期：2026-09-08（Asia/Shanghai）  
执行依据：`C:\Users\23260\Downloads\StarChat_下一步实施方案_RC2实机签收_PhaseD-Foundation_Agent-V1.5.md`  
仓库：`https://github.com/stardawn2326/StarChat`  
分支：`master`

## 1. 本轮执行边界

方案明确规定：RC2 Artifact 的真实 Windows 实机签收是 Phase D Foundation 的唯一前置门禁。当前 RC2 仍是 Candidate，且本执行环境没有可操作的人工 Windows GUI、系统托盘、全局鼠标、真实麦克风、DPI/多显示器和外部 Live2D 模型验收通道。

因此本轮执行到 RC2 实机签收门禁为止：

- 不把 CI、静态测试或本地打包冒充真实实机通过。
- 不提前实现 Phase D 的 Agent 权限、Repo Map、TaskContext、Context Compression、Workspace Search、Change Set Review 或 Interrupted Task Recovery。
- 不修改会进入 EXE 的源码、renderer、preload、package 或构建配置。
- 不生成或沿用一个未经实机签收的新 RC2/Phase D 二进制结论。
- 仅新增本执行记录文档并推送，保持 RC2 源码冻结点不变。

## 2. 当前固定证据

| 项目 | 结果 |
| --- | --- |
| RC2 源码冻结点 | `72729661c2defb9a974e868161f0c4fb399501c1` |
| 当前 master（文档记录前） | `736a69ee6bf524faf2380b2fa5636d8e262408f3` |
| RC2 CI | [34184416281](https://github.com/stardawn2326/StarChat/actions/runs/34184416281) · success |
| 当前 master CI | [34195183526](https://github.com/stardawn2326/StarChat/actions/runs/34195183526) · success |
| Windows V1 RC Run | [34184659417](https://github.com/stardawn2326/StarChat/actions/runs/34184659417) · success |
| Artifact | `StarChat-windows-v1-rc` · ID `10040133507` |
| 实机签收 EXE | `StarChat-0.2.1-win-x64-portable.exe` |
| 实机签收 SHA-256 | `eb2822e4513495210df580d6550cd6d90ca5c930c776d5bdac91b8a34fb69483` |
| Artifact 签名 | `signed=false` |

Artifact 的 `release-manifest.json`、`SHA256SUMS.txt` 和实际 EXE 已完成独立下载、解压和 SHA256 三方核对；该证据只证明产物可追溯，不等于实机签收。

## 3. 已完成的代码与自动化状态

RC2 代码修复已经在前一阶段完成并推送：

- `code/src/main/live2d-adapter-persistence.ts`：明确区分保存、清除和无意图三态。
- `code/src/main/index.ts`：设置保存路径在明确清空覆盖时删除对应模型 Store 记录。
- `code/src/main/live2d-adapter-persistence.test.ts`：覆盖保存、更新、部分清除、全部清除、重载、A/B 隔离及 `undefined`/`null` 语义。

自动化证据：

- Typecheck：通过。
- test-manifest：通过，覆盖 108 个测试文件。
- 常规套件：106 个文件、535 个测试通过。
- Git runner：1 个文件、3 个测试通过。
- brand migration：1 个文件、2 个测试通过。
- Windows portable 打包：通过。
- 当前 master 的文档提交 CI：通过。

## 4. 当前门禁判定

| 门禁 | 状态 | 原因 |
| --- | --- | --- |
| RC2 代码与自动化 | PASS | CI、测试、构建和 Artifact 证据齐全 |
| RC2 Artifact 可追溯 | PASS | manifest、SUMS、实际 EXE 哈希一致 |
| Gate A：Lifecycle | 待实机 | 需要双击、单实例、托盘、退出、睡眠恢复 |
| Gate B：Workbench | 待实机 | 需要真实窗口、布局、最大化/恢复和栏位交互 |
| Gate C：Desktop Pet | 待实机 | 需要透明命中、拖动、缩放、锁定、放回工作台 |
| Gate D：DPI/多显示器 | 待实机 | 需要 100%/125%/150%/200% 和至少单屏/双屏 |
| Gate E-K：Memory/Relationship/STT | 待实机 | 需要真实用户配置、麦克风和运行交互 |
| Gate L-P：Live2D/Override/ZIP | 待实机 | 需要合法模型、重启验证、文件系统矩阵 |
| Phase D Foundation | HOLD | 等待 RC2 实机 Gate 全部通过 |
| Agent V1.5 | HOLD | 按方案不得提前扩展 |

## 5. 必须使用的实机对象

实机测试者必须使用上表 Artifact 对应的 EXE，并在 [`docs/acceptance/windows-v1-rc2-result.md`](docs/acceptance/windows-v1-rc2-result.md) 补齐：

```text
Tester
Date
Windows Edition / Build
CPU / GPU / RAM
DPI
Monitor Count / Layout
Default Audio Input / Microphone Model
Live2D Model A / Model B
Artifact ID
EXE SHA256
每个 Gate 的 PASS / FAIL
截图、视频、日志和失败 Case ID
```

特别要完成方案中的 RC2 核心回归：

```text
设置 Model A Override
保存并重启，确认 Override 存在
恢复单项自动，确认其他 Override 保留
恢复全部自动，退出并重启
确认 Model A 旧 Override 不复活
确认 Model B 的 Override 不受影响
```

## 6. Phase D 启动条件

只有当 RC2 实机清单中所有 P0 项通过后，才按方案顺序创建 Phase D 工作分支并实施：

```text
D0 Contracts & Telemetry
D1 Repo Map
D2 TaskContext
D3 Context Compression
D4 Workspace Search
D5 Change Set Review
D6 Interrupted Task Recovery
D7 Agent V1.5 E2E
```

如任何 RC2 P0 项失败，应进入 `Phase D HOLD → 修复 → RC3 新 Artifact → 受影响 Gate 回归`，不能继续沿用本 RC2 SHA 或 Artifact 结论。

## 7. 本轮结论

本轮没有新增源码功能，也没有改变 RC2 二进制；只新增本执行记录并推送到 GitHub。当前准确结论是：

```text
RC2 代码与自动化：PASS
RC2 Artifact 取证：PASS
RC2 真实 Windows 签收：待实机
Phase D Foundation：HOLD
Agent V1.5：HOLD
```

这符合方案的门禁顺序和“自动化证据不替代实机验收”要求。
