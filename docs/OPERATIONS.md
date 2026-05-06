# 运维与排障

面向 **sysadmin / 运维**，与 [`DEPLOYMENT.md`](./DEPLOYMENT.md)（怎么发布）互补。实现细节以代码与 Cloudflare 控制台为准。

## 数据库迁移

- 本地：`pnpm -F server db:migrate:local`
- 生产：CI 或手动 `pnpm -F server db:migrate:remote`（需 Wrangler 凭证）
- 生成迁移：改 `server/src/db/schema.ts` 后 `pnpm -F server db:gen`，**人工审阅** SQL 再提交

## 密钥与 Secrets

- Worker Secrets：`pnpm -F server wrangler secret put <NAME>`（如 `JWT_SECRET`、`KEY_ENCRYPTION_KEY`、`TURNSTILE_SECRET_KEY`）
- **KEY_ENCRYPTION_KEY** 轮换：涉及 provider key 重加密，需计划窗口；见 [`SECURITY.md`](./SECURITY.md)

## 回滚与 D1

- **Worker**：在 Cloudflare 仪表盘回滚到上一 Worker 版本，或重新部署已知良好的 Git revision。
- **D1 Time Travel**：重大误操作时按 Cloudflare 文档做时间点恢复演练；生产变更前建议对关键表做导出/备份策略（见 [`RELIABILITY.md`](./RELIABILITY.md)）。

## Runtime Logs

- 本地：`pnpm -F server dev` 控制台输出结构化 JSON。
- 生产：`wrangler tail` 或 Cloudflare Workers 日志界面；排障时携带 HTTP `traceId` 与业务 `taskId`。

## 可选告警

- `RESEND_API_KEY` + `ALERT_EMAIL`：失败任务摘要等（[`server/src/lib/operations.ts`](../server/src/lib/operations.ts)）；未配置则仅日志。

## Provider / Cubence 手工 smoke

- Cubence 健康检查偏鉴权级；共享密钥场景下需在真实环境做小流量试生成（见 [`QUALITY_SCORE.md`](./QUALITY_SCORE.md)）。

## 相关文档

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — CI/CD 与本地环境
- [`RELIABILITY.md`](./RELIABILITY.md) — cron、cleanup、任务恢复
- [`SECURITY.md`](./SECURITY.md) — 密钥与审计
- [`ACCEPTANCE.md`](./ACCEPTANCE.md) — 发布前检查清单
