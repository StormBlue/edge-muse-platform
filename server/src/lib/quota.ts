import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { quotaTransactions, quotas, users } from "../db/schema";
import { appError } from "./errors";
import { newId, now } from "./id";
import type { AppBindings } from "../types";

export type QuotaSnapshot = {
  allocatedQuota: number | null;
  usedQuota: number;
  remainingQuota: number | null;
};

export async function getQuota(env: AppBindings, userId: string): Promise<QuotaSnapshot> {
  const row = await getDb(env).query.quotas.findFirst({ where: eq(quotas.userId, userId) });
  if (!row) return { allocatedQuota: 0, usedQuota: 0, remainingQuota: 0 };
  return {
    allocatedQuota: row.allocatedQuota,
    usedQuota: row.usedQuota,
    remainingQuota:
      row.allocatedQuota === null ? null : Math.max(row.allocatedQuota - row.usedQuota, 0)
  };
}

export async function tryConsumeQuota(
  env: AppBindings,
  userId: string,
  amount: number,
  taskId: string
): Promise<QuotaSnapshot> {
  const db = getDb(env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw appError("UNAUTHORIZED", "User missing");
  if (user.role === "sysadmin") return getQuota(env, userId);

  const result = await env.DB.prepare(
    `UPDATE quotas
     SET used_quota = used_quota + ?1, updated_at = ?2
     WHERE user_id = ?3 AND (allocated_quota IS NULL OR used_quota + ?1 <= allocated_quota)
     RETURNING allocated_quota, used_quota`
  )
    .bind(amount, now(), userId)
    .first<{ allocated_quota: number | null; used_quota: number }>();

  if (!result) throw appError("QUOTA_EXCEEDED", "Quota exceeded");

  await db.insert(quotaTransactions).values({
    id: newId("qt"),
    userId,
    delta: -amount,
    reason: "task_charge",
    operatorId: userId,
    taskId,
    createdAt: now()
  });

  return {
    allocatedQuota: result.allocated_quota,
    usedQuota: result.used_quota,
    remainingQuota:
      result.allocated_quota === null
        ? null
        : Math.max(result.allocated_quota - result.used_quota, 0)
  };
}

export async function refundQuota(
  env: AppBindings,
  userId: string,
  amount: number,
  taskId: string,
  operatorId?: string
): Promise<void> {
  await env.DB.prepare(
    "UPDATE quotas SET used_quota = MAX(used_quota - ?1, 0), updated_at = ?2 WHERE user_id = ?3"
  )
    .bind(amount, now(), userId)
    .run();
  await getDb(env)
    .insert(quotaTransactions)
    .values({
      id: newId("qt"),
      userId,
      delta: amount,
      reason: "task_refund",
      operatorId: operatorId ?? userId,
      taskId,
      createdAt: now()
    });
}

export async function grantQuota(
  env: AppBindings,
  input: { userId: string; amount: number; operatorId: string }
): Promise<QuotaSnapshot> {
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO quotas (user_id, allocated_quota, used_quota, updated_at)
     VALUES (?1, ?2, 0, ?3)
     ON CONFLICT(user_id) DO UPDATE SET allocated_quota =
       CASE
         WHEN quotas.allocated_quota IS NULL THEN NULL
         ELSE quotas.allocated_quota + ?2
       END,
       updated_at = ?3`
  )
    .bind(input.userId, input.amount, timestamp)
    .run();
  await getDb(env)
    .insert(quotaTransactions)
    .values({
      id: newId("qt"),
      userId: input.userId,
      delta: input.amount,
      reason: "admin_grant",
      operatorId: input.operatorId,
      taskId: null,
      createdAt: timestamp
    });
  return getQuota(env, input.userId);
}
