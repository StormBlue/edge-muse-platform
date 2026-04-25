import { and, desc, eq, isNull, like, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { messages, sessions, tasks } from "../db/schema";
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
const settingsSchema = z.object({
  size: z.string().default("1024x1024"),
  n: z.number().int().min(1).max(MAX_SYSADMIN_IMAGE_COUNT).default(1),
  model: z.string().optional()
});

export const sessionRoutes = new Hono<AppEnv>();

sessionRoutes.use("*", requireAuth);

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

sessionRoutes.get("/", async (c) => {
  const user = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") ?? "20"), 50);
  const cursor = Number(c.req.query("cursor") ?? "0");
  const q = c.req.query("q");
  const where = and(
    user.role === "sysadmin" ? undefined : eq(sessions.userId, user.id),
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
    nextCursor: rows.length > limit ? rows[limit - 1].lastMessageAt : null
  });
});

sessionRoutes.get("/active-generation", async (c) => {
  const user = c.get("user");
  if (!isSingleActiveGenerationRole(user.role)) return c.json({ active: null });
  const active = await findActiveGenerationTaskForUser(c.env, user.id);
  return c.json({ active });
});

sessionRoutes.get("/:id", async (c) => {
  const session = await assertSessionAccess(c.env, c.req.param("id"), c.get("user"));
  return c.json({ session: { ...session, settings: parseJson(session.settings, {}) } });
});

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

sessionRoutes.get("/:id/messages", async (c) => {
  const session = await assertSessionAccess(c.env, c.req.param("id"), c.get("user"));
  const limit = Math.min(Number(c.req.query("limit") ?? "20"), 50);
  const cursor = Number(c.req.query("cursor") ?? "0");
  const rows = await getDb(c.env)
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.sessionId, session.id),
        isNull(messages.deletedAt),
        cursor ? lt(messages.createdAt, cursor) : undefined
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
  return c.json({
    items: rows
      .slice(0, limit)
      .reverse()
      .map((row) => ({
        ...row,
        referenceImageIds: parseJson(row.referenceImageIds, []),
        attachments: parseJson(row.attachments, [])
      })),
    nextCursor: rows.length > limit ? rows[limit].createdAt : null
  });
});

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

export const historyRoutes = new Hono<AppEnv>();

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
  const binds: unknown[] = [];
  if (user.role !== "sysadmin") {
    binds.push(user.id);
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
      task_queued_at: number | null;
      task_started_at: number | null;
      task_finished_at: number | null;
    }>();
  const persistedImagesByMessageId = await loadPersistedGeneratedImagesByMessageId(
    c.env,
    session.id
  );
  const taskCount = rows.results.filter((row) => row.task_id).length;
  return c.json({
    session: {
      ...session,
      settings: parseJson(session.settings, {}),
      taskCount
    },
    messages: rows.results.map((row) => {
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
        referenceImageIds: parseJson(row.reference_image_ids, []),
        attachments,
        taskId: row.task_id,
        status: row.status,
        createdAt: row.created_at,
        task: row.task_id
          ? {
              id: row.task_id,
              mode: row.task_mode,
              params: parseJson(row.task_params, {}),
              status: row.task_status,
              queuedAt: row.task_queued_at,
              startedAt: row.task_started_at,
              finishedAt: row.task_finished_at
            }
          : null
      };
    })
  });
});

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
