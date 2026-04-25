import { and, desc, eq, isNull, like, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { messages, sessions } from "../db/schema";
import { assertSessionAccess } from "../lib/access";
import { audit } from "../lib/audit";
import { newId, now } from "../lib/id";
import { parseJson, stringifyJson } from "../lib/json";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const modeSchema = z.enum(["text2image", "image2image", "chat"]);
const settingsSchema = z.object({
  size: z.string().default("1024x1024"),
  n: z.number().int().min(1).max(4).default(1),
  model: z.string().optional()
});

export const sessionRoutes = new Hono<AppEnv>();

sessionRoutes.use("*", requireAuth);

sessionRoutes.post(
  "/",
  zValidator(
    "json",
    z.object({
      title: z.string().min(1).max(80).optional(),
      mode: modeSchema.default("text2image"),
      settings: settingsSchema.default({ size: "1024x1024", n: 1 })
    })
  ),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const id = newId("ses");
    const timestamp = now();
    await getDb(c.env)
      .insert(sessions)
      .values({
        id,
        userId: user.id,
        title: body.title ?? "New session",
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
    return c.json({ session: { id, ...body, createdAt: timestamp, updatedAt: timestamp } }, 201);
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
    nextCursor: rows.length > limit ? rows[limit].lastMessageAt : null
  });
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
      title: z.string().min(1).max(80).optional(),
      settings: settingsSchema.optional(),
      archived: z.boolean().optional()
    })
  ),
  async (c) => {
    const session = await assertSessionAccess(c.env, c.req.param("id"), c.get("user"));
    const body = c.req.valid("json");
    const patch = {
      ...(body.title ? { title: body.title } : {}),
      ...(body.settings ? { settings: stringifyJson(body.settings) } : {}),
      ...(body.archived !== undefined ? { archived: body.archived } : {}),
      updatedAt: now()
    };
    await getDb(c.env).update(sessions).set(patch).where(eq(sessions.id, session.id));
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
        WHERE m.session_id = sessions.id AND m.prompt LIKE ?${searchIndex}
      ))`
    );
  }
  const orderSql =
    order === "oldest"
      ? "sessions.created_at ASC"
      : order === "task_count"
        ? "task_count DESC, sessions.last_message_at DESC"
        : "sessions.last_message_at DESC";
  const rows = await c.env.DB.prepare(
    `SELECT sessions.*, COUNT(tasks.id) AS task_count
     FROM sessions
     LEFT JOIN tasks ON tasks.session_id = sessions.id
     WHERE ${conditions.join(" AND ")}
     GROUP BY sessions.id
     ORDER BY ${orderSql}
     LIMIT 100`
  )
    .bind(...binds)
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
    }>();
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
      taskCount: row.task_count
    }))
  });
});
