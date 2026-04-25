import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import {
  messages,
  providerKeys,
  providers,
  quotas,
  sessions,
  userProviderKeys,
  users
} from "../db/schema";
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

const providerSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  defaultModel: z.string().min(1).default("gpt-image-2"),
  requestFormat: z.string().default("openai_compatible"),
  supportedSizes: z.array(z.string()).default(["1024x1024", "1024x1536", "1536x1024", "auto"]),
  enabled: z.boolean().default(true)
});

sysadminRoutes.get("/providers", async (c) => {
  const rows = await getDb(c.env).select().from(providers).orderBy(desc(providers.createdAt));
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
  const key = await getDb(c.env).query.providerKeys.findFirst({
    where: eq(providerKeys.providerId, c.req.param("id"))
  });
  if (key) throw appError("VALIDATION_ERROR", "Provider has keys");
  await getDb(c.env)
    .delete(providers)
    .where(eq(providers.id, c.req.param("id")));
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
  apiKey: z.string().min(1),
  allocatedQuota: z.number().int().min(0).nullable().optional(),
  ownerAdminId: z.string().nullable().optional(),
  enabled: z.boolean().default(true)
});

sysadminRoutes.get("/provider-keys", async (c) => {
  const rows = await getDb(c.env).select().from(providerKeys).orderBy(desc(providerKeys.createdAt));
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
      label: z.string().min(1).optional(),
      allocatedQuota: z.number().int().min(0).nullable().optional(),
      ownerAdminId: z.string().nullable().optional(),
      enabled: z.boolean().optional()
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    await getDb(c.env)
      .update(providerKeys)
      .set({ ...body, updatedAt: now() })
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
    return c.json({ ok: true });
  }
);

sysadminRoutes.delete("/provider-keys/:id", async (c) => {
  await getDb(c.env)
    .update(providerKeys)
    .set({ enabled: false, updatedAt: now() })
    .where(eq(providerKeys.id, c.req.param("id")));
  return c.json({ ok: true });
});

sysadminRoutes.post("/provider-keys/:id/test", async (c) => {
  const key = await getDb(c.env).query.providerKeys.findFirst({
    where: eq(providerKeys.id, c.req.param("id"))
  });
  if (!key) throw appError("NOT_FOUND", "Provider key not found");
  const provider = await getDb(c.env).query.providers.findFirst({
    where: eq(providers.id, key.providerId)
  });
  if (!provider) throw appError("NOT_FOUND", "Provider not found");
  if (provider.baseUrl === "mock:") return c.json({ ok: true });
  const apiKey = await decryptString(key.encryptedKey, c.env.KEY_ENCRYPTION_KEY);
  const ok = await getProvider(provider.requestFormat).health({
    apiKey,
    baseUrl: provider.baseUrl,
    model: provider.defaultModel
  });
  return c.json({ ok });
});

sysadminRoutes.post(
  "/admins",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      nickname: z.string().min(1),
      providerKeyId: z.string(),
      quota: z.number().int().min(0).nullable()
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const id = newId("adm");
    const timestamp = now();
    await getDb(c.env)
      .insert(users)
      .values({
        id,
        email: body.email.toLowerCase(),
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
  const body = {
    userCounts: userCounts.results,
    taskCounts: taskCounts.results,
    trend: trend.results,
    topUsers: topUsers.results
  };
  await c.env.KV.put("dashboard:stats", JSON.stringify(body), { expirationTtl: 60 });
  return c.json(body);
});

sysadminRoutes.get("/users/:id/sessions", async (c) => {
  const rows = await getDb(c.env)
    .select()
    .from(sessions)
    .where(eq(sessions.userId, c.req.param("id")))
    .orderBy(desc(sessions.lastMessageAt));
  return c.json({ items: rows.map((row) => ({ ...row, settings: parseJson(row.settings, {}) })) });
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
