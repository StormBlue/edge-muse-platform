# 运维与排障

面向 **sysadmin / 运维**，与 [`DEPLOYMENT.md`](./DEPLOYMENT.md)（怎么发布）互补。实现细节以代码与 Cloudflare 控制台为准。

## 数据库迁移

- 本地：`pnpm -F server db:migrate:local`
- 生产：CI 或手动 `pnpm -F server db:migrate:remote`（需 Wrangler 凭证）
- 生成迁移：改 `server/src/db/schema.ts` 后 `pnpm -F server db:gen`，**人工审阅** SQL 再提交

当前案例库分页依赖 `0007_prompt_case_public_pagination_indexes.sql` 中的公共列表索引；部署前确认 D1 已应用该迁移，否则 1000+ 案例下 `GET /api/prompt-cases` 可能退化为较慢扫描。

Provider key group 队列依赖 `0011_provider_key_groups_queue.sql`：该迁移创建 group/member、key 并发字段、用户任务上限字段，以及 `tasks.provider_key_group_id` / `tasks.assigned_at` 调度字段。部署前必须确认迁移已在目标 D1 应用。

## 密钥与 Secrets

- Worker Secrets：`pnpm -F server wrangler secret put <NAME>`（如 `JWT_SECRET`、`KEY_ENCRYPTION_KEY`、`TURNSTILE_SECRET_KEY`）
- **KEY_ENCRYPTION_KEY** 轮换：涉及 provider key 重加密，需计划窗口；见 [`SECURITY.md`](./SECURITY.md)

## 回滚与 D1

- **Worker**：在 Cloudflare 仪表盘回滚到上一 Worker 版本，或重新部署已知良好的 Git revision。
- **D1 Time Travel**：重大误操作时按 Cloudflare 文档做时间点恢复演练；生产变更前建议对关键表做导出/备份策略（见 [`RELIABILITY.md`](./RELIABILITY.md)）。

## Runtime Logs

- 本地：`pnpm -F server dev` 控制台输出结构化 JSON。
- 生产：`wrangler tail` 或 Cloudflare Workers 日志界面；排障时携带 HTTP `traceId` 与业务 `taskId`。
- 队列排障事件：
  - `task.queue.group_full`：group 下所有可用 key 都达到 `max_concurrency`，任务会继续 queued，无队列超时。
  - `task.queue.dispatched`：队列已为任务写入 provider key slot 并启动生成。
  - `task.queue.release_requested`：终态或取消后唤醒同 group 队列。
  - `task.recovery.reset_stale_assigned`：恢复扫描清理了长时间 assigned 但仍 queued 的孤儿 slot。

## 生成队列排障

常用 D1 查询：

```sql
-- 查看仍在排队且未分配 key 的任务
SELECT id, user_id, provider_key_group_id, queued_at
FROM tasks
WHERE status = 'queued' AND assigned_at IS NULL
ORDER BY queued_at ASC
LIMIT 50;

-- 查看每把 key 当前占用 slot 数
SELECT provider_key_id, COUNT(*) AS active_count
FROM tasks
WHERE status IN ('queued', 'running')
  AND assigned_at IS NOT NULL
  AND provider_key_id IS NOT NULL
GROUP BY provider_key_id;

-- 查看 orphan assigned queued，超过 10 分钟通常会被恢复扫描重置
SELECT id, provider_key_id, provider_key_group_id, assigned_at
FROM tasks
WHERE status = 'queued' AND assigned_at IS NOT NULL
ORDER BY assigned_at ASC;
```

如果 queued 长时间不推进，先确认对应 `provider_key_groups.enabled=1`、成员 key 未删除/未禁用、`provider_keys.max_concurrency` 大于当前 active slot 数；随后触发任一相关 API 请求或等待 cron/DO alarm 让恢复扫描唤醒队列。

## 可选告警

- `RESEND_API_KEY` + `ALERT_EMAIL`：失败任务摘要等（[`server/src/lib/operations.ts`](../server/src/lib/operations.ts)）；未配置则仅日志。

## Provider / Cubence 手工 smoke

- Cubence 健康检查偏鉴权级；多 key group 场景下需在真实环境做小流量试生成，并观察 `task.queue.dispatched` 中的 providerKeyId 是否按 group 排序和 key 并发阈值切换（见 [`QUALITY_SCORE.md`](./QUALITY_SCORE.md)）。

## 相关文档

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — CI/CD 与本地环境
- [`RELIABILITY.md`](./RELIABILITY.md) — cron、cleanup、任务恢复
- [`SECURITY.md`](./SECURITY.md) — 密钥与审计
- [`ACCEPTANCE.md`](./ACCEPTANCE.md) — 发布前检查清单
