# Review Round 9 — 迁移与兼容

**日期**: 2026-05-13
**视角**: D1 迁移、旧数据兼容、回滚边界
**审核范围**: `0011_provider_key_groups_queue.sql`、schema、legacy fallback、任务创建兼容
**关联需求**: [`requirements.md`](./requirements.md)
**关联任务**: [`tasks.md`](./tasks.md)

---

## 审核清单

- [x] 复查 0011 migration 是否只 additive 变更，不删除旧字段/表。
- [x] 复查旧 `provider_keys` 是否回填默认 `pkg_<keyId>` group/member。
- [x] 复查旧 `user_provider_keys` / `preferred_provider_key_id` 用户是否回填 group。
- [x] 复查旧 `tasks.provider_key_id NOT NULL` 兼容占位方案。
- [x] 本地迁移已在 T6.5 验证 `pnpm -F server db:migrate:local` 无待应用迁移。

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

- [x] 迁移保留 `user_provider_keys` 与 `preferred_provider_key_id`，便于审计和回滚。
- [x] 旧任务不需要重建表；queued 未 assigned 时保留 `provider_key_id` 兼容占位。
- [x] 已有明确 group 的用户在 group 失效时直接报错，不会 fallback 绕过禁用。

---

## 下一轮关注点

Round 10 做发布验收：全量 lint/typecheck/test/build/db migrate，并复查 git 状态。

---

## 总结

本轮未发现迁移兼容问题。最终方案避免高风险 D1 表重建，采用 additive migration 与 `assigned_at` slot 信号完成真实队列语义。
