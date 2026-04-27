import { assertSessionAccess } from "../../lib/access";
import { parseJson } from "../../lib/json";
import type { HistoryImageAttachment, SessionRouter, TaskParamsWithReferences } from "./common";
import {
  loadPersistedGeneratedImagesByMessageId,
  mergePersistedGeneratedImages
} from "./historyImages";
import {
  loadReferenceImagesById,
  referenceImagesForIds,
  uniqueHistoryReferenceImageIds
} from "./referenceImages";

export function registerHistoryRoutes(historyRoutes: SessionRouter) {
  // 历史列表：分页、标题/prompt 搜索、多子查询聚合（任务数、请求张数、实落库图、封面、进行状态）。
  historyRoutes.get("/", async (c) => {
    const user = c.get("user");
    const q = c.req.query("q");
    const order = c.req.query("order") ?? "recent";
    const requestedPage = Number(c.req.query("page") ?? "1");
    const requestedPageSize = Number(c.req.query("pageSize") ?? "12");
    const page = Number.isFinite(requestedPage) ? Math.max(Math.floor(requestedPage), 1) : 1;
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(Math.max(Math.floor(requestedPageSize), 1), 50)
      : 12;
    const offset = (page - 1) * pageSize;
    const conditions = ["sessions.deleted_at IS NULL"];
    const binds: unknown[] = [user.id];
    conditions.push(`sessions.user_id = ?${binds.length}`);
    if (q) {
      binds.push(`%${q}%`);
      const searchIndex = binds.length;
      conditions.push(
        `(sessions.title LIKE ?${searchIndex} OR EXISTS (
          SELECT 1 FROM messages m
          WHERE m.session_id = sessions.id AND m.deleted_at IS NULL AND m.prompt LIKE ?${searchIndex}
        ))`
      );
    }
    const orderSql =
      order === "oldest"
        ? "sessions.created_at ASC"
        : order === "task_count"
          ? "task_count DESC, sessions.last_message_at DESC"
          : "sessions.last_message_at DESC";
    const totalRows = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM sessions
       WHERE ${conditions.join(" AND ")}`
    )
      .bind(...binds)
      .all<{ total: number }>();
    const rows = await c.env.DB.prepare(
      `SELECT sessions.*,
         (
           SELECT COUNT(*)
           FROM tasks task_totals
           WHERE task_totals.session_id = sessions.id
         ) AS task_count,
         (
           SELECT COALESCE(
             SUM(
               CASE
                 WHEN json_valid(requested_tasks.params)
                   THEN COALESCE(CAST(json_extract(requested_tasks.params, '$.n') AS INTEGER), 1)
                 ELSE 1
               END
             ),
             0
           )
           FROM tasks requested_tasks
           WHERE requested_tasks.session_id = sessions.id
         ) AS requested_image_count,
         (
           SELECT COUNT(*)
           FROM image_objects generated_images
           WHERE generated_images.session_id = sessions.id
             AND generated_images.deleted_at IS NULL
             AND generated_images.is_reference = 0
         ) AS image_count,
         COALESCE(
           (
             SELECT active_tasks.status
             FROM tasks active_tasks
             WHERE active_tasks.session_id = sessions.id
               AND active_tasks.status IN ('running', 'queued')
             ORDER BY CASE active_tasks.status WHEN 'running' THEN 0 ELSE 1 END,
               active_tasks.queued_at DESC
             LIMIT 1
           ),
           (
             SELECT latest_tasks.status
             FROM tasks latest_tasks
             WHERE latest_tasks.session_id = sessions.id
             ORDER BY latest_tasks.queued_at DESC
             LIMIT 1
           )
         ) AS session_status,
         cover.id AS cover_image_id,
         cover.mime AS cover_mime,
         cover.width AS cover_width,
         cover.height AS cover_height,
         cover.byte_size AS cover_byte_size,
         cover.task_id AS cover_task_id
       FROM sessions
       LEFT JOIN image_objects cover ON cover.id = (
         SELECT image_objects.id
         FROM image_objects
         WHERE image_objects.session_id = sessions.id
           AND image_objects.deleted_at IS NULL
           AND image_objects.is_reference = 0
         ORDER BY image_objects.created_at DESC
         LIMIT 1
       )
       WHERE ${conditions.join(" AND ")}
       GROUP BY sessions.id
       ORDER BY ${orderSql}
       LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`
    )
      .bind(...binds, pageSize, offset)
      .all<{
        id: string;
        user_id: string;
        title: string;
        mode: "text2image" | "image2image" | "chat";
        provider_key_id: string | null;
        settings: string;
        created_at: number;
        updated_at: number;
        last_message_at: number;
        archived: number;
        deleted_at: number | null;
        task_count: number;
        requested_image_count: number;
        image_count: number;
        session_status: string | null;
        cover_image_id: string | null;
        cover_mime: string | null;
        cover_width: number | null;
        cover_height: number | null;
        cover_byte_size: number | null;
        cover_task_id: string | null;
      }>();
    const total = totalRows.results[0]?.total ?? 0;
    return c.json({
      items: rows.results.map((row) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        mode: row.mode,
        providerKeyId: row.provider_key_id,
        settings: parseJson(row.settings, {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
        archived: Boolean(row.archived),
        deletedAt: row.deleted_at,
        taskCount: row.task_count,
        requestedImageCount: Math.max(row.requested_image_count, row.image_count),
        imageCount: row.image_count,
        status: row.session_status,
        coverImage: row.cover_image_id
          ? {
              id: row.cover_image_id,
              url: `/api/i/${row.cover_image_id}`,
              mime: row.cover_mime,
              width: row.cover_width,
              height: row.cover_height,
              byteSize: row.cover_byte_size ?? 0,
              taskId: row.cover_task_id,
              sessionId: row.id
            }
          : null
      })),
      page,
      pageSize,
      total
    });
  });

  // 历史详情：全量正序 200 条，合并 D1 持久化图与 reference。
  historyRoutes.get("/:id", async (c) => {
    const session = await assertSessionAccess(c.env, c.req.param("id"), c.get("user"));
    const rows = await c.env.DB.prepare(
      `SELECT messages.id,
         messages.session_id,
         messages.role,
         messages.prompt,
         messages.reference_image_ids,
         messages.attachments,
         messages.task_id,
         messages.status,
         messages.created_at,
         tasks.mode AS task_mode,
         tasks.params AS task_params,
         tasks.status AS task_status,
         tasks.error_code AS task_error_code,
         tasks.error_msg AS task_error_msg,
         tasks.queued_at AS task_queued_at,
         tasks.started_at AS task_started_at,
         tasks.finished_at AS task_finished_at
       FROM messages
       LEFT JOIN tasks ON tasks.message_id = messages.id
       WHERE messages.session_id = ?1
         AND messages.deleted_at IS NULL
       ORDER BY messages.created_at ASC
       LIMIT 200`
    )
      .bind(session.id)
      .all<{
        id: string;
        session_id: string;
        role: "user" | "assistant" | "system";
        prompt: string | null;
        reference_image_ids: string;
        attachments: string;
        task_id: string | null;
        status: string;
        created_at: number;
        task_mode: "text2image" | "image2image" | "chat" | null;
        task_params: string | null;
        task_status: string | null;
        task_error_code: string | null;
        task_error_msg: string | null;
        task_queued_at: number | null;
        task_started_at: number | null;
        task_finished_at: number | null;
      }>();
    const persistedImagesByMessageId = await loadPersistedGeneratedImagesByMessageId(
      c.env,
      session.id
    );
    const referenceImagesById = await loadReferenceImagesById(
      c.env,
      uniqueHistoryReferenceImageIds(rows.results),
      session.userId
    );
    const taskCount = rows.results.filter((row) => row.task_id).length;
    return c.json({
      session: {
        ...session,
        settings: parseJson(session.settings, {}),
        taskCount
      },
      messages: rows.results.map((row) => {
        const taskParams = parseJson<TaskParamsWithReferences>(row.task_params, {});
        const referenceImageIds = parseJson<string[]>(row.reference_image_ids, []);
        const effectiveReferenceImageIds =
          referenceImageIds.length > 0 ? referenceImageIds : (taskParams.referenceImageIds ?? []);
        const attachments = mergePersistedGeneratedImages(
          parseJson<Array<Partial<HistoryImageAttachment> & { id: string }>>(row.attachments, []),
          persistedImagesByMessageId.get(row.id) ?? [],
          {
            taskId: row.task_id,
            sessionId: row.session_id,
            messageId: row.id,
            prompt: row.prompt
          }
        );
        return {
          id: row.id,
          sessionId: row.session_id,
          role: row.role,
          prompt: row.prompt,
          referenceImageIds,
          referenceImages: referenceImagesForIds(referenceImagesById, effectiveReferenceImageIds, {
            taskId: row.task_id,
            sessionId: row.session_id,
            messageId: row.id,
            prompt: row.prompt
          }),
          attachments,
          taskId: row.task_id,
          status: row.status,
          createdAt: row.created_at,
          task: row.task_id
            ? {
                id: row.task_id,
                mode: row.task_mode,
                params: taskParams,
                status: row.task_status,
                errorCode: row.task_error_code,
                errorMsg: row.task_error_msg,
                queuedAt: row.task_queued_at,
                startedAt: row.task_started_at,
                finishedAt: row.task_finished_at
              }
            : null
        };
      })
    });
  });
}
