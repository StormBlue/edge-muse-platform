import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messages } from "../../db/schema";
import { appError } from "../../lib/errors";
import { parseJson } from "../../lib/json";
import {
  hasColumn,
  type AuditImageAttachment,
  type SysadminRouter,
  type TaskParamsWithReferences
} from "./common";
import {
  auditReferenceImagesForIds,
  extractAuditGenerationFailures,
  loadAuditGeneratedImagesByMessageId,
  loadAuditReferenceImagesById,
  mergeAuditGeneratedImages,
  uniqueAuditReferenceImageIds
} from "./auditSessionImages";

export function registerSysadminAuditSessionRoutes(sysadminRoutes: SysadminRouter) {
  // 按用户列会话（分页）：`id=me` 查当前 sysadmin 自己；`userId=_` 可查全站。
  sysadminRoutes.get("/users/:id/sessions", async (c) => {
    const requestedUserId = c.req.param("id");
    const userId = requestedUserId === "me" ? c.get("user").id : requestedUserId;
    const q = c.req.query("q")?.trim();
    const requestedPage = Number(c.req.query("page") ?? "1");
    const requestedPageSize = Number(c.req.query("pageSize") ?? "12");
    const page = Number.isFinite(requestedPage) ? Math.max(Math.floor(requestedPage), 1) : 1;
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(Math.max(Math.floor(requestedPageSize), 1), 50)
      : 12;
    const offset = (page - 1) * pageSize;
    const hasUsername = await hasColumn(c.env, "users", "username");
    const conditions = ["1 = 1"];
    const binds: unknown[] = [];
    if (userId !== "_") {
      binds.push(userId);
      conditions.push(`sessions.user_id = ?${binds.length}`);
    }
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
    const totalStatement = c.env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM sessions
       WHERE ${conditions.join(" AND ")}`
    );
    const totalRows = binds.length
      ? await totalStatement.bind(...binds).all<{ total: number }>()
      : await totalStatement.all<{ total: number }>();
    const rows = await c.env.DB.prepare(
      `SELECT sessions.id,
         sessions.user_id,
         users.email AS user_email,
         ${hasUsername ? "users.username" : "NULL"} AS user_username,
         users.nickname AS user_nickname,
         users.role AS user_role,
         sessions.title,
         sessions.mode,
         sessions.provider_key_id,
         sessions.settings,
         sessions.created_at,
         sessions.updated_at,
         sessions.last_message_at,
         sessions.archived,
         sessions.deleted_at,
         COUNT(tasks.id) AS task_count,
         (
           SELECT COUNT(*)
           FROM (
             SELECT json_extract(accepted_images.value, '$.id') AS image_id
             FROM messages accepted_image_messages,
               json_each(
                 CASE
                   WHEN json_valid(accepted_image_messages.attachments)
                     THEN accepted_image_messages.attachments
                   ELSE '[]'
                 END
               ) accepted_images
             WHERE accepted_image_messages.session_id = sessions.id
               AND accepted_image_messages.deleted_at IS NULL
               AND json_extract(accepted_images.value, '$.id') IS NOT NULL
             UNION
             SELECT persisted_images.id AS image_id
             FROM image_objects persisted_images
             INNER JOIN tasks persisted_image_tasks ON persisted_image_tasks.id = persisted_images.task_id
             WHERE persisted_images.session_id = sessions.id
               AND persisted_images.deleted_at IS NULL
               AND persisted_images.is_reference = 0
               AND persisted_image_tasks.message_id IS NOT NULL
           ) merged_success_images
         ) AS image_count,
         cover.id AS cover_image_id,
         cover.mime AS cover_mime,
         cover.width AS cover_width,
         cover.height AS cover_height,
         cover.byte_size AS cover_byte_size,
         cover.task_id AS cover_task_id
       FROM sessions
       LEFT JOIN users ON users.id = sessions.user_id
       LEFT JOIN tasks ON tasks.session_id = sessions.id
       LEFT JOIN image_objects cover ON cover.id = COALESCE(
           (
             SELECT latest_persisted_images.id
             FROM image_objects latest_persisted_images
             INNER JOIN tasks latest_image_tasks ON latest_image_tasks.id = latest_persisted_images.task_id
             WHERE latest_persisted_images.session_id = sessions.id
               AND latest_persisted_images.deleted_at IS NULL
               AND latest_persisted_images.is_reference = 0
               AND latest_image_tasks.message_id IS NOT NULL
             ORDER BY latest_persisted_images.created_at DESC
             LIMIT 1
           ),
           (
             SELECT json_extract(cover_images.value, '$.id')
             FROM messages cover_messages,
               json_each(
                 CASE
                   WHEN json_valid(cover_messages.attachments)
                     THEN cover_messages.attachments
                   ELSE '[]'
                 END
               ) cover_images
             WHERE cover_messages.session_id = sessions.id
               AND cover_messages.deleted_at IS NULL
               AND json_extract(cover_images.value, '$.id') IS NOT NULL
             ORDER BY cover_messages.created_at DESC, CAST(cover_images.key AS INTEGER) DESC
             LIMIT 1
           )
         )
         AND cover.deleted_at IS NULL
         AND cover.is_reference = 0
       WHERE ${conditions.join(" AND ")}
       GROUP BY sessions.id
       ORDER BY sessions.last_message_at DESC
       LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`
    )
      .bind(...binds, pageSize, offset)
      .all<{
        id: string;
        user_id: string;
        user_email: string | null;
        user_username: string | null;
        user_nickname: string | null;
        user_role: "sysadmin" | "admin" | "user" | null;
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
        image_count: number;
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
        user: {
          id: row.user_id,
          email: row.user_email,
          username: row.user_username,
          nickname: row.user_nickname,
          role: row.user_role
        },
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
        imageCount: row.image_count,
        coverImage: row.cover_image_id
          ? {
              id: row.cover_image_id,
              url: `/api/i/${row.cover_image_id}`,
              mime: row.cover_mime ?? "image/png",
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

  // 单会话深度巡查：消息 + 关联 task + 附件与参考图合并、从 image_objects 补生成耗时。
  sysadminRoutes.get("/sessions/:id/detail", async (c) => {
    const sessionId = c.req.param("id");
    const sessionRows = await c.env.DB.prepare(
      `SELECT id,
         user_id,
         title,
         mode,
         provider_key_id,
         settings,
         created_at,
         updated_at,
         last_message_at,
         archived,
         deleted_at
       FROM sessions
       WHERE id = ?1`
    )
      .bind(sessionId)
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
      }>();
    const session = sessionRows.results[0];
    if (!session) throw appError("NOT_FOUND", "Session not found");

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
         tasks.provider_raw_response AS task_provider_raw_response,
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
        task_provider_raw_response: string | null;
        task_queued_at: number | null;
        task_started_at: number | null;
        task_finished_at: number | null;
      }>();
    const persistedImagesByMessageId = await loadAuditGeneratedImagesByMessageId(c.env, session.id);
    const referenceImagesById = await loadAuditReferenceImagesById(
      c.env,
      uniqueAuditReferenceImageIds(rows.results)
    );
    const taskCount = rows.results.filter((row) => row.task_id).length;
    return c.json({
      session: {
        id: session.id,
        userId: session.user_id,
        title: session.title,
        mode: session.mode,
        providerKeyId: session.provider_key_id,
        settings: parseJson(session.settings, {}),
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        lastMessageAt: session.last_message_at,
        archived: Boolean(session.archived),
        deletedAt: session.deleted_at,
        taskCount
      },
      messages: rows.results.map((row) => {
        const taskParams = parseJson<TaskParamsWithReferences>(row.task_params, {});
        const referenceImageIds = parseJson<string[]>(row.reference_image_ids, []);
        const effectiveReferenceImageIds =
          referenceImageIds.length > 0 ? referenceImageIds : (taskParams.referenceImageIds ?? []);
        const attachments = mergeAuditGeneratedImages(
          parseJson<Array<Partial<AuditImageAttachment> & { id: string }>>(row.attachments, []),
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
          referenceImages: auditReferenceImagesForIds(
            referenceImagesById,
            effectiveReferenceImageIds,
            {
              taskId: row.task_id,
              sessionId: row.session_id,
              messageId: row.id,
              prompt: row.prompt
            }
          ),
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
                generationFailures: extractAuditGenerationFailures(
                  row.task_provider_raw_response,
                  row.task_error_code,
                  row.task_error_msg
                ),
                queuedAt: row.task_queued_at,
                startedAt: row.task_started_at,
                finishedAt: row.task_finished_at,
                durationMs:
                  row.task_finished_at && row.task_started_at
                    ? Math.max(row.task_finished_at - row.task_started_at, 0)
                    : null
              }
            : null
        };
      })
    });
  });

  // 原始消息行（较少加工）：便于与 detail 接口对照排障。
  sysadminRoutes.get("/sessions/:id/messages", async (c) => {
    const rows = await getDb(c.env)
      .select()
      .from(messages)
      .where(eq(messages.sessionId, c.req.param("id")))
      .orderBy(messages.createdAt);
    return c.json({
      items: rows.map((row) => ({
        ...row,
        attachments: parseJson(row.attachments, []),
        referenceImageIds: parseJson(row.referenceImageIds, [])
      }))
    });
  });
}
