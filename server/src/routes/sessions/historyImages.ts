import type { AppEnv } from "../../types";
import type { HistoryImageAttachment } from "./common";

/** 历史详情：本会话下所有非参考图按 `tasks.message_id` 归到各消息，JSON 可能滞后于 D1。 */
export async function loadPersistedGeneratedImagesByMessageId(
  env: AppEnv["Bindings"],
  sessionId: string
): Promise<Map<string, HistoryImageAttachment[]>> {
  const rows = await env.DB.prepare(
    `SELECT image_objects.id,
       image_objects.mime,
       image_objects.width,
       image_objects.height,
       image_objects.byte_size,
       image_objects.task_id,
       image_objects.session_id,
       tasks.message_id
     FROM image_objects
     LEFT JOIN tasks ON tasks.id = image_objects.task_id
     WHERE image_objects.session_id = ?1
       AND image_objects.deleted_at IS NULL
       AND image_objects.is_reference = 0
     ORDER BY image_objects.created_at ASC`
  )
    .bind(sessionId)
    .all<{
      id: string;
      mime: string;
      width: number | null;
      height: number | null;
      byte_size: number;
      task_id: string | null;
      session_id: string | null;
      message_id: string | null;
    }>();
  const imagesByMessageId = new Map<string, HistoryImageAttachment[]>();
  for (const row of rows.results) {
    if (!row.message_id) continue;
    const images = imagesByMessageId.get(row.message_id) ?? [];
    images.push({
      id: row.id,
      url: `/api/i/${row.id}`,
      mime: row.mime,
      width: row.width,
      height: row.height,
      byteSize: row.byte_size,
      taskId: row.task_id,
      sessionId: row.session_id ?? sessionId,
      messageId: row.message_id
    });
    imagesByMessageId.set(row.message_id, images);
  }
  return imagesByMessageId;
}

/**
 * 以 messages.attachments JSON 为主序，把 D1 多出的 `persistedImages` 追加在末尾不重复。
 * 这是“部分成功图片保留”的关键兜底：即使任务最终失败，已落库图片仍应出现在历史详情。
 */
export function mergePersistedGeneratedImages(
  attachments: Array<Partial<HistoryImageAttachment> & { id: string }>,
  persistedImages: HistoryImageAttachment[],
  context: {
    taskId?: string | null;
    sessionId: string;
    messageId: string;
    prompt?: string | null;
  }
): HistoryImageAttachment[] {
  const merged = attachments.map((image) => normalizeHistoryImageAttachment(image, context));
  const seenIds = new Set(merged.map((image) => image.id));
  for (const image of persistedImages) {
    if (seenIds.has(image.id)) continue;
    merged.push(normalizeHistoryImageAttachment(image, context));
    seenIds.add(image.id);
  }
  return merged;
}

/** 补齐 url/mime/外键，与前台 `ImageAttachment` 展示一致。 */
function normalizeHistoryImageAttachment(
  image: Partial<HistoryImageAttachment> & { id: string },
  context: {
    taskId?: string | null;
    sessionId: string;
    messageId: string;
    prompt?: string | null;
  }
): HistoryImageAttachment {
  return {
    id: image.id,
    url: image.url ?? `/api/i/${image.id}`,
    mime: image.mime ?? "image/png",
    width: image.width ?? null,
    height: image.height ?? null,
    byteSize: image.byteSize ?? 0,
    taskId: image.taskId ?? context.taskId ?? null,
    sessionId: image.sessionId ?? context.sessionId,
    messageId: image.messageId ?? context.messageId,
    prompt: image.prompt ?? context.prompt ?? null
  };
}
