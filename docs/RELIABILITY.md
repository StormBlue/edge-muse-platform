# 可靠性

## 异步生图

- **Workflow**：[`server/src/workflows/GenerateImage.ts`](../server/src/workflows/GenerateImage.ts) 承载长任务；失败状态与重试入口见 [`server/src/lib/tasks.ts`](../server/src/lib/tasks.ts)。
- **降级路径**：若 Workflow 不可用，代码路径可回退到 `waitUntil`（见 `index.ts` / tasks 注释）。
- **入队调度**：`POST /generate` 只写入 queued 任务；`GenerateQueue` Durable Object 按 provider key group 串行选择 key slot，写入 `tasks.provider_key_id` 与 `assigned_at` 后才启动 Workflow / `waitUntil`。
- **slot 释放**：成功、失败、取消、超时失败与图片恢复终态均会唤醒同 group 队列；终态任务保留 `provider_key_id` 供审计，slot 统计只看 `queued/running + assigned_at`。
- **中断恢复**：`fetch` 处理器中调度 `scheduleInterruptedTaskRecovery`；`recoverInterruptedGenerateTasks` 先处理超时 running，再重置 stale assigned queued 任务，最后按 `provider_key_group_id` 唤醒队列（[`server/src/index.ts`](../server/src/index.ts)、[`server/src/lib/tasks/recovery.ts`](../server/src/lib/tasks/recovery.ts)）。

## WebSocket 与 Durable Objects

- 每任务房间：`TaskRoom`（[`server/src/do/TaskRoom.ts`](../server/src/do/TaskRoom.ts)）广播结构化事件；前端 [`web/src/composables/useTaskWebSocket.ts`](../web/src/composables/useTaskWebSocket.ts) 订阅。
- 每 key group 队列：`GenerateQueue`（[`server/src/do/GenerateQueue.ts`](../server/src/do/GenerateQueue.ts)）只做同 group 串行调度；D1 是事实源，DO storage 仅保存 groupId 供 alarm 兜底。

## 定时任务（Cron）

[`server/src/index.ts`](../server/src/index.ts) 的 `scheduled` 钩子调用：

- 删除图片清理（[`server/src/lib/cleanup.ts`](../server/src/lib/cleanup.ts)）
- 失败摘要邮件（[`server/src/lib/operations.ts`](../server/src/lib/operations.ts)）
- D1 运维快照到 R2、表大小日志

详见 [`OPERATIONS.md`](./OPERATIONS.md) 中的路径与告警配置。

## 备份与恢复

- **D1 Time Travel**：点-in-time 恢复流程见 [`OPERATIONS.md`](./OPERATIONS.md)「Rollback / Time Travel Drill」。
- **R2**：对象按 key 不可变；业务上消息可软删后再清理。

## 可观测性

- **Workers 日志**：结构化 JSON；排障字段与事件名见 [`OPERATIONS.md`](./OPERATIONS.md)「Runtime Logs」。
- **关联 ID**：HTTP 层 `traceId`；任务创建后以 `taskId` 为主关联。
- **队列事件**：重点事件包括 `task.queue.group_full`、`task.queue.dispatched`、`task.queue.release_requested`、`task.recovery.reset_stale_assigned` 和 `task.recovery_scheduled`。

## 相关文档

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — 发布与回滚
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — 组件关系
