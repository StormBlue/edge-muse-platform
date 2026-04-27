import { and, desc, eq, isNull, like, lt } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/client";
import { sessions, tasks } from "../../db/schema";
import { assertSessionAccess } from "../../lib/access";
import { audit } from "../../lib/audit";
import { appError } from "../../lib/errors";
import { assertImageCountAllowed, isSingleActiveGenerationRole } from "../../lib/generationPolicy";
import { newId, now } from "../../lib/id";
import { parseJson, stringifyJson } from "../../lib/json";
import { defaultSessionTitle } from "../../lib/sessionTitle";
import { findActiveGenerationTaskForUser } from "../../lib/tasks";
import { modeSchema, settingsSchema, type SessionRouter } from "./common";

export function registerSessionCrudRoutes(sessionRoutes: SessionRouter) {
  // POST /api/sessions：新建会话行，标题缺省用 `defaultSessionTitle`。
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

  // GET /api/sessions：侧栏列表，按 lastMessageAt 倒序。
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
      // `nextCursor` 取多拉出的那条（更旧）的 lastMessageAt，前端继续向历史方向分页。
      nextCursor: rows.length > limit ? rows[limit - 1].lastMessageAt : null
    });
  });

  // 非 sysadmin：单活跃生图，用于刷新后恢复 UI/WS；sysadmin/多任务策略返回 `{ active: null }`。
  sessionRoutes.get("/active-generation", async (c) => {
    const user = c.get("user");
    if (!isSingleActiveGenerationRole(user.role)) return c.json({ active: null });
    const active = await findActiveGenerationTaskForUser(c.env, user.id);
    return c.json({ active });
  });

  // GET /api/sessions/:id：单条元数据，settings 从 JSON 字符串解析。
  sessionRoutes.get("/:id", async (c) => {
    const session = await assertSessionAccess(c.env, c.req.param("id"), c.get("user"));
    return c.json({ session: { ...session, settings: parseJson(session.settings, {}) } });
  });

  // PATCH：有任务后锁标题（防与首条生成摘要不一致）；settings.n 受角色策略约束。
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
        // 已产生过任务则不允许改会话标题，避免与消息流展示不一致。
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

  // 软删：写 deletedAt，列表与消息查询均过滤。
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
}
