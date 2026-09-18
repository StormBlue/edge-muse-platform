import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messages } from "../../db/schema";
import { listAuditSessions } from "../../lib/auditSessionList";
import { appError } from "../../lib/errors";
import { parseJson } from "../../lib/json";
import {
  normalizeSysadminSessionMode,
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
    return c.json(
      await listAuditSessions(c.env, {
        userId,
        q: c.req.query("q")?.trim(),
        page: Number(c.req.query("page") ?? "1"),
        pageSize: Number(c.req.query("pageSize") ?? "12")
      })
    );
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
        mode: string;
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
        task_mode: string | null;
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
        mode: normalizeSysadminSessionMode(session.mode),
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
                mode: row.task_mode ? normalizeSysadminSessionMode(row.task_mode) : null,
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
