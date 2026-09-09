# Phase B Windows 验收记录

## 范围

- memory schema v3 迁移、备份、会话上下文隔离和旧资料审核。
- Personal Retrieval 不读取 workspace 记忆，也不读取 `needs-review` 资料。
- 敏感内容拒绝持久化，未知 session 进入 quarantine。

## 验收步骤

1. 准备一份 v1/v2 `memory.json`，同时包含 personal session、已授权 workspace session、未知 session 和旧版 profile。
2. 启动 StarChat，确认原文件先备份为 `memory.v1.backup.json`，新文件为 schema v3。
3. 在设置 → 常规中确认“旧版本待确认记忆”只提供“确认保留 / 删除”，未确认项不参与个人对话召回。
4. 分别在个人会话和工作区会话检索相同关键词，确认 workspace 资料不出现在 Personal Retrieval。
5. 重启应用，确认迁移不重复执行、审核状态和 quarantine 保持不变。

## 结果

- 自动化结果：`memory-schema-migration.test.ts`、`memory-service.test.ts` 通过。
- Windows 实际启动和 UI 操作：待在目标 Windows 环境执行。
- 记录日期：2026-09-08
