/**
 * 会话 CRUD、消息分页、`/active-generation` 查询当前进行中任务。
 * 另导出 `historyRoutes`：用户「历史」只读列表与详情，与侧栏会话接口分离（复杂统计与封面 SQL）。
 *
 * 权限：全组 `requireAuth`；`assertSessionAccess` 对 `:id` 资源校验 `sessions.user_id === user.id`。
 * 消息分页：`cursor` 为**更旧**一侧的边界（`lt(createdAt|lastMessageAt)`），多取 1 条算 `nextCursor`。
 */
import { and, desc, eq, inArray, isNull, like, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { imageObjects, messages, sessions, tasks } from "../db/schema";
import { assertSessionAccess } from "../lib/access";
import { audit } from "../lib/audit";
import { appError } from "../lib/errors";
import {
  isSingleActiveGenerationRole,
  MAX_SYSADMIN_IMAGE_COUNT,
  assertImageCountAllowed
} from "../lib/generationPolicy";
import { newId, now } from "../lib/id";
import { parseJson, stringifyJson } from "../lib/json";
import { defaultSessionTitle } from "../lib/sessionTitle";
import { findActiveGenerationTaskForUser } from "../lib/tasks";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const modeSchema = z.enum(["text2image", "image2image", "chat"]);
/** 历史/消息 JSON 里嵌套的附件形状，与前端 `ImageAttachment` 对齐 */
type HistoryImageAttachment = {
  id: string;
  url: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  byteSize: number;
  taskId?: string | null;
  sessionId?: string | null;
  messageId?: string | null;
  prompt?: string | null;
};
type MessageReferenceImage = HistoryImageAttachment;
/** 会话默认生图参数，整段 JSON 存 D1 `sessions.settings` */
const settingsSchema = z.object({
  size: z.string().default("1024x1024"),
  n: z.number().int().min(1).max(MAX_SYSADMIN_IMAGE_COUNT).default(1),
  model: z.string().optional()
});

export const sessionRoutes = new Hono<AppEnv>();

// 本组所有路由需登录；具体 session 再 `assertSessionAccess`
sessionRoutes.use("*", requireAuth);

// ===================== 会话：创建、列表、活跃任务、单条、更新、软删 =====================
// POST /api/sessions：新建会话行，标题缺省用 `defaultSessionTitle`
sessionRoutes.post(
  "/",
  zValidator(
    "json",
    z.object({
      title: z.string().trim().min(1).max(80).optional(),
      mode: modeSchema.default("text2image"),
      settings: settingsSchema.default({ size: "1024x1024", n: 1 })
    })
  ),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    assertImageCountAllowed(user.role, body.settings.n);
    const id = newId("ses");
    const timestamp = now();
    const title = body.title ?? defaultSessionTitle(timestamp);
    await getDb(c.env)
      .insert(sessions)
      .values({
        id,
        userId: user.id,
        title,
        mode: body.mode,
        providerKeyId: null,
        settings: stringifyJson(body.settings),
        createdAt: timestamp,
        updatedAt: timestamp,
        lastMessageAt: timestamp,
        archived: false,
        deletedAt: null
      });
    await audit(c.env, {
      actorId: user.id,
      action: "session.create",
      targetType: "session",
      targetId: id
    });
    return c.json(
      { session: { id, ...body, title, createdAt: timestamp, updatedAt: timestamp } },
      201
    );
  }
);

// GET /api/sessions：侧栏列表，按 lastMessageAt 倒序
// cursor=上页**最后一条**（更旧）的 lastMessageAt，`lt` 再取更旧的一页
sessionRoutes.get("/", async (c) => {
  const user = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") ?? "20"), 50);
  const cursor = Number(c.req.query("cursor") ?? "0");
  const q = c.req.query("q");
  const where = and(
    eq(sessions.userId, user.id),
    isNull(sessions.deletedAt),
    q ? like(sessions.title, `%${q}%`) : undefined,
    cursor ? lt(sessions.lastMessageAt, cursor) : undefined
  );
  const rows = await getDb(c.env)
    .select()
    .from(sessions)
    .where(where)
    .orderBy(desc(sessions.lastMessageAt))
    .limit(limit + 1);
  return c.json({
    items: rows.slice(0, limit).map((row) => ({ ...row, settings: parseJson(row.settings, {}) })),
    // `slice(0,limit)` 后第 limit 条即多取的那条，其 lastMessageAt 作为下一页游标
    nextCursor: rows.length > limit ? rows[limit - 1].lastMessageAt : null
  });
});

// 非 sysadmin：单活跃生图，用于刷新后恢复 UI/WS；sysadmin/多任务策略返回 `{ active: null }`
sessionRoutes.get("/active-generation", async (c) => {
  const user = c.get("user");
  if (!isSingleActiveGenerationRole(user.role)) return c.json({ active: null });
  const active = await findActiveGenerationTaskForUser(c.env, user.id);
  return c.json({ active });
});

// GET /api/sessions/:id：单条元数据，settings 从 JSON 字符串解析
sessionRoutes.get("/:id", async (c) => {
  const session = await assertSessionAccess(c.env, c.req.param("id"), c.get("user"));
  return c.json({ session: { ...session, settings: parseJson(session.settings, {}) } });
});

// PATCH：有任务后锁标题（防与首条生成摘要不一致）；settings.n 受角色策略约束
sessionRoutes.patch(
  "/:id",
  zValidator(
    "json",
    z.object({
      title: z.string().trim().min(1).max(80).optional(),
      settings: settingsSchema.optional(),
      archived: z.boolean().optional()
    })
  ),
  async (c) => {
    const session = await assertSessionAccess(c.env, c.req.param("id"), c.get("user"));
    const body = c.req.valid("json");
    const db = getDb(c.env);
    if (body.settings) assertImageCountAllowed(c.get("user").role, body.settings.n);
    if (body.title !== undefined) {
      const task = await db.query.tasks.findFirst({
        where: eq(tasks.sessionId, session.id)
      });
      // 已产生过任务则不允许改会话标题，避免与消息流展示不一致
      if (task) throw appError("VALIDATION_ERROR", "Session title is locked after generation");
    }
    const patch = {
      ...(body.title ? { title: body.title } : {}),
      ...(body.settings ? { settings: stringifyJson(body.settings) } : {}),
      ...(body.archived !== undefined ? { archived: body.archived } : {}),
      updatedAt: now()
    };
    await db.update(sessions).set(patch).where(eq(sessions.id, session.id));
    await audit(c.env, {
      actorId: c.get("user").id,
      action: "session.update",
      targetType: "session",
      targetId: session.id,
      payload: body
    });
    return c.json({ ok: true });
  }
);

// 软删：写 deletedAt，列表与消息查询均过滤
sessionRoutes.delete("/:id", async (c) => {
  const session = await assertSessionAccess(c.env, c.req.param("id"), c.get("user"));
  await getDb(c.env)
    .update(sessions)
    .set({ deletedAt: now(), updatedAt: now() })
    .where(eq(sessions.id, session.id));
  await audit(c.env, {
    actorId: c.get("user").id,
    action: "session.delete",
    targetType: "session",
    targetId: session.id
  });
  return c.json({ ok: true });
});

// ===================== 消息：分页（工作台）、单条删除 =====================
// 按 createdAt 倒序取一页，再 reverse 成时间正序；leftJoin tasks 附带错误码供气泡展示
sessionRoutes.get("/:id/messages", async (c) => {
  const session = await assertSessionAccess(c.env, c.req.param("id"), c.get("user"));
  const limit = Math.min(Number(c.req.query("limit") ?? "20"), 50);
  const cursor = Number(c.req.query("cursor") ?? "0");
  const rows = await getDb(c.env)
    .select({
      id: messages.id,
      sessionId: messages.sessionId,
      role: messages.role,
      prompt: messages.prompt,
      referenceImageIds: messages.referenceImageIds,
      attachments: messages.attachments,
      taskId: messages.taskId,
      status: messages.status,
      createdAt: messages.createdAt,
      deletedAt: messages.deletedAt,
      taskErrorCode: tasks.errorCode,
      taskErrorMsg: tasks.errorMsg
    })
    .from(messages)
    .leftJoin(tasks, eq(tasks.messageId, messages.id))
    .where(
      and(
        eq(messages.sessionId, session.id),
        isNull(messages.deletedAt),
        cursor ? lt(messages.createdAt, cursor) : undefined
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
  const pageRows = rows.slice(0, limit).reverse();
  const referenceImagesById = await loadReferenceImagesById(
    c.env,
    uniqueSessionMessageReferenceImageIds(pageRows),
    session.userId
  );
  // `nextCursor` = 多取的第 limit+1 条（更**早**）的 createdAt，供前端 `loadOlderMessages` 再拉
  return c.json({
    items: pageRows.map((row) => {
      const referenceImageIds = parseJson<string[]>(row.referenceImageIds, []);
      return {
        ...row,
        referenceImageIds,
        referenceImages: referenceImagesForIds(referenceImagesById, referenceImageIds, {
          taskId: row.taskId,
          sessionId: row.sessionId,
          messageId: row.id,
          prompt: row.prompt
        }),
        attachments: parseJson(row.attachments, []),
        error: row.taskErrorMsg
          ? {
              code: row.taskErrorCode ?? "PROVIDER_ERROR",
              message: row.taskErrorMsg
            }
          : null
      };
    }),
    nextCursor: rows.length > limit ? rows[limit].createdAt : null
  });
});

// 单条消息软删，并软删其附件里**本人拥有**的 image_objects（防引用泄露）
sessionRoutes.delete("/:sessionId/messages/:messageId", async (c) => {
  const session = await assertSessionAccess(c.env, c.req.param("sessionId"), c.get("user"));
  const db = getDb(c.env);
  const message = await db.query.messages.findFirst({
    where: and(eq(messages.id, c.req.param("messageId")), eq(messages.sessionId, session.id))
  });
  await db
    .update(messages)
    .set({ deletedAt: now() })
    .where(and(eq(messages.id, c.req.param("messageId")), eq(messages.sessionId, session.id)));
  const attachments = parseJson<Array<{ id?: string }>>(message?.attachments, []);
  const imageIds = attachments.map((image) => image.id).filter((id): id is string => Boolean(id));
  if (imageIds.length > 0) {
    await c.env.DB.prepare(
      `UPDATE image_objects
       SET deleted_at = ?1
       WHERE id IN (${imageIds.map((_, index) => `?${index + 2}`).join(",")})
         AND owner_user_id = ?${imageIds.length + 2}`
    )
      .bind(now(), ...imageIds, session.userId)
      .run();
  }
  await audit(c.env, {
    actorId: c.get("user").id,
    action: "message.delete",
    targetType: "message",
    targetId: c.req.param("messageId")
  });
  return c.json({ ok: true });
});

/**
 * 用户「历史」只读 API：挂载在 `/api/history/*`，与会话 CRUD 分离；列表为复杂 SQL（任务数、封面图、搜索标题/正文 prompt）。
 */
export const historyRoutes = new Hono<AppEnv>();

// ---------- 历史列表：分页、标题/prompt 搜索、多子查询聚合（任务数、请求张数、实落库图、封面、进行状态）----------
historyRoutes.get("/", requireAuth, async (c) => {
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

// ---------- 历史详情：与侧栏消息接口类似，全量正序 200 条，合并 D1 持久化图与 reference ----------
historyRoutes.get("/:id", requireAuth, async (c) => {
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
    uniqueReferenceImageIds(rows.results),
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

type TaskParamsWithReferences = {
  referenceImageIds?: string[];
  [key: string]: unknown;
};

/** 工作台消息页：本页行里出现的参考图 id 去重，用于 `loadReferenceImagesById` 一次批量查 */
function uniqueSessionMessageReferenceImageIds(
  rows: Array<{ referenceImageIds: string }>
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of parseJson<string[]>(row.referenceImageIds, [])) ids.add(id);
  }
  return [...ids];
}

/** 历史详情：消息行上 `reference_image_ids` 与 `task_params` 内双来源合并去重 */
function uniqueReferenceImageIds(
  rows: Array<{ reference_image_ids: string; task_params: string | null }>
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of parseJson<string[]>(row.reference_image_ids, [])) ids.add(id);
    const taskReferenceImageIds =
      parseJson<TaskParamsWithReferences>(row.task_params, {}).referenceImageIds ?? [];
    for (const id of taskReferenceImageIds) {
      ids.add(id);
    }
  }
  return [...ids];
}

/** 从 `image_objects` 拉元数据（需 owner 匹配）；返回 Map 供按 id 顺序展开 */
async function loadReferenceImagesById(
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

/** 按 `imageIds` 顺序从 Map 取图并写入当前 message 的上下文字段 */
function referenceImagesForIds(
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

/**
 * 历史详情：本会话下所有**非参考**图按 `tasks.message_id` 归到各消息（JSON 可能滞后于 D1）
 */
async function loadPersistedGeneratedImagesByMessageId(
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

/** 以 messages.attachments JSON 为主序，把 D1 多出的 `persistedImages` 追加在末尾不重复 */
function mergePersistedGeneratedImages(
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

/** 补齐 url/mime/外键，与前台 `ImageAttachment` 展示一致 */
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
