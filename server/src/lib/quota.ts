/**
 * 用户配额账本：`quotas` 表 + `quota_transactions` 流水。
 * - 系统管理员：`getQuota`/`tryConsumeQuota` 中直接跳过扣减（与业务「无限」一致）。
 * - 扣减使用单条 SQL `UPDATE ... WHERE used + amount <= allocated` 保证不超卖；失败则 QUOTA_EXCEEDED。
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { quotaTransactions, quotas, users } from "../db/schema";
import { appError } from "./errors";
import { newId, now } from "./id";
import { logError } from "./log";
import type { AppBindings } from "../types";

/** GET /api/me 等返回给前端的配额视图 */
export type QuotaSnapshot = {
  allocatedQuota: number | null;
  usedQuota: number;
  remainingQuota: number | null;
};

/** 读取当前配额快照；无行时视为 0 */
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

/**
 * 预扣配额（生图任务创建时按渠道计费单位扣）。成功则写一条 `task_charge` 流水（delta 为负）。
 */
export async function tryConsumeQuota(
  env: AppBindings,
  userId: string,
  amount: number,
  taskId: string
): Promise<QuotaSnapshot> {
  const db = getDb(env);
  const timestamp = now();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw appError("UNAUTHORIZED", "User missing");
  // 系统管理员不计入「张数」配额，直接返回当前视图（与产品「无限」一致）
  if (user.role === "sysadmin") return getQuota(env, userId);

  // 单行原子条件更新：不满足则 RETURNING 为空 → QUOTA_EXCEEDED，避免竞态双花
  const result = await env.DB.prepare(
    `UPDATE quotas
     SET used_quota = used_quota + ?1, updated_at = ?2
     WHERE user_id = ?3 AND (allocated_quota IS NULL OR used_quota + ?1 <= allocated_quota)
     RETURNING allocated_quota, used_quota`
  )
    .bind(amount, timestamp, userId)
    .first<{ allocated_quota: number | null; used_quota: number }>();

  if (!result) throw appError("QUOTA_EXCEEDED", "Quota exceeded");

  try {
    await db.insert(quotaTransactions).values({
      id: newId("qt"),
      userId,
      delta: -amount,
      reason: "task_charge",
      operatorId: userId,
      taskId,
      createdAt: timestamp
    });
  } catch (error) {
    try {
      await env.DB.prepare(
        "UPDATE quotas SET used_quota = MAX(used_quota - ?1, 0), updated_at = ?2 WHERE user_id = ?3"
      )
        .bind(amount, now(), userId)
        .run();
    } catch (rollbackError) {
      logError("quota.consume_rollback_failed", rollbackError, { userId, taskId, amount });
    }
    throw error;
  }

  return {
    allocatedQuota: result.allocated_quota,
    usedQuota: result.used_quota,
    remainingQuota:
      result.allocated_quota === null
        ? null
        : Math.max(result.allocated_quota - result.used_quota, 0)
  };
}

/**
 * 退还配额：系统失败等场景下回滚 `used_quota`，并记 `task_refund` 流水（delta 为正）。
 */
export async function refundQuota(
  env: AppBindings,
  userId: string,
  amount: number,
  taskId: string,
  operatorId?: string
): Promise<void> {
  // MAX(...,0) 防止异常多次退款把 used 扣成负数
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

/**
 * 原子退还任务尚未退回的实扣配额。D1 batch 串行事务保证并发调用不会重复退款；
 * 无扣款（例如 sysadmin）不产生退款，价格调整也不会改变历史任务的退款金额。
 */
export async function refundTaskOutstandingQuota(
  env: AppBindings,
  userId: string,
  taskId: string
): Promise<number> {
  const refundId = newId("qt");
  const timestamp = now();
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO quota_transactions (id, user_id, delta, reason, operator_id, task_id, created_at)
       SELECT ?1, user_id, -SUM(delta), 'task_refund', user_id, task_id, ?2
       FROM quota_transactions WHERE user_id = ?3 AND task_id = ?4
         AND reason IN ('task_charge', 'task_refund')
       GROUP BY user_id, task_id HAVING SUM(delta) < 0
       RETURNING delta`
    ).bind(refundId, timestamp, userId, taskId),
    env.DB.prepare(
      `UPDATE quotas SET used_quota = MAX(used_quota - (
         SELECT delta FROM quota_transactions WHERE id = ?1), 0), updated_at = ?2
       WHERE user_id = (SELECT user_id FROM quota_transactions WHERE id = ?1)`
    ).bind(refundId, timestamp)
  ]);
  return Number((results[0].results[0] as { delta: number } | undefined)?.delta ?? 0);
}

/**
 * 管理员在后台为用户**增加**可分配额度（`allocated_quota`），记 `admin_grant`。
 */
export async function grantQuota(
  env: AppBindings,
  input: { userId: string; amount: number; operatorId: string }
): Promise<QuotaSnapshot> {
  const timestamp = now();
  // 无行则插入；已有行则增加 allocated；若已是「无限」(NULL) 则保持 NULL
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
