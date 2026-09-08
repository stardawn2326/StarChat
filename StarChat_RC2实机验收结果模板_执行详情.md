# StarChat RC2 实机验收结果模板执行详情

执行日期：2026-09-08（Asia/Shanghai）  
执行依据：`C:\Users\23260\Downloads\StarChat_RC2实机验收结果模板_PhaseD启动动作.md`  
仓库：`https://github.com/stardawn2326/StarChat`  
分支：`master`

## 1. 模板要求的性质

该文件是 RC2 实机验收结果模板，不是自动化测试脚本，也不是新的源码开发需求。模板明确要求真实测试者在目标 Windows 环境中填写 Gate A–V 的实际结果，并明确当前不应让自动化环境代替执行 GUI、托盘、全局鼠标、真实麦克风、DPI、多显示器和 Live2D 验收。

因此本轮按模板的正确边界执行：

- 不把模板中的 `[ ] PASS`、`[ ] FAIL` 或示例响应当成已发生事实。
- 不运行自动化环境模拟实机 Gate A–V。
- 不修改进入 EXE 的源码、renderer、preload、package 或构建配置。
- 不重新生成或替换 RC2 Artifact。
- 仅新增本执行详情文档并推送，保留 RC2 源码冻结和 Artifact 证据。

## 2. 固定 RC2 测试对象

| 项目 | 固定值 |
| --- | --- |
| RC2 源码冻结点 | `72729661c2defb9a974e868161f0c4fb399501c1` |
| 当前 master（本记录前） | `d49968f0d39fe493a6e17b2503d359be63a43c8f` |
| RC2 CI | [34184416281](https://github.com/stardawn2326/StarChat/actions/runs/34184416281) · success |
| 当前 master CI | [34199865686](https://github.com/stardawn2326/StarChat/actions/runs/34199865686) · success |
| Windows V1 RC Run | [34184659417](https://github.com/stardawn2326/StarChat/actions/runs/34184659417) · success |
| Artifact | `StarChat-windows-v1-rc` · ID `10040133507` |
| EXE | `StarChat-0.2.1-win-x64-portable.exe` |
| Expected SHA-256 | `eb2822e4513495210df580d6550cd6d90ca5c930c776d5bdac91b8a34fb69483` |
| 签名 | `signed=false` |

该 Artifact 的 `release-manifest.json`、`SHA256SUMS.txt` 和实际 EXE 已完成独立核对；这只证明构建可追溯，不替代模板要求的实机行为签收。

## 3. 现有代码与自动化状态

RC2 唯一源码修复仍冻结在 `72729661c2defb9a974e868161f0c4fb399501c1`：

- Live2D Override 明确清空时删除对应模型 Store 记录。
- `undefined`/`null` 意图不会误删已有记录。
- A/B 模型隔离、更新、部分清除、全部清除和重载语义已有自动化覆盖。

已有自动化证据：

- Typecheck：通过。
- test-manifest：通过，覆盖 108 个测试文件。
- 常规套件：106 个文件、535 个测试通过。
- Git runner：1 个文件、3 个测试通过。
- brand migration：1 个文件、2 个测试通过。
- Windows portable 构建、Release manifest 和 Artifact 上传：通过。

本轮不重复执行上述自动化套件，因为没有源码变更；文档提交后的常规 CI 仅用于验证仓库状态，不代表实机模板已被执行。

## 4. 模板填写边界

真实测试者应使用仓库已有的 [`docs/acceptance/windows-v1-rc2-result.md`](docs/acceptance/windows-v1-rc2-result.md)，先记录：

```text
Tester
Date
Windows Edition / Version / Build
CPU / GPU / RAM
DPI
Monitor Count / Resolution / Layout
Default Audio Input / Microphone Model
Live2D Model A / License or Test Permission
Live2D Model B / License or Test Permission
Artifact ID
Actual EXE SHA-256
```

然后按模板顺序填写：

```text
Gate A  Artifact Identity
Gate B  Lifecycle
Gate C  Workbench
Gate D  Desktop Pet
Gate E  DPI
Gate F  Multi-monitor
Gate G-K Memory / Review / Isolation / Relationship
Gate L  STT
Gate O-P Live2D Model A / B
Gate Q-S Override Save / Clear One / Clear All
Gate T  A/B Override Isolation
Gate U  Legacy Adapter
Gate V  ZIP Matrix
Final Restart Smoke
```

每个实际通过项必须有测试者、日期、Artifact ID、SHA 和证据；每个失败项必须有 Case ID、环境、步骤、预期、实际、截图/视频、日志和 Severity。模板中的空栏在没有真实记录前保持未填写。

## 5. 门禁判定

| 项目 | 当前状态 | 说明 |
| --- | --- | --- |
| RC2 代码与自动化 | PASS | 已有 CI、测试和构建证据 |
| RC2 Artifact 身份与哈希 | PASS | Artifact 已下载、解压并独立核对 |
| Gate A–V 实际 Windows 操作 | PENDING | 当前环境没有人工实机验收通道 |
| Windows V1 RC2 | Candidate | 尚未取得真实测试者签收 |
| Phase D | HOLD | 任一 P0 未有实机结论前不得启动 |

任何 P0 失败都必须转入 `RC2 REJECTED → RC3 新源码/新 CI/新 Release/新 Artifact`；不能继续沿用旧 RC2 SHA 或 Artifact 结论。只有所有 P0 通过，才允许提交 `docs: accept Windows V1 RC2` 并创建 `feat/phase-d-foundation`。

## 6. 本轮实际变更

本轮只新增本文件作为模板执行详情，未改变应用源码、自动化测试、构建配置或 RC2 二进制。推送后的 CI 只验证这份文档提交不破坏仓库工程状态。

最终准确状态：

```text
RC2 Code / Automation      PASS
RC2 Artifact               PASS
RC2 Real Windows Sign-off  PENDING
Phase D Foundation         HOLD
Agent V1.5                 HOLD
```
