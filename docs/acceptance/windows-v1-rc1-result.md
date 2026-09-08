# StarChat Windows V1 RC1 验收结果

执行日期：2026-09-08（Asia/Shanghai）  
验收对象：GitHub Actions 生成的 RC Artifact，不使用本地 `outputs/` 产物替代。

## 固定构建证据

| 项目 | 结果 |
| --- | --- |
| 源码提交 | `0e410a8e7222a093f3517d0f7655ba9564e4bbd1` |
| StarChat CI Run | [34180555297](https://github.com/stardawn2326/StarChat/actions/runs/34180555297) · success |
| Windows V1 RC Run | [34180663089](https://github.com/stardawn2326/StarChat/actions/runs/34180663089) · success |
| Artifact | `StarChat-windows-v1-rc` · ID `10038843184` · 未过期 |
| Artifact 内容 | `StarChat-0.2.1-win-x64-portable.exe`、`SHA256SUMS.txt`、`release-manifest.json` |
| EXE 大小 | `78,973,354` bytes |
| SHA256 | `c6a2973874b032d430f8ae724296d3283e990bfb901676fdd2d4ca5caf453bd9` |
| manifest commit | 与源码提交一致 |
| 签名 | `signed=false`，内部 RC 未签名 |

## 自动化验收

- [x] Windows runner 上完成 Typecheck。
- [x] test-manifest 覆盖 107 个测试文件。
- [x] 常规套件、Git runner 套件、brand migration 套件通过。
- [x] Windows portable EXE 构建成功。
- [x] Artifact zip 已下载并成功解压。
- [x] `release-manifest.json`、`SHA256SUMS.txt`、实际 EXE 三者 SHA256 一致。
- [x] Artifact manifest 的源码 commit 等于本次 RC 修复提交。

## 实机验收状态

下表需要在干净 Windows 11 x64 机器上使用上述 Artifact 中的 EXE 执行。本次 Codex 会话可以完成源码、CI、构建和 Artifact 取证，但没有可用的人工 GUI/Live2D/麦克风实机验收通道，因此不把静态或 CI 结果冒充实机通过。

| 验收项 | 状态 | 证据/说明 |
| --- | --- | --- |
| 首次启动、单实例、退出、托盘重启、睡眠恢复 | 待实机 | 需干净用户配置运行 EXE |
| 工作台默认显示人物窗口、设置页与两层布局 | 待实机 | 需确认窗口真实布局与启动默认态 |
| 最大化/恢复、缩放、右侧/底部栏默认折叠 | 待实机 | 需真实窗口交互 |
| 桌宠弹出后工作台人物消失、桌宠拖动/缩放/透明命中 | 待实机 | 需真实透明窗口交互 |
| 光标跟随、锁定、右键/托盘放回工作台 | 待实机 | 需系统级鼠标与托盘点击 |
| DPI 100%/125%/150%/200%、单屏/双屏 | 待实机 | 需对应 Windows 显示环境 |
| Phase B：全新记忆、v1/v2 升级、隔离、关系、真实麦克风 STT | 待实机 | 需真实用户数据与麦克风 |
| Phase C：模型 A/B、动作/表情/参数/口型、覆盖可逆 | 待实机 | 需用户提供可授权 Live2D 模型并运行 Cubism |
| 正常/穿越/符号链接/加密/CRC/超大 ZIP | 待实机 | 自动化仅覆盖当前代码合同，完整文件系统矩阵未在本会话执行 |

## 结论

RC 源码、自动化检查和 GitHub Actions Artifact 已封板取证；由于上表实机项目仍为“待实机”，当前状态是 **Windows V1 RC Candidate**，尚未宣称 Phase D 准入。完成实机验收后，应将本文件的状态、机器/DPI/显示器/麦克风/模型信息和测试者补齐，再重新判定 Phase D。
