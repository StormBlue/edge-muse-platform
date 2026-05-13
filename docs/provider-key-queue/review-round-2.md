# Review Round 2 — 类型与静态分析

**日期**: 2026-05-13
**视角**: 类型与静态分析
**审核范围**: 新增/改动的 server、web、OpenAPI、测试与文档
**关联需求**: [`requirements.md`](./requirements.md)
**关联任务**: [`tasks.md`](./tasks.md)

---

## 审核清单

- [x] 运行 `pnpm lint`。
- [x] 运行 `pnpm typecheck`。
- [x] 搜索 `any`、`unknown as`、`as never`、`@ts-ignore`、`TODO/FIXME`。
- [x] 复查 nullable `providerKeyGroupId`、`providerKeyId`、`assignedAt` 相关路径。
- [x] 复查新 SQL 聚合和前端 API 类型。

---

## 发现

### P0

无。

### P1

无。

### P2

#### Finding #1: 需求文档残留早期调度字段

- **位置**: `docs/provider-key-queue/requirements.md`
- **现象**: 文档仍提到 `queueStartedAt`、`dispatch_status`、`provider_key_id nullable` 和旧模块名 `generationConcurrency.ts`。
- **影响**: 容易让后续维护误以为任务表需要第二套调度状态，和当前 `assigned_at` 作为唯一 slot 占用信号的实现冲突。
- **建议修复**: 把文档同步为 `provider_key_id` 兼容占位 + `assigned_at` 占用 slot 的最终方案。

#### Finding #2: 队列门面注释仍描述 T2.4 过渡期

- **位置**: `server/src/lib/tasks/queue.ts`
- **现象**: 注释称“后续会切到 GenerateQueue”，但代码已经完成切换。
- **影响**: 注释过期，增加新维护者判断成本。
- **建议修复**: 改为描述当前 DO 调度与旧兜底语义。

---

## 修复

| Finding | 状态 | 备注                                                      |
| ------- | ---- | --------------------------------------------------------- |
| #1      | ✅   | 需求文档改为 `assigned_at` 口径，移除早期字段和旧模块名。 |
| #2      | ✅   | 更新 `queue.ts` 头部注释，说明当前 DO 调度和兜底行为。    |

---

## 修复后验证

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] Round 1 修复后的相关测试已在 Round 1 跑过
- [x] 重新搜索早期字段名，无残留

---

## 下一轮关注点

Round 3 聚焦并发与恢复：slot 统计口径、重复 enqueue/release、stale assigned reset、running 超时以及 DO alarm 的恢复闭环。

---

## 总结

本轮未发现新的类型错误或未解释的类型逃逸。发现并修复 2 个 P2 级静态契约/注释漂移问题，当前文档与代码都以 `assigned_at` 作为 provider key slot 占用信号。
