# Review Round 8 — 性能与查询

**日期**: 2026-05-13
**视角**: 查询性能、调度批量、索引利用
**审核范围**: scheduler SQL、provider key 列表统计、recovery 扫描、migration 索引
**关联需求**: [`requirements.md`](./requirements.md)
**关联任务**: [`tasks.md`](./tasks.md)

---

## 审核清单

- [x] 复查 `getNextQueuedTaskForGroup` 是否按 group/status/queued 索引扫描。
- [x] 复查 active slot 统计只统计 `queued/running + assigned_at`。
- [x] 复查 DO 单次 dispatch batch 上限。
- [x] 复查 recovery 扫描 limit 和 KV throttle。
- [x] 复查 migration 是否为 group queued 与 provider key status 建索引。

---

## 发现

### P0

无。

### P1

无。

### P2

无。

---

## 修复

无新增修复。

---

## 修复后验证

- [x] `idx_tasks_group_queued(provider_key_group_id, status, queued_at)` 覆盖 group queued 查询。
- [x] `idx_tasks_provider_key_status(provider_key_id, status)` 支持 active slot 聚合过滤。
- [x] DO `DISPATCH_BATCH_LIMIT=20` 避免单次 alarm 长时间占用。
- [x] recovery 默认 limit 20 且 KV throttle 60 秒，避免高流量重复扫库。

---

## 下一轮关注点

Round 9 聚焦迁移与兼容，重点确认旧单 key 数据回填、legacy fallback 和 D1 迁移可落地。

---

## 总结

本轮未发现性能阻塞。调度和恢复路径均有明确 batch/limit，关键查询已有迁移索引覆盖；provider key 列表 active slot 聚合口径与调度器一致。
