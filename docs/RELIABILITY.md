# 可靠性

## 异步生图

- **Workflow**：[`server/src/workflows/GenerateImage.ts`](../server/src/workflows/GenerateImage.ts) 承载长任务；失败状态与重试入口见 [`server/src/lib/tasks.ts`](../server/src/lib/tasks.ts)。
- **降级路径**：若 Workflow 不可用，代码路径可回退到 `waitUntil`（见 `index.ts` / tasks 注释）。
- **中断恢复**：`fetch` 处理器中调度 `scheduleInterruptedTaskRecovery`；`recoverInterruptedGenerateTasks` 处理排队未消费任务（[`server/src/index.ts`](../server/src/index.ts)、`lib/tasks.ts`）。

## WebSocket 与 Durable Objects

- 每任务房间：`TaskRoom`（[`server/src/do/TaskRoom.ts`](../server/src/do/TaskRoom.ts)）广播结构化事件；前端 [`web/src/composables/useTaskWebSocket.ts`](../web/src/composables/useTaskWebSocket.ts) 订阅。

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

## 相关文档

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — 发布与回滚
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — 组件关系
