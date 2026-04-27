import { now } from "../id";
import { logInfo } from "../log";
import type { AppBindings } from "../../types";
import type { TaskImageAttachment } from "./types";

/** 列出本任务已落库的非参考图（按 created_at） */
export async function loadTaskGeneratedImages(
  env: AppBindings,
  taskId: string,
  prompt: string
): Promise<TaskImageAttachment[]> {
  const rows = await env.DB.prepare(
    `SELECT id,
       mime,
       width,
       height,
       byte_size,
       task_id,
       session_id,
       created_at
     FROM image_objects
     WHERE task_id = ?1
       AND deleted_at IS NULL
       AND is_reference = 0
     ORDER BY created_at ASC`
  )
    .bind(taskId)
    .all<{
      id: string;
      mime: string;
      width: number | null;
      height: number | null;
      byte_size: number;
      task_id: string | null;
      session_id: string | null;
      created_at: number;
    }>();

  return rows.results.map((row, index) => ({
    id: row.id,
    url: `/api/i/${row.id}`,
    mime: row.mime,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    taskId: row.task_id,
    sessionId: row.session_id,
    prompt,
    generationIndex: index,
    createdAt: row.created_at
  }));
}

/** 恢复成功后软删多写的中间图，仅保留 `keepImageIds` */
export async function cleanupTaskGeneratedImagesExcept(
  env: AppBindings,
  taskId: string,
  keepImageIds: string[]
): Promise<void> {
  if (keepImageIds.length === 0) {
    await cleanupTaskGeneratedImages(env, taskId);
    return;
  }
  const result = await env.DB.prepare(
    `UPDATE image_objects
     SET deleted_at = COALESCE(deleted_at, ?1)
     WHERE task_id = ?2
       AND deleted_at IS NULL
       AND is_reference = 0
       AND id NOT IN (${keepImageIds.map((_, index) => `?${index + 3}`).join(",")})`
  )
    .bind(now(), taskId, ...keepImageIds)
    .run();
  logInfo("task.images.cleanup_except_marked", {
    taskId,
    keepImageIds,
    deletedImageCount: result.meta.changes ?? 0
  });
}

/** 恢复成功后清理本任务下不应展示的多余生成图（非参考图） */
async function cleanupTaskGeneratedImages(env: AppBindings, taskId: string): Promise<number> {
  const result = await env.DB.prepare(
    `UPDATE image_objects
     SET deleted_at = COALESCE(deleted_at, ?1)
     WHERE task_id = ?2 AND deleted_at IS NULL AND is_reference = 0`
  )
    .bind(now(), taskId)
    .run();
  const deletedImageCount = result.meta.changes ?? 0;
  logInfo("task.images.cleanup_marked", { taskId, deletedImageCount });
  return deletedImageCount;
}

/** 多 index 并发完成后按 generationIndex、再按 id 稳定排序落库 */
export function sortTaskImages(images: TaskImageAttachment[]): TaskImageAttachment[] {
  return [...images].sort((left, right) => {
    const leftIndex = left.generationIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = right.generationIndex ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.id.localeCompare(right.id);
  });
}
