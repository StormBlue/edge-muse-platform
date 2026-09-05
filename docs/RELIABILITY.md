# 可靠性

## 异步生图

- **Workflow**：[`server/src/workflows/GenerateImage.ts`](../server/src/workflows/GenerateImage.ts) 承载长任务；失败状态与重试入口见 [`server/src/lib/tasks.ts`](../server/src/lib/tasks.ts)。
- **降级路径**：若 Workflow 不可用，代码路径可回退到 `waitUntil`（见 `index.ts` / tasks 注释）。
- **入队调度**：`POST /generate` 只写入 queued 任务；`GenerateQueue` Durable Object 按 provider key group 串行选择 key slot，写入 `tasks.provider_key_id` 与 `assigned_at` 后才启动 Workflow / `waitUntil`。
- **slot 释放**：成功、失败、取消、超时失败与图片恢复终态均会唤醒同 group 队列；终态任务保留 `provider_key_id` 供审计，slot 统计只看 `queued/running + assigned_at`。
- **中断恢复**：`fetch` 处理器中调度 `scheduleInterruptedTaskRecovery`；`recoverInterruptedGenerateTasks` 先处理超时 running，再重置 stale assigned queued 任务，最后按 `provider_key_group_id` 唤醒队列（[`server/src/index.ts`](../server/src/index.ts)、[`server/src/lib/tasks/recovery.ts`](../server/src/lib/tasks/recovery.ts)）。

### 取消与配额一致性

[`cancelQueuedGenerateTask`](../server/src/lib/tasks/state.ts) 在同一个 D1 batch 事务内检查 queued、按本人任务账本计算未退余额、写退款流水、扣减已用额度并同步任务与消息终态。执行器的 `claimGenerateTask` 也以 queued 为条件更新，因此取消与认领只能由一方获胜；已分配 slot 但尚未认领的任务仍可取消。重复取消不再次退款，事务失败不会留下「已退款但仍可执行」的中间状态。

任务中心的预扣、退款和净消耗来自账本，不按请求张数猜测。生成失败仍遵循原失败退款策略；取消退款不会改变服务商错误是否退款的规则。接口与额度字段语义见 [`API.md`](./API.md)。

## WebSocket 与 Durable Objects

- 每任务房间：`TaskRoom`（[`server/src/do/TaskRoom.ts`](../server/src/do/TaskRoom.ts)）广播结构化事件；前端 [`web/src/composables/useTaskWebSocket.ts`](../web/src/composables/useTaskWebSocket.ts) 订阅。
- 每 key group 队列：`GenerateQueue`（[`server/src/do/GenerateQueue.ts`](../server/src/do/GenerateQueue.ts)）只做同 group 串行调度；D1 是事实源，DO storage 仅保存 groupId 供 alarm 兜底。

### 页面观察与断线兜底

- [`taskActivity.ts`](../web/src/stores/taskActivity.ts) 在登录且页面可见时读取本人任务，有活动任务约每 5 秒刷新，空闲约每 30 秒刷新；恢复可见立即查询。最近记录最多展开 5 页，并重新读取已展开页面以移除被删除的记录。
- 创建或重试返回的任务 ID 立即登记为观察对象；已观察的长任务滑出最近列表后仍回读详情，避免漏掉终态。通知为应用内消息，不依赖系统推送，也不承诺浏览器关闭时通知。
- 当前创作器使用 WebSocket 触发合并后的详情读取；全局轮询提供断线补偿，但不把页面切到其它会话。旧快照不能使已观察的终态倒退；账号切换使旧请求、通知和私有编辑状态失效。
- 读取失败保留上次快照并显示重试入口；取消后回读任务与额度。请求成功但用户已离开创作页时，全局仍观察该任务，而页面不会被迟到响应强行带回。

相关回归分别见 [`apiPermissions.test.ts`](../server/test/apiPermissions.test.ts)、[`taskActivity.test.ts`](../web/src/stores/taskActivity.test.ts) 与 [`useImageStudio.test.ts`](../web/src/views/ai-image/useImageStudio.test.ts)。

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
