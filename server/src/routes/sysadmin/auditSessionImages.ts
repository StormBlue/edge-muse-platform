import { and, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../db/client";
import { imageObjects } from "../../db/schema";
import { parseJson } from "../../lib/json";
import type { AppEnv } from "../../types";
import type {
  AuditGenerationFailure,
  AuditImageAttachment,
  AuditReferenceImage,
  TaskParamsWithReferences
} from "./common";

/** 从消息行上的 `reference_image_ids` 与 task_params 里 referenceImageIds 并集去重。 */
export function uniqueAuditReferenceImageIds(
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

/** 批量拉参考图元数据，供 `auditReferenceImagesForIds` 按消息顺序展开。 */
export async function loadAuditReferenceImagesById(
  env: AppEnv["Bindings"],
  imageIds: string[]
): Promise<Map<string, AuditReferenceImage>> {
  if (imageIds.length === 0) return new Map();
  const rows = await getDb(env)
    .select({
      id: imageObjects.id,
      mime: imageObjects.mime,
      width: imageObjects.width,
      height: imageObjects.height,
      byteSize: imageObjects.byteSize,
      taskId: imageObjects.taskId,
      sessionId: imageObjects.sessionId,
      createdAt: imageObjects.createdAt
    })
    .from(imageObjects)
    .where(and(inArray(imageObjects.id, imageIds), isNull(imageObjects.deletedAt)));
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
        sessionId: row.sessionId,
        createdAt: row.createdAt,
        generationDurationMs: null,
        generationIndex: null
      }
    ])
  );
}

/** 按 id 列表从 Map 取图并补上当前消息的 task/session/message 上下文。 */
export function auditReferenceImagesForIds(
  imagesById: Map<string, AuditReferenceImage>,
  imageIds: string[],
  context: {
    taskId?: string | null;
    sessionId: string;
    messageId: string;
    prompt?: string | null;
  }
): AuditReferenceImage[] {
  return imageIds
    .map((id) => imagesById.get(id))
    .filter((image): image is AuditReferenceImage => Boolean(image))
    .map((image) => ({
      ...image,
      taskId: image.taskId ?? context.taskId ?? null,
      sessionId: image.sessionId ?? context.sessionId,
      messageId: context.messageId,
      prompt: context.prompt ?? null
    }));
}

/**
 * 按会话扫 `image_objects`（非参考图），按 message_id 分组。
 * `durationCheckpointByTask`：同 task 多图时，后续图的「生成耗时」相对上一张完成时间戳。
 */
export async function loadAuditGeneratedImagesByMessageId(
  env: AppEnv["Bindings"],
  sessionId: string
): Promise<Map<string, AuditImageAttachment[]>> {
  const rows = await env.DB.prepare(
    `SELECT image_objects.id,
       image_objects.mime,
       image_objects.width,
       image_objects.height,
       image_objects.byte_size,
       image_objects.task_id,
       image_objects.session_id,
       image_objects.created_at,
       tasks.message_id,
       tasks.started_at AS task_started_at,
       tasks.queued_at AS task_queued_at
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
      created_at: number;
      message_id: string | null;
      task_started_at: number | null;
      task_queued_at: number | null;
    }>();
  const imagesByMessageId = new Map<string, AuditImageAttachment[]>();
  const durationCheckpointByTask = new Map<string, number>();
  for (const row of rows.results) {
    if (!row.message_id) continue;
    const durationKey = row.task_id ?? row.message_id;
    const durationStart =
      durationCheckpointByTask.get(durationKey) ?? row.task_started_at ?? row.task_queued_at;
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
      messageId: row.message_id,
      createdAt: row.created_at,
      generationDurationMs: durationStart ? Math.max(row.created_at - durationStart, 0) : null
    });
    durationCheckpointByTask.set(durationKey, row.created_at);
    imagesByMessageId.set(row.message_id, images);
  }
  return imagesByMessageId;
}

/**
 * 以 messages.attachments 为主序合并 `persistedImages` 中多出的行。
 * 这能保留“前几张已成功落库，但后续 provider 大量失败”的部分成功结果。
 */
export function mergeAuditGeneratedImages(
  attachments: Array<Partial<AuditImageAttachment> & { id: string }>,
  persistedImages: AuditImageAttachment[],
  context: {
    taskId?: string | null;
    sessionId: string;
    messageId: string;
    prompt?: string | null;
  }
): AuditImageAttachment[] {
  const persistedById = new Map(persistedImages.map((image) => [image.id, image]));
  const merged = attachments.map((image) => {
    const persisted = persistedById.get(image.id);
    return normalizeAuditImageAttachment(
      {
        ...persisted,
        ...image,
        createdAt: image.createdAt ?? persisted?.createdAt,
        generationDurationMs: image.generationDurationMs ?? persisted?.generationDurationMs
      },
      context
    );
  });
  const seenIds = new Set(merged.map((image) => image.id));
  for (const image of persistedImages) {
    if (seenIds.has(image.id)) continue;
    merged.push(normalizeAuditImageAttachment(image, context));
    seenIds.add(image.id);
  }
  return merged;
}

/** 优先解析 `provider_raw_response` 里 type=generation_failure；否则从 error_msg 多行文本兜底拆条。 */
export function extractAuditGenerationFailures(
  rawResponse: string | null,
  fallbackCode: string | null,
  fallbackMessage: string | null
): AuditGenerationFailure[] {
  const rawItems = parseJson<unknown[]>(rawResponse, []);
  const failures = rawItems
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter((item) => item.type === "generation_failure")
    .map((item) => ({
      index: numberValue(item.index) ?? 0,
      code: stringValue(item.code) ?? "PROVIDER_ERROR",
      message: stringValue(item.message) ?? "Generation failed",
      phase: stringValue(item.phase),
      createdAt: numberValue(item.createdAt)
    }));
  if (failures.length > 0) return failures;
  if (!fallbackMessage) return [];
  return fallbackMessage.split("\n").map((line, index) => ({
    index,
    code: fallbackCode ?? "PROVIDER_ERROR",
    message: line.replace(/^#\d+\s+[^:]+:\s*/, "") || fallbackMessage,
    phase: null,
    createdAt: null
  }));
}

/** 填空字段、统一 URL 与 messageId，保证巡查列表每行形状一致。 */
function normalizeAuditImageAttachment(
  image: Partial<AuditImageAttachment> & { id: string },
  context: {
    taskId?: string | null;
    sessionId: string;
    messageId: string;
    prompt?: string | null;
  }
): AuditImageAttachment {
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
    prompt: image.prompt ?? context.prompt ?? null,
    createdAt: image.createdAt ?? null,
    generationDurationMs: image.generationDurationMs ?? null,
    generationIndex: image.generationIndex ?? null
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
