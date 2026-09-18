/**
 * Provider key 当前占用的调度 slot：只计 queued/running 且已 assigned 的任务。
 * 列表不得 JOIN 历史终态任务。
 */
import type { AppBindings } from "../types";

export const PROVIDER_KEY_ACTIVE_SLOTS_SQL = `SELECT provider_key_id AS providerKeyId, COUNT(*) AS activeCount
     FROM tasks
     WHERE status IN ('queued', 'running')
       AND assigned_at IS NOT NULL
       AND provider_key_id IS NOT NULL
     GROUP BY provider_key_id`;

export async function loadProviderKeyActiveSlotCounts(
  env: AppBindings
): Promise<Map<string, number>> {
  const rows = await env.DB.prepare(PROVIDER_KEY_ACTIVE_SLOTS_SQL).all<{
    providerKeyId: string;
    activeCount: number;
  }>();
  return new Map(rows.results.map((row) => [row.providerKeyId, row.activeCount]));
}
