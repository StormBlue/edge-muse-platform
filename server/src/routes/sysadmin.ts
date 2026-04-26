import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { messages, providerKeys, providers, quotas, userProviderKeys, users } from "../db/schema";
import { generatedEmailForUserId, normalizeOptionalEmail } from "../lib/account";
import { audit } from "../lib/audit";
import { decryptString, encryptString } from "../lib/crypto";
import { appError } from "../lib/errors";
import { newId, now } from "../lib/id";
import { parseJson, stringifyJson } from "../lib/json";
import { hashPassword } from "../lib/password";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { getProvider } from "../providers/registry";
import type { AppEnv } from "../types";

export const sysadminRoutes = new Hono<AppEnv>();

sysadminRoutes.use("*", requireAuth, requireRole("sysadmin"));

type AuditImageAttachment = {
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
  createdAt?: number | null;
  generationDurationMs?: number | null;
  generationIndex?: number | null;
};

type AuditGenerationFailure = {
  index: number;
  code: string;
  message: string;
  phase?: string | null;
  createdAt?: number | null;
};

const providerSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  defaultModel: z.string().min(1).default("gpt-image-2"),
  requestFormat: z.string().default("openai_compatible"),
  supportedSizes: z.array(z.string()).default(["1024x1024", "1024x1536", "1536x1024", "auto"]),
  enabled: z.boolean().default(true)
});

sysadminRoutes.get("/providers", async (c) => {
  const rows = await getDb(c.env)
    .select()
    .from(providers)
    .where(isNull(providers.deletedAt))
    .orderBy(desc(providers.createdAt));
  return c.json({
    items: rows.map((row) => ({ ...row, supportedSizes: parseJson(row.supportedSizes, []) }))
  });
});

sysadminRoutes.post("/providers", zValidator("json", providerSchema), async (c) => {
  const body = c.req.valid("json");
  const id = newId("prv");
  const timestamp = now();
  await getDb(c.env)
    .insert(providers)
    .values({
      id,
      name: body.name,
      baseUrl: body.baseUrl,
      defaultModel: body.defaultModel,
      requestFormat: body.requestFormat,
      supportedSizes: stringifyJson(body.supportedSizes),
      enabled: body.enabled,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  await audit(c.env, {
    actorId: c.get("user").id,
    action: "sys.provider_create",
    targetType: "provider",
    targetId: id
  });
  return c.json({ id }, 201);
});

sysadminRoutes.patch("/providers/:id", zValidator("json", providerSchema.partial()), async (c) => {
  const body = c.req.valid("json");
  await getDb(c.env)
    .update(providers)
    .set({
      ...body,
      supportedSizes: body.supportedSizes ? stringifyJson(body.supportedSizes) : undefined,
      updatedAt: now()
    })
    .where(eq(providers.id, c.req.param("id")));
  await audit(c.env, {
    actorId: c.get("user").id,
    action: "sys.provider_update",
    targetType: "provider",
    targetId: c.req.param("id"),
    payload: body
  });
  return c.json({ ok: true });
});

sysadminRoutes.delete("/providers/:id", async (c) => {
  const providerId = c.req.param("id");
  const timestamp = now();
  await getDb(c.env)
    .update(providerKeys)
    .set({ enabled: false, updatedAt: timestamp, deletedAt: timestamp })
    .where(eq(providerKeys.providerId, providerId));
  await getDb(c.env)
    .update(providers)
    .set({ enabled: false, updatedAt: timestamp, deletedAt: timestamp })
    .where(eq(providers.id, providerId));
  await audit(c.env, {
    actorId: c.get("user").id,
    action: "sys.provider_delete",
    targetType: "provider",
    targetId: providerId
  });
  return c.json({ ok: true });
});

sysadminRoutes.post("/providers/:id/test", async (c) => {
  const provider = await getDb(c.env).query.providers.findFirst({
    where: eq(providers.id, c.req.param("id"))
  });
  if (!provider) throw appError("NOT_FOUND", "Provider not found");
  return c.json({ ok: provider.baseUrl === "mock:" });
});

const keySchema = z.object({
  providerId: z.string(),
  label: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  allocatedQuota: z.number().int().min(0).nullable().optional(),
  ownerAdminId: z.string().nullable().optional(),
  enabled: z.boolean().default(true)
});

const optionalEmailSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}, z.string().email().optional());

const usernameSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value.trim();
}, z.string().min(1).max(40));

sysadminRoutes.get("/provider-keys", async (c) => {
  const rows = await getDb(c.env)
    .select()
    .from(providerKeys)
    .where(isNull(providerKeys.deletedAt))
    .orderBy(desc(providerKeys.createdAt));
  return c.json({
    items: rows.map(({ encryptedKey: _encryptedKey, ...row }) => row)
  });
});

sysadminRoutes.post("/provider-keys", zValidator("json", keySchema), async (c) => {
  const body = c.req.valid("json");
  const id = newId("key");
  const timestamp = now();
  await getDb(c.env)
    .insert(providerKeys)
    .values({
      id,
      providerId: body.providerId,
      label: body.label,
      model: body.model,
      encryptedKey: await encryptString(body.apiKey, c.env.KEY_ENCRYPTION_KEY),
      keyHint: body.apiKey.slice(-4),
      allocatedQuota: body.allocatedQuota ?? null,
      usedQuota: 0,
      ownerAdminId: body.ownerAdminId ?? null,
      enabled: body.enabled,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  if (body.ownerAdminId) {
    await getDb(c.env).insert(userProviderKeys).values({
      userId: body.ownerAdminId,
      providerKeyId: id,
      assignedAt: timestamp
    });
  }
  await audit(c.env, {
    actorId: c.get("user").id,
    action: "sys.key_create",
    targetType: "provider_key",
    targetId: id
  });
  return c.json({ id, keyHint: body.apiKey.slice(-4) }, 201);
});

sysadminRoutes.patch(
  "/provider-keys/:id",
  zValidator(
    "json",
    z.object({
      providerId: z.string().optional(),
      label: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      apiKey: z.string().min(1).optional(),
      allocatedQuota: z.number().int().min(0).nullable().optional(),
      ownerAdminId: z.string().nullable().optional(),
      enabled: z.boolean().optional()
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const { apiKey, ...patchBody } = body;
    const patch = {
      ...patchBody,
      ...(apiKey
        ? {
            encryptedKey: await encryptString(apiKey, c.env.KEY_ENCRYPTION_KEY),
            keyHint: apiKey.slice(-4)
          }
        : {}),
      updatedAt: now()
    };
    await getDb(c.env)
      .update(providerKeys)
      .set(patch)
      .where(eq(providerKeys.id, c.req.param("id")));
    if (body.ownerAdminId) {
      await c.env.DB.prepare(
        `INSERT INTO user_provider_keys (user_id, provider_key_id, assigned_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(user_id) DO UPDATE SET provider_key_id = ?2, assigned_at = ?3`
      )
        .bind(body.ownerAdminId, c.req.param("id"), now())
        .run();
    }
    await audit(c.env, {
      actorId: c.get("user").id,
      action: "sys.key_update",
      targetType: "provider_key",
      targetId: c.req.param("id"),
      payload: patchBody
    });
    return c.json({ ok: true });
  }
);

sysadminRoutes.delete("/provider-keys/:id", async (c) => {
  const timestamp = now();
  await getDb(c.env)
    .update(providerKeys)
    .set({ enabled: false, updatedAt: timestamp, deletedAt: timestamp })
    .where(eq(providerKeys.id, c.req.param("id")));
  await audit(c.env, {
    actorId: c.get("user").id,
    action: "sys.key_delete",
    targetType: "provider_key",
    targetId: c.req.param("id")
  });
  return c.json({ ok: true });
});

sysadminRoutes.post("/provider-keys/:id/test", async (c) => {
  const key = await getDb(c.env).query.providerKeys.findFirst({
    where: and(eq(providerKeys.id, c.req.param("id")), isNull(providerKeys.deletedAt))
  });
  if (!key) throw appError("NOT_FOUND", "Provider key not found");
  const provider = await getDb(c.env).query.providers.findFirst({
    where: and(eq(providers.id, key.providerId), isNull(providers.deletedAt))
  });
  if (!provider) throw appError("NOT_FOUND", "Provider not found");
  if (provider.baseUrl === "mock:") return c.json({ ok: true });
  const apiKey = await decryptString(key.encryptedKey, c.env.KEY_ENCRYPTION_KEY);
  const ok = await getProvider(provider.requestFormat).health({
    apiKey,
    baseUrl: provider.baseUrl,
    model: key.model ?? provider.defaultModel
  });
  return c.json({ ok });
});

sysadminRoutes.post(
  "/admins",
  zValidator(
    "json",
    z.object({
      email: optionalEmailSchema,
      username: usernameSchema,
      password: z.string().min(8),
      nickname: z.string().min(1),
      providerKeyId: z.string().min(1),
      quota: z.number().int().min(0).nullable()
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const email = normalizeOptionalEmail(body.email);
    const existing = await getDb(c.env).query.users.findFirst({
      where: email
        ? or(eq(users.email, email), eq(users.username, body.username))
        : eq(users.username, body.username)
    });
    if (existing) throw appError("VALIDATION_ERROR", "Username or email already exists");

    const providerKey = await getDb(c.env).query.providerKeys.findFirst({
      where: and(
        eq(providerKeys.id, body.providerKeyId),
        eq(providerKeys.enabled, true),
        isNull(providerKeys.deletedAt)
      )
    });
    if (!providerKey) throw appError("NOT_FOUND", "Provider key not found");

    const id = newId("adm");
    const timestamp = now();
    await getDb(c.env)
      .insert(users)
      .values({
        id,
        email: email ?? generatedEmailForUserId(id),
        username: body.username,
        passwordHash: await hashPassword(body.password),
        nickname: body.nickname,
        role: "admin",
        createdBy: c.get("user").id,
        preferredProviderKeyId: body.providerKeyId,
        locale: "zh-CN",
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLoginAt: null
      });
    await getDb(c.env).insert(quotas).values({
      userId: id,
      allocatedQuota: body.quota,
      usedQuota: 0,
      updatedAt: timestamp
    });
    await getDb(c.env).insert(userProviderKeys).values({
      userId: id,
      providerKeyId: body.providerKeyId,
      assignedAt: timestamp
    });
    return c.json({ id }, 201);
  }
);

sysadminRoutes.get("/admins", async (c) => {
  const rows = await getDb(c.env)
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      nickname: users.nickname,
      status: users.status,
      preferredProviderKeyId: users.preferredProviderKeyId,
      allocatedQuota: quotas.allocatedQuota,
      usedQuota: quotas.usedQuota,
      providerKeyId: userProviderKeys.providerKeyId
    })
    .from(users)
    .leftJoin(quotas, eq(quotas.userId, users.id))
    .leftJoin(userProviderKeys, eq(userProviderKeys.userId, users.id))
    .where(eq(users.role, "admin"))
    .orderBy(desc(users.createdAt));
  return c.json({ items: rows });
});

sysadminRoutes.patch(
  "/admins/:id",
  zValidator(
    "json",
    z.object({
      nickname: z.string().min(1).optional(),
      status: z.enum(["active", "disabled"]).optional(),
      providerKeyId: z.string().min(1).optional(),
      quota: z.number().int().min(0).nullable().optional(),
      password: z.string().min(8).optional()
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const adminId = c.req.param("id");
    const timestamp = now();
    const admin = await getDb(c.env).query.users.findFirst({ where: eq(users.id, adminId) });
    if (!admin || admin.role !== "admin") throw appError("NOT_FOUND", "Admin not found");
    let changedProviderKeyId: string | null = null;
    if (body.providerKeyId !== undefined && body.providerKeyId !== admin.preferredProviderKeyId) {
      const providerKey = await getDb(c.env).query.providerKeys.findFirst({
        where: and(
          eq(providerKeys.id, body.providerKeyId),
          eq(providerKeys.enabled, true),
          isNull(providerKeys.deletedAt)
        )
      });
      if (!providerKey) throw appError("NOT_FOUND", "Provider key not found");
      changedProviderKeyId = body.providerKeyId;
    }
    const userUpdate: {
      nickname?: string;
      status?: "active" | "disabled";
      preferredProviderKeyId?: string;
      passwordHash?: string;
      updatedAt: number;
    } = { updatedAt: timestamp };
    if (body.nickname !== undefined) userUpdate.nickname = body.nickname;
    if (body.status !== undefined) userUpdate.status = body.status;
    if (changedProviderKeyId) userUpdate.preferredProviderKeyId = changedProviderKeyId;
    if (body.password !== undefined) userUpdate.passwordHash = await hashPassword(body.password);
    if (Object.keys(userUpdate).length > 1) {
      await getDb(c.env).update(users).set(userUpdate).where(eq(users.id, adminId));
    }
    if ("quota" in body) {
      await c.env.DB.prepare(
        `INSERT INTO quotas (user_id, allocated_quota, used_quota, updated_at)
         VALUES (?1, ?2, 0, ?3)
         ON CONFLICT(user_id) DO UPDATE SET allocated_quota = ?2, updated_at = ?3`
      )
        .bind(adminId, body.quota ?? null, timestamp)
        .run();
    }
    if (changedProviderKeyId) {
      const managed = await getDb(c.env)
        .select({ id: users.id })
        .from(users)
        .where(sql`${users.id} = ${adminId} OR ${users.createdBy} = ${adminId}`);
      for (const row of managed) {
        await c.env.DB.prepare(
          `INSERT INTO user_provider_keys (user_id, provider_key_id, assigned_at)
           VALUES (?1, ?2, ?3)
           ON CONFLICT(user_id) DO UPDATE SET provider_key_id = ?2, assigned_at = ?3`
        )
          .bind(row.id, changedProviderKeyId, timestamp)
          .run();
      }
      await getDb(c.env)
        .update(providerKeys)
        .set({ ownerAdminId: adminId, updatedAt: timestamp })
        .where(eq(providerKeys.id, changedProviderKeyId));
    }
    await audit(c.env, {
      actorId: c.get("user").id,
      action: "sys.admin_update",
      targetType: "user",
      targetId: adminId,
      payload: { ...body, password: undefined, passwordReset: Boolean(body.password) }
    });
    return c.json({ ok: true });
  }
);

sysadminRoutes.get("/dashboard/stats", async (c) => {
  const cached = await c.env.KV.get("dashboard:stats");
  if (cached) return c.json(JSON.parse(cached));
  const userCounts = await c.env.DB.prepare(
    "SELECT role, COUNT(*) count FROM users GROUP BY role"
  ).all();
  const taskCounts = await c.env.DB.prepare(
    "SELECT status, COUNT(*) count FROM tasks GROUP BY status"
  ).all();
  const trend = await c.env.DB.prepare(
    `SELECT CAST((queued_at / 86400000) AS INTEGER) day, COUNT(*) count
     FROM tasks
     WHERE queued_at > ?1
     GROUP BY day
     ORDER BY day`
  )
    .bind(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .all();
  const topUsers = await c.env.DB.prepare(
    `SELECT users.id, users.email, users.nickname, COUNT(tasks.id) task_count
     FROM users
     LEFT JOIN tasks ON tasks.user_id = users.id
     GROUP BY users.id
     ORDER BY task_count DESC
     LIMIT 10`
  ).all();
  const providerCounts = await c.env.DB.prepare(
    `SELECT providers.name, COUNT(tasks.id) count
     FROM tasks
     LEFT JOIN provider_keys ON provider_keys.id = tasks.provider_key_id
     LEFT JOIN providers ON providers.id = provider_keys.provider_id
     GROUP BY providers.id
     ORDER BY count DESC`
  ).all();
  const body = {
    userCounts: userCounts.results,
    taskCounts: taskCounts.results,
    trend: trend.results,
    topUsers: topUsers.results,
    providerCounts: providerCounts.results
  };
  await c.env.KV.put("dashboard:stats", JSON.stringify(body), { expirationTtl: 60 });
  return c.json(body);
});

sysadminRoutes.get("/users", async (c) => {
  const q = c.req.query("q")?.trim();
  const hasUsername = await hasColumn(c.env, "users", "username");
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    binds.push(`%${q}%`);
    const searchIndex = binds.length;
    conditions.push(
      hasUsername
        ? `(email LIKE ?${searchIndex} OR username LIKE ?${searchIndex} OR nickname LIKE ?${searchIndex})`
        : `(email LIKE ?${searchIndex} OR nickname LIKE ?${searchIndex} OR id LIKE ?${searchIndex})`
    );
  }
  const statement = c.env.DB.prepare(
    `SELECT id,
       email,
       ${hasUsername ? "username" : "NULL"} AS username,
       nickname,
       role,
       status
     FROM users
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT 200`
  );
  const rows = binds.length
    ? await statement.bind(...binds).all<{
        id: string;
        email: string | null;
        username: string | null;
        nickname: string | null;
        role: "sysadmin" | "admin" | "user";
        status: "active" | "disabled";
      }>()
    : await statement.all<{
        id: string;
        email: string | null;
        username: string | null;
        nickname: string | null;
        role: "sysadmin" | "admin" | "user";
        status: "active" | "disabled";
      }>();
  return c.json({ items: rows.results });
});

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
  const conditions = ["sessions.deleted_at IS NULL"];
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
       COUNT(tasks.id) AS task_count
     FROM sessions
     LEFT JOIN users ON users.id = sessions.user_id
     LEFT JOIN tasks ON tasks.session_id = sessions.id
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
      taskCount: row.task_count
    })),
    page,
    pageSize,
    total
  });
});

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

async function loadAuditGeneratedImagesByMessageId(
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

function mergeAuditGeneratedImages(
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

function extractAuditGenerationFailures(
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

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function hasColumn(env: Cloudflare.Env, table: string, column: string): Promise<boolean> {
  const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return rows.results.some((row) => row.name === column);
}

sysadminRoutes.patch(
  "/preferences",
  zValidator("json", z.object({ preferredProviderKeyId: z.string() })),
  async (c) => {
    await getDb(c.env)
      .update(users)
      .set({ preferredProviderKeyId: c.req.valid("json").preferredProviderKeyId, updatedAt: now() })
      .where(eq(users.id, c.get("user").id));
    return c.json({ ok: true });
  }
);
