import { assertSessionAccess } from "../../lib/access";
import { listUserHistorySessions } from "../../lib/historySessions";
import { parseJson } from "../../lib/json";
import {
  normalizeSessionMode,
  type HistoryImageAttachment,
  type SessionRouter,
  type TaskParamsWithReferences
} from "./common";
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
  // 历史列表：先分页 sessions，再对本页聚合任务数/封面（见 lib/historySessions）。
  historyRoutes.get("/", async (c) => {
    const user = c.get("user");
    return c.json(
      await listUserHistorySessions(c.env, {
        userId: user.id,
        q: c.req.query("q"),
        order: c.req.query("order") ?? "recent",
        page: Number(c.req.query("page") ?? "1"),
        pageSize: Number(c.req.query("pageSize") ?? "12")
      })
    );
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
        task_mode: string | null;
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
                mode: row.task_mode ? normalizeSessionMode(row.task_mode) : null,
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
