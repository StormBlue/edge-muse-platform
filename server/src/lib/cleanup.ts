import { and, eq, isNotNull, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { imageObjects } from "../db/schema";
import type { AppBindings } from "../types";

const deletedImageRetentionMs = 30 * 24 * 60 * 60 * 1000;

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

  for (const row of rows) {
    await env.R2.delete(row.r2Key);
    await db.delete(imageObjects).where(eq(imageObjects.id, row.id));
  }

  return rows.length;
}
