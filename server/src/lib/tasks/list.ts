import { appError } from "../errors";
import { parseJson } from "../json";
import type { AppBindings, GenerateParams, ImageAttachment, TaskStatus } from "../../types";

type TaskRow = {
  id: string;
  sessionId: string;
  messageId: string;
  title: string;
  status: TaskStatus;
  params: string;
  queuedAt: number;
  assignedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryOf: string | null;
};

export async function listUserTasks(
  env: AppBindings,
  userId: string,
  input: { scope: "active" | "recent"; limit: number; cursor?: string; taskId?: string }
) {
  let cursor: { queuedAt: number; id: string } | null = null;
  if (input.cursor) {
    try {
      cursor = JSON.parse(atob(input.cursor));
      if (
        !cursor ||
        !Number.isSafeInteger(cursor.queuedAt) ||
        typeof cursor.id !== "string" ||
        !cursor.id
      ) {
        throw new Error("Invalid cursor");
      }
    } catch {
      throw appError("VALIDATION_ERROR", "Invalid task cursor");
    }
  }
  // 游标使用时间和 ID，避免同一毫秒提交的任务在翻页时遗漏；仅查询本人可见会话。
  const visibility = `t.user_id = ?1 AND s.user_id = ?1
    AND s.deleted_at IS NULL AND m.deleted_at IS NULL`;
  const rows = await env.DB.prepare(
    `SELECT t.id, t.session_id AS sessionId, t.message_id AS messageId, s.title,
      t.status, t.params, t.queued_at AS queuedAt, t.assigned_at AS assignedAt,
      t.started_at AS startedAt, t.finished_at AS finishedAt,
      t.error_code AS errorCode, t.error_msg AS errorMessage, t.retry_of AS retryOf
     FROM tasks t JOIN sessions s ON s.id = t.session_id JOIN messages m ON m.id = t.message_id
     WHERE ${visibility}
       AND (?2 = 'recent' OR t.status IN ('queued', 'running'))
       AND (?3 IS NULL OR t.queued_at < ?3 OR (t.queued_at = ?3 AND t.id < ?4))
       AND (?6 IS NULL OR t.id = ?6)
     ORDER BY t.queued_at DESC, t.id DESC LIMIT ?5`
  )
    .bind(
      userId,
      input.scope,
      cursor?.queuedAt ?? null,
      cursor?.id ?? null,
      input.limit + 1,
      input.taskId ?? null
    )
    .all<TaskRow>();
  const active = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM tasks t JOIN sessions s ON s.id = t.session_id
     JOIN messages m ON m.id = t.message_id WHERE ${visibility} AND t.status IN ('queued', 'running')`
  )
    .bind(userId)
    .first<{ count: number }>();
  const page = rows.results.slice(0, input.limit);
  const ids = page.map((row) => row.id);
  const quotaRows = ids.length
    ? await env.DB.prepare(
        `SELECT task_id AS taskId, COALESCE(SUM(CASE WHEN reason = 'task_charge' THEN -delta ELSE 0 END), 0) AS precharged,
        COALESCE(SUM(CASE WHEN reason = 'task_refund' THEN delta ELSE 0 END), 0) AS refunded
       FROM quota_transactions WHERE user_id = ?1 AND task_id IN (SELECT value FROM json_each(?2)) GROUP BY task_id`
      )
        .bind(userId, JSON.stringify(ids))
        .all<{ taskId: string; precharged: number; refunded: number }>()
    : { results: [] };
  const referenceIds = [
    ...new Set(
      page.flatMap(
        (row) => parseJson<Partial<GenerateParams>>(row.params, {}).referenceImageIds ?? []
      )
    )
  ];
  const imageRows = ids.length
    ? await env.DB.prepare(
        `SELECT id, '/api/i/' || id AS url, mime, width, height, byte_size AS byteSize,
        task_id AS taskId, session_id AS sessionId FROM image_objects
       WHERE owner_user_id = ?1 AND deleted_at IS NULL
         AND ((task_id IN (SELECT value FROM json_each(?2)) AND is_reference = 0)
           OR id IN (SELECT value FROM json_each(?3)))
       ORDER BY created_at ASC, id ASC`
      )
        .bind(userId, JSON.stringify(ids), JSON.stringify(referenceIds))
        .all<ImageAttachment>()
    : { results: [] };
  const items = page.map((row) => {
    const quota = quotaRows.results.find((entry) => entry.taskId === row.id);
    const parsed = parseJson<Partial<GenerateParams>>(row.params, {});
    // 显式投影参数，避免未来内部字段随 JSON 快照进入列表响应。
    const params = {
      prompt: parsed.prompt ?? "",
      mode: parsed.mode ?? "text2image",
      size: parsed.size ?? "auto",
      n: parsed.n ?? 1,
      model: parsed.model,
      generationTargetId: parsed.generationTargetId ?? "default",
      referenceImageIds: parsed.referenceImageIds ?? [],
      sourceTaskId: parsed.sourceTaskId,
      sourceImageId: parsed.sourceImageId
    };
    const { assignedAt, ...task } = row;
    return {
      ...task,
      params,
      prompt: params.prompt,
      phase:
        row.status === "queued"
          ? assignedAt === null
            ? "queued"
            : "starting"
          : row.status === "running"
            ? "generating"
            : row.status,
      canCancel: row.status === "queued",
      images: imageRows.results.filter(
        (image) => image.taskId === row.id && !params.referenceImageIds.includes(image.id)
      ),
      referenceImages: params.referenceImageIds.flatMap((id) =>
        imageRows.results.filter((image) => image.id === id)
      ),
      quota: {
        precharged: quota?.precharged ?? 0,
        refunded: quota?.refunded ?? 0,
        consumed: Math.max((quota?.precharged ?? 0) - (quota?.refunded ?? 0), 0)
      }
    };
  });
  const last = page.at(-1);
  return {
    items,
    activeCount: active?.count ?? 0,
    nextCursor:
      rows.results.length > input.limit && last
        ? btoa(JSON.stringify({ queuedAt: last.queuedAt, id: last.id }))
        : null
  };
}
