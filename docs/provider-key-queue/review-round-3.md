# Review Round 3 — 并发与恢复

**日期**: 2026-05-13
**视角**: 并发与恢复
**审核范围**: GenerateQueue、scheduler、dispatch/run/failure/recovery、slot 生命周期测试
**关联需求**: [`requirements.md`](./requirements.md)
**关联任务**: [`tasks.md`](./tasks.md)

---

## 审核清单

- [x] 复查入队、占用 slot、启动 Workflow、终态释放链路。
- [x] 复查重复 enqueue/release 与 assigned SQL 幂等性。
- [x] 复查 stale assigned reset 与迟到 Workflow 的交互。
- [x] 复查 running 超时失败、图片恢复终态与 slot 释放。
- [x] 运行 `pnpm -F server test -- queueScheduler.test.ts`。

---

## 发现

### P0

无。

### P1

#### Finding #1: stale assigned reset 后迟到 Workflow 可绕过 slot claim

- **位置**: `server/src/lib/tasks/state.ts`
- **现象**: `resetStaleAssignedQueuedTasks` 会把长时间未启动的 queued 任务 `assigned_at` 清空，便于重新进入队列。但已创建的旧 Workflow 如果之后才执行，`claimGenerateTask` 只检查 `status='queued'`，仍可能把无 slot 的任务改为 running。
- **影响**: 极端时会让同一任务绕过 provider key slot 限制，造成上游并发超额，并破坏 `assigned_at` 作为唯一 slot 占用信号的约定。
- **建议修复**: `claimGenerateTask` 增加 `provider_key_id IS NOT NULL AND assigned_at IS NOT NULL` 条件，让所有执行路径都必须持有 slot。

### P2

无。

---

## 修复

| Finding | 状态 | 备注                                                                                          |
| ------- | ---- | --------------------------------------------------------------------------------------------- |
| #1      | ✅   | `claimGenerateTask` 强制要求任务已 assigned；补回归测试覆盖 stale reset 后迟到 claim 被拒绝。 |

---

## 修复后验证

- [x] `pnpm -F server test -- queueScheduler.test.ts`
- [x] 回归测试覆盖 key 满载、幂等 assigned、终态释放、stale reset、迟到 claim 和用户并发限制

---

## 下一轮关注点

Round 4 聚焦安全：sysadmin/admin 权限边界、group 分配边界、密钥脱敏、日志/audit payload 与 SQL bind。

---

## 总结

本轮发现 1 个 P1 并发缺口并已修复。当前所有任务执行路径都需要先由调度器写入 `assigned_at`，恢复扫描可以安全释放孤儿 slot 并重新排队。
