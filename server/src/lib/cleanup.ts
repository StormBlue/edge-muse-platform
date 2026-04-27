/**
 * 软删图片的「物理清理」：在 `index.scheduled` 中调用，按保留期**之后**再真正删 R2 与 D1 行。
 *
 * 业务侧（任务失败、删消息等）只写 `image_objects.deleted_at`；本模块负责最终一致性与释放存储。
 * 单次最多处理 `100` 条，避免单次 Cron 占用过长；未清完的下一 tick 继续扫（`deleted_at < cutoff` 仍成立）。
 */
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { imageObjects } from "../db/schema";
import type { AppBindings } from "../types";

/** 软删起算后至少保留多久再物理删（与合规/恢复窗口一致，可调） */
const deletedImageRetentionMs = 30 * 24 * 60 * 60 * 1000;

/**
 * @param cutoff 默认「现在 − 30 天」：只处理**早于**该时刻的 `deleted_at`
 * @returns 本轮实际删掉的行数（0～100），供运维日志与监控
 */
export async function cleanupDeletedImages(
  env: AppBindings,
  cutoff = Date.now() - deletedImageRetentionMs
): Promise<number> {
  const db = getDb(env);
  const rows = await db
    .select({
      id: imageObjects.id,
      r2Key: imageObjects.r2Key,
      deletedAt: imageObjects.deletedAt
    })
    .from(imageObjects)
    .where(and(isNotNull(imageObjects.deletedAt), lt(imageObjects.deletedAt, cutoff)))
    .limit(100);

  // 先 R2 再 D1；若 R2 删失败会抛错，D1 不删，下次可重试（避免「库没了对象还在」）
  for (const row of rows) {
    await env.R2.delete(row.r2Key);
    await db.delete(imageObjects).where(eq(imageObjects.id, row.id));
  }

  return rows.length;
}
