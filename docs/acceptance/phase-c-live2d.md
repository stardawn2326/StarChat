# Phase C Live2D 验收记录

## 范围

- 每个注册模型使用稳定 `Live2DModelRegistry` ID 保存适配器用户覆盖。
- 只保存覆盖差异，不保存解析后的完整 adapter。
- A/B 模型切换、重启、移除 B、重新导入同一来源时不污染 A。
- 静态资源能力与 Runtime 验证能力分栏展示，状态使用“已检测 / 已验证 / 失败 / 未测试”。

## 验收步骤

1. 导入模型 A，修改一个参数映射并保存；切换模型 B，修改不同映射。
2. 重启应用，分别确认 A/B 显示各自映射。
3. 删除模型 B 的记录，确认 A 的覆盖仍然存在；重新导入 A，确认注册 ID 和覆盖仍稳定。
4. 在模型设置中分别检查静态资源清单、Runtime 表情/动作/参数状态；未执行的 Lip-sync 必须显示“未测试”。
5. 将旧版 `live2d-adapter.json` 放入用户数据目录，确认只在 `sourceEntryPath` 精确匹配时迁移，并生成 `live2d-adapter.v1.backup.json`。

## 结果

- 自动化结果：`live2d-adapter-store.test.ts`、`live2d-capability-report.test.ts`、Live2D registry/adapter tests 通过。
- 真实模型、真实 runtime 和麦克风 Lip-sync：待在目标 Windows 环境执行。
- 记录日期：2026-09-08
