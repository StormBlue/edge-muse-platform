import type { AppBindings } from "../types";
import { sendMail } from "./mailer";

const dayMs = 24 * 60 * 60 * 1000;

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
  if (!env.ALERT_EMAIL) {
    console.warn(JSON.stringify({ event: "ops.failure_digest", body }));
    return;
  }
  await sendMail(env, env.ALERT_EMAIL, "ops-alert", {
    subject: "Edge Muse failed task digest",
    body
  });
}

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
