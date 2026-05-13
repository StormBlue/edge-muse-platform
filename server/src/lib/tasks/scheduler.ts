import { now } from "../id";
import { logWarn } from "../log";
import type { AppBindings } from "../../types";
import { GENERATION_ATTEMPT_TIMEOUT_MS } from "./types";

export type QueuedTaskForDispatch = {
  id: string;
  providerKeyGroupId: string;
};

export type ProviderKeySlot = {
  providerKeyId: string;
  maxConcurrency: number;
  activeCount: number;
};

type QueuedTaskRow = {
  id: string;
  provider_key_group_id: string | null;
};

type ProviderKeySlotRow = {
  provider_key_id: string;
  max_concurrency: number;
  active_count: number;
};

export async function getNextQueuedTaskForGroup(
  env: AppBindings,
  groupId: string
): Promise<QueuedTaskForDispatch | null> {
  const row = await env.DB.prepare(
    `SELECT id, provider_key_group_id
     FROM tasks
     WHERE provider_key_group_id = ?1
       AND status = 'queued'
       AND assigned_at IS NULL
     ORDER BY queued_at ASC
     LIMIT 1`
  )
    .bind(groupId)
    .first<QueuedTaskRow>();
  if (!row?.provider_key_group_id) return null;
  return {
    id: row.id,
    providerKeyGroupId: row.provider_key_group_id
  };
}

export async function getNextAvailableProviderKeySlot(
  env: AppBindings,
  groupId: string
): Promise<ProviderKeySlot | null> {
  const rows = await env.DB.prepare(
    `SELECT
       provider_keys.id AS provider_key_id,
       provider_keys.max_concurrency AS max_concurrency,
       COALESCE(active.active_count, 0) AS active_count
     FROM provider_key_group_members
     INNER JOIN provider_key_groups
       ON provider_key_groups.id = provider_key_group_members.group_id
     INNER JOIN provider_keys
       ON provider_keys.id = provider_key_group_members.provider_key_id
     LEFT JOIN (
       SELECT provider_key_id, COUNT(*) AS active_count
       FROM tasks
       WHERE status IN ('queued', 'running')
         AND assigned_at IS NOT NULL
         AND provider_key_id IS NOT NULL
       GROUP BY provider_key_id
     ) active
       ON active.provider_key_id = provider_keys.id
     WHERE provider_key_group_members.group_id = ?1
       AND provider_key_groups.enabled = 1
       AND provider_key_groups.deleted_at IS NULL
       AND provider_keys.enabled = 1
       AND provider_keys.deleted_at IS NULL
       AND provider_keys.provider_id = provider_key_groups.provider_id
     ORDER BY provider_key_group_members.sort_order ASC, provider_keys.created_at ASC`
  )
    .bind(groupId)
    .all<ProviderKeySlotRow>();

  const row =
    rows.results.find(
      (candidate) => candidate.active_count < Math.max(1, candidate.max_concurrency)
    ) ?? null;
  if (!row) return null;
  return {
    providerKeyId: row.provider_key_id,
    maxConcurrency: Math.max(1, row.max_concurrency),
    activeCount: row.active_count
  };
}

export async function assignQueuedTaskToProviderKey(
  env: AppBindings,
  input: { taskId: string; providerKeyId: string; assignedAt?: number }
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE tasks
     SET provider_key_id = ?1,
         assigned_at = ?2
     WHERE id = ?3
       AND status = 'queued'
       AND assigned_at IS NULL`
  )
    .bind(input.providerKeyId, input.assignedAt ?? now(), input.taskId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function resetStaleAssignedQueuedTasks(
  env: AppBindings,
  input: { limit: number; staleBefore?: number }
): Promise<number> {
  const staleBefore = input.staleBefore ?? now() - GENERATION_ATTEMPT_TIMEOUT_MS;
  const result = await env.DB.prepare(
    `UPDATE tasks
     SET assigned_at = NULL
     WHERE id IN (
       SELECT id
       FROM tasks
       WHERE status = 'queued'
         AND assigned_at IS NOT NULL
         AND assigned_at <= ?1
       ORDER BY assigned_at ASC
       LIMIT ?2
     )`
  )
    .bind(staleBefore, input.limit)
    .run();
  const reset = result.meta.changes ?? 0;
  if (reset > 0) {
    logWarn("task.recovery.reset_stale_assigned", { reset, staleBefore });
  }
  return reset;
}
