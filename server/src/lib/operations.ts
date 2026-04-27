/**
 * 运维向：由 `index.ts` 的 `scheduled` **并行**拉起的若干任务，失败不应拖死整批 `Promise.all`（各函数内部吞或打日志）。
 *
 * - `sendFailureDigest`：近 24h `tasks.status=failed` 按 `error_code` 聚合，邮件需 `ALERT_EMAIL`+mailer 绑定，否则只 `console.warn`。
 * - `logD1TableSizes`：固定表名 `COUNT(*)`，打结构化 JSON 到 Workers 日志，便于 Logpush/仪表盘。
 * - `backupOperationalSnapshot`：按日路径写 R2 JSON，**非** D1 全量 dump，作趋势与应急对照用。
 */
import type { AppBindings } from "../types";
import { sendMail } from "./mailer";

const dayMs = 24 * 60 * 60 * 1000;

/** 失败任务统计窗口：近 24 小时 */
export async function sendFailureDigest(env: AppBindings): Promise<void> {
  const since = Date.now() - dayMs;
  const failed = await env.DB.prepare(
    `SELECT error_code, COUNT(*) count
     FROM tasks
     WHERE status = 'failed' AND finished_at > ?1
     GROUP BY error_code
     ORDER BY count DESC`
  )
    .bind(since)
    .all<{ error_code: string | null; count: number }>();
  if (failed.results.length === 0) return;
  const body = failed.results
    .map((row) => `${row.error_code ?? "UNKNOWN"}: ${row.count}`)
    .join("\n");
  // 无收件人时仍可见聚合结果，避免静默丢告警
  if (!env.ALERT_EMAIL) {
    console.warn(JSON.stringify({ event: "ops.failure_digest", body }));
    return;
  }
  await sendMail(env, env.ALERT_EMAIL, "ops-alert", {
    subject: "Edge Muse failed task digest",
    body
  });
}

/** 主表行数体检；表名与 schema 主业务表对齐，新表可在此增一行 */
export async function logD1TableSizes(env: AppBindings): Promise<void> {
  const tables = [
    "users",
    "sessions",
    "messages",
    "tasks",
    "image_objects",
    "quota_transactions",
    "audit_logs"
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = await env.DB.prepare(`SELECT COUNT(*) count FROM ${table}`).first<{
      count: number;
    }>();
    counts[table] = row?.count ?? 0;
  }
  console.log(JSON.stringify({ event: "ops.d1_size", counts }));
}

/**
 * 将聚合统计以 JSON 写入 R2；路径含 **UTC 日期** 前缀，同日多次跑会**覆盖**同 key 尾部（以 timestamp 在 body 内区分）。
 * 不含用户明细，体积极小，适合与配额/增长监控对照。
 */
export async function backupOperationalSnapshot(env: AppBindings): Promise<void> {
  const timestamp = new Date().toISOString();
  const [users, tasks, imageObjects] = await Promise.all([
    env.DB.prepare("SELECT role, status, COUNT(*) count FROM users GROUP BY role, status").all(),
    env.DB.prepare("SELECT status, mode, COUNT(*) count FROM tasks GROUP BY status, mode").all(),
    env.DB.prepare("SELECT COUNT(*) count, SUM(byte_size) byte_size FROM image_objects").all()
  ]);
  const body = JSON.stringify(
    {
      timestamp,
      users: users.results,
      tasks: tasks.results,
      imageObjects: imageObjects.results
    },
    null,
    2
  );
  await env.R2.put(`backups/d1-operational-snapshot/${timestamp.slice(0, 10)}.json`, body, {
    httpMetadata: { contentType: "application/json" }
  });
}
