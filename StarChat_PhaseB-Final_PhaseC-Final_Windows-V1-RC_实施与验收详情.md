# StarChat Phase B Final / Phase C Final / Windows V1 RC 实施与验收详情

> 日期：2026-09-08
> 依据方案：`C:\Users\23260\Downloads\StarChat_下一步实施方案_PhaseB-Final_PhaseC-Final_Windows-V1-RC.md`
> 实现提交：`61eb86172c49e748cbae4bc03a5d0286a51827cf`
> CI：GitHub Actions [StarChat CI #34178037394](https://github.com/stardawn2326/StarChat/actions/runs/34178037394) 已通过

## 1. 本轮完成内容

### Phase B：Memory schema v3 与隔离

- `code/src/shared/memory.ts`
  - schema 从 v2 升级为 v3。
  - 资料记忆增加 `provenance`、`reviewState`。
  - 增加 quarantine 记录，保存未知 session 的安全摘要信息，不参与提示词召回。
- `code/src/main/memory-schema-migration.ts`
  - 启动时识别 v1/v2 `memory.json`。
  - 迁移前生成 `memory.v1.backup.json`。
  - 通过 `SessionStore` 将 personal / workspace session 映射到正确上下文。
  - 未知 session 隔离，不进入 Personal Retrieval；迁移具备幂等性。
- `code/src/main/memory-store.ts`、`memory-service.ts`、`memory-migration.ts`
  - `needs-review` 资料不参与检索。
  - 设置页支持逐条确认、删除、全部确认、全部清除。
  - 旧版伴侣记忆标记为 `legacy + needs-review`。
  - 敏感内容继续拒绝写入。
- `code/src/preload/index.ts`、`code/src/renderer/src/window.d.ts`、`App.tsx`、`SettingsDetailsV2.tsx`
  - 增加审核 IPC 和设置页待确认区域。

### Phase C：按模型保存 Live2D 适配覆盖

- 新增 `code/src/main/live2d-adapter-store.ts`。
- 使用 `Live2DModelRegistry` 稳定模型 ID 作为 key，文件为用户数据目录中的 `live2d-adapter-overrides.json`。
- 仅保存用户覆盖差异，不保存解析后的完整 adapter。
- 旧版 `live2d-adapter.json` 只在 `sourceEntryPath` 精确匹配时迁移，并备份为 `live2d-adapter.v1.backup.json`；无法匹配时不套用到其他模型。
- 删除模型时同步删除该模型覆盖；A/B 模型覆盖、重启、重新导入隔离测试已加入。

### P1：能力报告与关系事件边界

- 新增 `code/src/shared/live2d-capability-report.ts`。
- Live2D 设置页将能力分成：
  - 静态检测：Cubism、纹理、Physics、CDI、Expressions、Motions、Parameters。
  - Runtime 验证：Expressions、Motions、Parameters、Lip-sync。
- 状态明确显示“已检测 / 已验证 / 失败 / 未测试”，不会用资源存在误报运行成功；Lip-sync 未进行麦克风实测时保持“未测试”。
- `relationship-event-classifier.ts` 调整为“助手道歉 + 用户明确接受”才进入 repair，单独出现“抱歉”不会自动修复关系状态。

### Windows V1 RC 发布流程

- 新增 `.github/workflows/release-rc.yml`。
- workflow_dispatch 和 `v*` tag 均可触发 Windows 构建。
- 门禁：安装锁定依赖、typecheck、测试清单、三组测试、Electron build、portable package。
- 生成 portable EXE、`SHA256SUMS.txt`、`release-manifest.json`，当前为未签名内部 RC。
- 新增 `code/test-manifest.json` 与 `code/test-manifest.mjs`，保证每个 `*.test.ts/tsx` 被至少一个 CI 测试调用覆盖。

## 2. 验证结果

| 项目 | 结果 |
| --- | --- |
| TypeScript typecheck | 通过 |
| Test manifest | 通过，106 个测试文件全部被 3 个 invocation 覆盖 |
| Vitest | 通过，106 个测试文件 / 532 个测试 |
| Live2D ZIP 安全回归 | 通过，包含普通导入、路径穿越、加密、符号链接、CRC、超大条目 |
| Electron build | 通过 |
| Windows portable package | 通过 |
| 真实 Windows 窗口 / 托盘 / Live2D / 麦克风验收 | 尚未在目标运行环境完成 |

## 3. 产物

- [StarChat-0.2.1-win-x64-portable.exe](outputs/StarChat-0.2.1-win-x64-portable.exe)
- [SHA256SUMS.txt](outputs/SHA256SUMS.txt)
- [release-manifest.json](outputs/release-manifest.json)

当前产物信息：

- 类型：Windows x64 portable
- 大小：78,974,567 bytes
- SHA-256：`2D83E200D1DD5AA0B5FD2FF103921EE596F38FC2359B5208B6F12D538BDD6363`
- 代码签名：未配置证书，`signed=false`

## 4. 验收文档

- [Phase B Windows 验收记录](docs/acceptance/phase-b-windows.md)
- [Phase C Live2D 验收记录](docs/acceptance/phase-c-live2d.md)
- [Windows V1 RC 发布验收清单](docs/acceptance/windows-v1-release-checklist.md)

## 5. 清理结果与边界

- 已删除 `code/node_modules`、`code/out`、`.pnpm-store`、`logs`、`outputs/win-unpacked` 及构建调试文件。
- 保留源码、锁定构建依赖声明、验收文档、发布元数据和 EXE。
- Phase D 的多 Agent / 多角色 / 云端同步未在本轮实现，继续保持延期边界。
