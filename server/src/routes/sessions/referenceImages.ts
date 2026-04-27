import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../db/client";
import { imageObjects } from "../../db/schema";
import { parseJson } from "../../lib/json";
import type { AppEnv } from "../../types";
import type { MessageReferenceImage, TaskParamsWithReferences } from "./common";

/** 工作台消息页：本页行里出现的参考图 id 去重，用于一次批量查。 */
export function uniqueSessionMessageReferenceImageIds(
  rows: Array<{ referenceImageIds: string }>
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of parseJson<string[]>(row.referenceImageIds, [])) ids.add(id);
  }
  return [...ids];
}

/** 历史详情：消息行上 `reference_image_ids` 与 `task_params` 内双来源合并去重。 */
export function uniqueHistoryReferenceImageIds(
  rows: Array<{ reference_image_ids: string; task_params: string | null }>
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of parseJson<string[]>(row.reference_image_ids, [])) ids.add(id);
    const taskReferenceImageIds =
      parseJson<TaskParamsWithReferences>(row.task_params, {}).referenceImageIds ?? [];
    for (const id of taskReferenceImageIds) ids.add(id);
  }
  return [...ids];
}

/** 从 `image_objects` 拉元数据（需 owner 匹配）；返回 Map 供按 id 顺序展开。 */
export async function loadReferenceImagesById(
  env: AppEnv["Bindings"],
  imageIds: string[],
  ownerUserId: string
): Promise<Map<string, MessageReferenceImage>> {
  if (imageIds.length === 0) return new Map();
  const rows = await getDb(env)
    .select({
      id: imageObjects.id,
      mime: imageObjects.mime,
      width: imageObjects.width,
      height: imageObjects.height,
      byteSize: imageObjects.byteSize,
      taskId: imageObjects.taskId,
      sessionId: imageObjects.sessionId
    })
    .from(imageObjects)
    .where(
      and(
        inArray(imageObjects.id, imageIds),
        eq(imageObjects.ownerUserId, ownerUserId),
        isNull(imageObjects.deletedAt)
      )
    );
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        url: `/api/i/${row.id}`,
        mime: row.mime,
        width: row.width,
        height: row.height,
        byteSize: row.byteSize,
        taskId: row.taskId,
        sessionId: row.sessionId
      }
    ])
  );
}

/** 按 `imageIds` 顺序从 Map 取图并写入当前 message 的上下文字段。 */
export function referenceImagesForIds(
  imagesById: Map<string, MessageReferenceImage>,
  imageIds: string[],
  context: {
    taskId?: string | null;
    sessionId: string;
    messageId: string;
    prompt?: string | null;
  }
): MessageReferenceImage[] {
  return imageIds
    .map((id) => imagesById.get(id))
    .filter((image): image is MessageReferenceImage => Boolean(image))
    .map((image) => ({
      ...image,
      taskId: image.taskId ?? context.taskId ?? null,
      sessionId: image.sessionId ?? context.sessionId,
      messageId: context.messageId,
      prompt: context.prompt ?? null
    }));
}
