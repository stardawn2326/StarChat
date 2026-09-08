# StarChat Windows V1 RC2 验收结果

执行日期：2026-09-08（Asia/Shanghai）  
执行依据：`C:\Users\23260\Downloads\StarChat_下一步实施方案_RC2修复_实机验收_PhaseD准入.md`  
验收对象：GitHub Actions 生成的 RC2 Artifact，不使用本地 `outputs/` 产物替代远端证据。

## 固定构建证据

| 项目 | 结果 |
| --- | --- |
| RC2 修复提交 | `72729661c2defb9a974e868161f0c4fb399501c1` |
| StarChat CI Run | [34184416281](https://github.com/stardawn2326/StarChat/actions/runs/34184416281) · success |
| Windows V1 RC Run | [34184659417](https://github.com/stardawn2326/StarChat/actions/runs/34184659417) · success |
| Artifact | `StarChat-windows-v1-rc` · ID `10040133507` · 未过期 |
| Artifact zip 大小 | `78,980,798` bytes |
| Artifact 内容 | `StarChat-0.2.1-win-x64-portable.exe`、`SHA256SUMS.txt`、`release-manifest.json` |
| EXE 大小 | `78,973,162` bytes |
| EXE SHA256 | `eb2822e4513495210df580d6550cd6d90ca5c930c776d5bdac91b8a34fb69483` |
| manifest commit | 与 RC2 修复提交一致 |
| 签名 | `signed=false`，未配置代码签名证书 |

## 自动化验收

- [x] TypeScript 类型检查通过。
- [x] `test-manifest` 通过，覆盖 108 个测试文件，由 3 个入口执行。
- [x] 常规套件通过：106 个测试文件、535 个测试。
- [x] Git runner 套件通过：1 个文件、3 个测试。
- [x] brand migration 套件通过：1 个文件、2 个测试。
- [x] Electron Vite build 与 Windows portable 打包通过。
- [x] GitHub Windows runner 完成 Typecheck、manifest、三组测试、portable 构建、manifest 生成和 Artifact 上传。
- [x] Artifact 已下载并成功解压。
- [x] `release-manifest.json`、`SHA256SUMS.txt`、实际 EXE 的 SHA256 完全一致。
- [x] manifest 中的源码 commit 等于本次 RC2 修复提交。

## RC2 修复验收范围

本轮只修复方案中确认的 Live2D 覆盖持久化回归，没有提前加入 Phase D 功能：

1. 主进程设置保存改为调用 `code/src/main/live2d-adapter-persistence.ts`。
2. `overrides` 存在时保存对应模型的覆盖；明确的空适配器配置时删除该模型覆盖。
3. `undefined` 和 `null` 意图不修改已有记录，保留 IPC 三态语义。
4. 新增 `code/src/main/live2d-adapter-persistence.test.ts`，覆盖保存、更新、部分清除、全部清除、A/B 模型隔离、重载不复活以及 `undefined`/`null` 不变更。

## 实机验收状态

本次会话完成了源码、自动化、Windows runner、Artifact 下载/解压和哈希取证；没有可用的人工 Windows GUI、系统托盘、全局鼠标、真实麦克风、DPI/多显示器和外部 Live2D 模型验收通道，因此不把静态或 CI 结果冒充实机通过。

| 验收项 | 状态 | 需要补充的证据 |
| --- | --- | --- |
| 首次启动、单实例、退出、托盘重启、睡眠恢复 | 待实机 | 干净 Windows 用户配置运行上述 EXE |
| 工作台默认显示人物窗口、设置页与两层布局 | 待实机 | 启动截图和实际窗口操作记录 |
| 最大化/恢复、缩放、右侧/底部栏默认折叠 | 待实机 | 真实窗口交互记录 |
| 桌宠弹出后工作台人物消失、桌宠拖动/缩放/透明命中 | 待实机 | 透明窗口交互记录 |
| 光标跟随、锁定、右键/托盘放回工作台 | 待实机 | 系统鼠标和托盘操作记录 |
| RC2：修改、清除最后一个覆盖、重启后不复活 | 待实机 | 设置页操作、配置文件和重启前后截图/日志 |
| DPI 100%/125%/150%/200%、单屏/双屏 | 待实机 | 对应 Windows 显示环境记录 |
| Phase B：记忆升级、关系和真实麦克风 STT | 待实机 | 用户数据、麦克风与运行记录 |
| Phase C：模型 A/B、动作/表情/参数/口型、覆盖可逆 | 待实机 | 可授权 Live2D 模型和运行记录 |
| 正常/穿越/符号链接/加密/CRC/超大 ZIP | 待实机 | 完整文件系统矩阵记录 |

## 结论

RC2 源码、自动化检查和 GitHub Windows Artifact 已完成取证，当前状态为 **Windows V1 RC2 Candidate**。旧 RC1 Candidate 文档与 Artifact 记录保留作为历史证据。由于实机表仍为“待实机”，本文件不宣称 Phase D 已准入；完成实机验收并补齐机器、DPI、显示器、麦克风、模型和截图/日志信息后，才能作最终准入判定。
