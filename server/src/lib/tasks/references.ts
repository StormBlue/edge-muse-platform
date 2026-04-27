import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../db/client";
import { imageObjects } from "../../db/schema";
import { appError } from "../errors";
import { logInfo, logWarn } from "../log";
import type { AppBindings } from "../../types";

/** 将用户上传的参考图行打上 sessionId/taskId，便于联查与权限 */
export async function attachReferenceImagesToTask(
  env: AppBindings,
  input: {
    ownerUserId: string;
    sessionId: string;
    taskId: string;
    referenceImageIds: string[];
  }
): Promise<void> {
  if (input.referenceImageIds.length === 0) return;
  const result = await env.DB.prepare(
    `UPDATE image_objects
     SET session_id = COALESCE(session_id, ?1),
         task_id = COALESCE(task_id, ?2)
     WHERE id IN (${input.referenceImageIds.map((_, index) => `?${index + 3}`).join(",")})
       AND owner_user_id = ?${input.referenceImageIds.length + 3}
       AND is_reference = 1
       AND deleted_at IS NULL`
  )
    .bind(input.sessionId, input.taskId, ...input.referenceImageIds, input.ownerUserId)
    .run();
  logInfo("task.reference_images.attached", {
    taskId: input.taskId,
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    requestedReferenceImageCount: input.referenceImageIds.length,
    attachedReferenceImageCount: result.meta.changes ?? 0,
    referenceImageIds: input.referenceImageIds
  });
}

/** 建任务前：参考图须属于本人且 is_reference=1 未删 */
export async function assertReferenceImagesAccessible(
  env: AppBindings,
  input: { ownerUserId: string; referenceImageIds: string[] }
): Promise<void> {
  if (input.referenceImageIds.length === 0) return;
  const rows = await getDb(env)
    .select({ id: imageObjects.id })
    .from(imageObjects)
    .where(
      and(
        inArray(imageObjects.id, input.referenceImageIds),
        eq(imageObjects.ownerUserId, input.ownerUserId),
        eq(imageObjects.isReference, true),
        isNull(imageObjects.deletedAt)
      )
    );
  if (rows.length === input.referenceImageIds.length) return;
  logWarn("task.reference_images.inaccessible", {
    ownerUserId: input.ownerUserId,
    requestedReferenceImageIds: input.referenceImageIds,
    accessibleReferenceImageIds: rows.map((row) => row.id)
  });
  throw appError("VALIDATION_ERROR", "Reference image not found or inaccessible");
}

/**
 * 从 R2 拉取参考图字节，顺序与 `imageIds` 一致（供 provider 多模态入参）。
 */
export async function loadReferenceImages(
  env: AppBindings,
  imageIds: string[],
  ownerUserId: string
) {
  if (imageIds.length === 0) return [];
  logInfo("task.reference_images.load_started", {
    imageIds,
    ownerUserId,
    requestedReferenceImageCount: imageIds.length
  });
  const rows = await getDb(env)
    .select()
    .from(imageObjects)
    .where(
      and(
        inArray(imageObjects.id, imageIds),
        eq(imageObjects.ownerUserId, ownerUserId),
        isNull(imageObjects.deletedAt)
      )
    );
  const orderedRows = orderRowsByImageIds(rows, imageIds);
  const images: Array<{ bytes: Uint8Array; mime: string }> = [];
  for (const row of orderedRows) {
    const object = await env.R2.get(row.r2Key);
    if (object) {
      const bytes = new Uint8Array(await object.arrayBuffer());
      logInfo("task.reference_image.loaded", {
        imageId: row.id,
        ownerUserId: row.ownerUserId,
        r2Key: row.r2Key,
        mime: row.mime,
        byteSize: bytes.byteLength
      });
      images.push({ bytes, mime: row.mime });
    } else {
      logWarn("task.reference_image.r2_missing", {
        imageId: row.id,
        ownerUserId: row.ownerUserId,
        r2Key: row.r2Key,
        mime: row.mime
      });
    }
  }
  if (orderedRows.length < imageIds.length) {
    logWarn("task.reference_images.db_missing", {
      requestedImageIds: imageIds,
      foundImageIds: rows.map((row) => row.id)
    });
  }
  return images;
}

/** 将 DB 查询结果重排为调用方给定的 id 顺序 */
export function orderRowsByImageIds<T extends { id: string }>(rows: T[], imageIds: string[]): T[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return imageIds.flatMap((imageId) => {
    const row = rowsById.get(imageId);
    return row ? [row] : [];
  });
}
