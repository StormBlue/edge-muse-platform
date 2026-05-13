# Review Round 6 — 文档与 OpenAPI

**日期**: 2026-05-13
**视角**: 文档契约、OpenAPI schema、运维说明
**审核范围**: `docs/`、`AGENTS.md`、`ARCHITECTURE.md`、OpenAPI source
**关联需求**: [`requirements.md`](./requirements.md)
**关联任务**: [`tasks.md`](./tasks.md)

---

## 审核清单

- [x] 搜索 key group、`maxConcurrency`、`activeSlots`、`assigned_at` 文档覆盖。
- [x] 对照后端策略复查 OpenAPI 中 admin/user 最大同时任务数字段。
- [x] 复查运维文档是否说明 queued 不超时与 stale assigned 修复。
- [x] 复查 AGENTS/ARCHITECTURE 是否说明 `provider_key_id` 兼容占位语义。

---

## 发现

### P0

无。

### P1

无。

### P2

#### Finding #1: OpenAPI 未说明普通 user 最大任务数为 10

- **位置**: `server/src/docs/openapi/adminPaths.ts`
- **现象**: `/api/admin/users` 创建/编辑的 `maxConcurrentTasks` 只写了最大 15。
- **影响**: 文档读者可能误以为普通 user 也可设到 15；实际后端会按角色拒绝 user 超过 10。
- **建议修复**: 在字段说明中明确 admin 最大 15、普通 user 最大 10。

---

## 修复

| Finding | 状态 | 备注                                                      |
| ------- | ---- | --------------------------------------------------------- |
| #1      | ✅   | 在 admin/user OpenAPI request schema 中补充角色差异说明。 |

---

## 修复后验证

- [x] 静态搜索确认核心文档覆盖 key group、队列和 `assigned_at` 语义

---

## 下一轮关注点

Round 7 聚焦 i18n 与前端回归，重点检查新增中英文 key、残留单 key 分配 UI 和类型契约。

---

## 总结

本轮修复 1 个 P2 文档契约问题。OpenAPI、API 文档、可靠性和运维文档现在都与角色并发上限和 `assigned_at` 调度语义一致。
