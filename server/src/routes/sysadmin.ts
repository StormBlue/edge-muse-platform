/**
 * 系统管理员 API（`/api/sysadmin/*`）：
 * - 全路由 `requireAuth` + `requireRole("sysadmin")`，可跨租户读配置、任意用户数据（巡查）；
 * - 含 providers/keys、platform admins、dashboard、用户列表与按 user 的 sessions 详情、全局 preferences 等；
 * - 密钥与敏感字段经 `encryptString`/`decryptString`，审计记 `audit(..., action: sys.*)`。
 */
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import {
  imageObjects,
  messages,
  providerKeys,
  providers,
  quotas,
  userProviderKeys,
  users
} from "../db/schema";
import { generatedEmailForUserId, normalizeOptionalEmail } from "../lib/account";
import { audit } from "../lib/audit";
import { decryptString, encryptString } from "../lib/crypto";
import { appError } from "../lib/errors";
import { newId, now } from "../lib/id";
import { parseJson, stringifyJson } from "../lib/json";
import { hashPassword } from "../lib/password";
import { assertAssignableProviderKey, getAssignableProviderKey } from "../lib/providerKeys";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import {
  ensureBuiltInProviders,
  isBuiltInProviderId,
  isProviderKeyAssignable,
  PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS
} from "../providers/catalog";
import { getProvider } from "../providers/registry";
import type { AppEnv } from "../types";

export const sysadminRoutes = new Hono<AppEnv>();

// 仅 sysadmin；与 admin 路由组（租户管理员）权限模型不同
sysadminRoutes.use("*", requireAuth, requireRole("sysadmin"));

/** 巡查接口返回的附件形状：比前台多生成耗时、第几张等排障字段 */
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
type AuditReferenceImage = AuditImageAttachment;

/** 多图部分失败时聚合到消息 task 上 */
type AuditGenerationFailure = {
  index: number;
  code: string;
  message: string;
  phase?: string | null;
  createdAt?: number | null;
};

/** 创建/全量更新 provider 时的校验体；`requestFormat` 与 registry 里实现名对应 */
const providerSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  defaultModel: z.string().min(1).default("gpt-image-2"),
  requestFormat: z.string().default("openai_compatible"),
  supportedSizes: z.array(z.string()).default(["1024x1024", "1024x1536", "1536x1024", "auto"]),
  enabled: z.boolean().default(true)
});

// ---------- 上游 Provider 定义（baseUrl、adapter、默认模型、软删）----------
// 列表：未软删的 provider，时间倒序
sysadminRoutes.get("/providers", async (c) => {
  await ensureBuiltInProviders(c.env);
  const rows = await getDb(c.env)
    .select()
    .from(providers)
    .where(isNull(providers.deletedAt))
    .orderBy(desc(providers.createdAt));
  return c.json({
    items: rows.map((row) => ({
      ...row,
      builtIn: isBuiltInProviderId(row.id),
      supportedSizes: parseJson(row.supportedSizes, [])
    }))
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

// 部分更新；supportedSizes 为数组时在 PATCH 体里需整体替换，由 zod partial 控制
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

// 软删：下属密钥一并 disabled+deleted，避免仍指向已弃用上游
sysadminRoutes.delete("/providers/:id", async (c) => {
  const providerId = c.req.param("id");
  // 内置 provider 是密钥页的固定可选项，只允许改绑/停用 key，不允许删除元数据本身。
  if (isBuiltInProviderId(providerId)) {
    throw appError("VALIDATION_ERROR", "Built-in provider cannot be deleted");
  }
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

/** 连通性烟测：当前实现仅 `baseUrl === "mock:"` 视为可本地假跑 */
sysadminRoutes.post("/providers/:id/test", async (c) => {
  const provider = await getDb(c.env).query.providers.findFirst({
    where: eq(providers.id, c.req.param("id"))
  });
  if (!provider) throw appError("NOT_FOUND", "Provider not found");
  return c.json({ ok: provider.baseUrl === "mock:" });
});

// ---------- Provider 密钥 CRUD / 连通性（加密存 `encrypted_key`，列表不返回密文） ----------
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

/** 偏好 key 可清空；非空时必须是当前产品允许分配的 provider key。 */
const optionalPreferredProviderKeySchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}, z.string().min(1).nullable());

sysadminRoutes.get("/provider-keys", async (c) => {
  const includeUnsupported = c.req.query("includeUnsupported") === "1";
  const rows = await getDb(c.env)
    .select()
    .from(providerKeys)
    .where(
      and(
        isNull(providerKeys.deletedAt),
        includeUnsupported
          ? undefined
          : inArray(providerKeys.providerId, PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS)
      )
    )
    .orderBy(desc(providerKeys.createdAt));
  return c.json({
    items: rows.map(({ encryptedKey: _encryptedKey, ...row }) => row)
  });
});

sysadminRoutes.post("/provider-keys", zValidator("json", keySchema), async (c) => {
  await ensureBuiltInProviders(c.env);
  const body = c.req.valid("json");
  // 服务商页面已下线，新密钥只能归属产品明确支持的内置服务商，避免旧 provider 被继续扩散使用。
  if (!isProviderKeyAssignable(body.providerId)) {
    throw appError("VALIDATION_ERROR", "Unsupported provider");
  }
  const provider = await getDb(c.env).query.providers.findFirst({
    where: and(
      eq(providers.id, body.providerId),
      eq(providers.enabled, true),
      isNull(providers.deletedAt)
    )
  });
  if (!provider) throw appError("NOT_FOUND", "Provider not found");
  const id = newId("key");
  const timestamp = now();
  const keyInsert = {
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
    updatedAt: timestamp,
    deletedAt: null
  };
  if (body.ownerAdminId) {
    // 创建时若同步分配给 admin，也必须满足“可分配 key”的最终状态，避免禁用 key 被写入绑定表。
    assertAssignableProviderKey(keyInsert);
  }
  await getDb(c.env).insert(providerKeys).values(keyInsert);
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
    await ensureBuiltInProviders(c.env);
    const body = c.req.valid("json");
    const existingKey = await getDb(c.env).query.providerKeys.findFirst({
      where: and(eq(providerKeys.id, c.req.param("id")), isNull(providerKeys.deletedAt))
    });
    if (!existingKey) throw appError("NOT_FOUND", "Provider key not found");
    if (body.providerId !== undefined) {
      // 改绑密钥同样只能切到内置支持项；未传 providerId 时允许保留历史归属并编辑其它字段。
      if (!isProviderKeyAssignable(body.providerId)) {
        throw appError("VALIDATION_ERROR", "Unsupported provider");
      }
      const provider = await getDb(c.env).query.providers.findFirst({
        where: and(
          eq(providers.id, body.providerId),
          eq(providers.enabled, true),
          isNull(providers.deletedAt)
        )
      });
      if (!provider) throw appError("NOT_FOUND", "Provider not found");
    }
    if (body.ownerAdminId) {
      // 给 admin 绑定已有 key 时按补丁后的最终状态校验，禁止旧 provider key 或禁用 key 继续被分配。
      assertAssignableProviderKey({
        providerId: body.providerId ?? existingKey.providerId,
        enabled: body.enabled ?? existingKey.enabled,
        deletedAt: existingKey.deletedAt
      });
    }
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

// ---------- 租户管理员（role=admin）：开通、列表、改密钥/配额/密码；可级联更新其名下用户的 user_provider_keys ----------
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

    await getAssignableProviderKey(c.env, body.providerKeyId);

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
      await getAssignableProviderKey(c.env, body.providerKeyId);
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
      const managedUserIds = managed.map((row) => row.id);
      // `resolveProviderKey` 优先读取 users.preferredProviderKeyId，改绑管理员时必须同步子用户偏好。
      await getDb(c.env)
        .update(users)
        .set({ preferredProviderKeyId: changedProviderKeyId, updatedAt: timestamp })
        .where(inArray(users.id, managedUserIds));
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

// ---------- 运营看板：KV 缓存 60s，聚合用户角色数、任务状态数、30 日趋势、Top 用户、按 provider 任务量 ----------
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

// ---------- 全站用户搜索（限 200 条）：兼容无 username 列的旧库用 id 搜 ----------
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

// ---------- 按用户列会话（分页）：`id=me` 查当前 sysadmin 自己；`userId=_` 可查全站（条件配合 SQL）----------
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

// ---------- 单会话深度巡查：消息 + 关联 task + 附件与参考图合并、从 image_objects 补生成耗时 ----------
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

// ---------- 原始消息行（较少加工）：便于与 detail 接口对照排障 ----------
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

// ---------- 以下：巡查 API 专用辅助（合并 DB 里的 image_objects 与 messages.attachments JSON）----------

type TaskParamsWithReferences = {
  referenceImageIds?: string[];
  [key: string]: unknown;
};

/** 从消息行上的 `reference_image_ids` 与 task_params 里 referenceImageIds 并集去重 */
function uniqueAuditReferenceImageIds(
  rows: Array<{ reference_image_ids: string; task_params: string | null }>
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of parseJson<string[]>(row.reference_image_ids, [])) ids.add(id);
    const taskReferenceImageIds =
      parseJson<TaskParamsWithReferences>(row.task_params, {}).referenceImageIds ?? [];
    for (const id of taskReferenceImageIds) ids.add(id);
  }
  return [...ids];
}

/** 批量拉参考图元数据，供 `auditReferenceImagesForIds` 按消息顺序展开 */
async function loadAuditReferenceImagesById(
  env: AppEnv["Bindings"],
  imageIds: string[]
): Promise<Map<string, AuditReferenceImage>> {
  if (imageIds.length === 0) return new Map();
  const rows = await getDb(env)
    .select({
      id: imageObjects.id,
      mime: imageObjects.mime,
      width: imageObjects.width,
      height: imageObjects.height,
      byteSize: imageObjects.byteSize,
      taskId: imageObjects.taskId,
      sessionId: imageObjects.sessionId,
      createdAt: imageObjects.createdAt
    })
    .from(imageObjects)
    .where(and(inArray(imageObjects.id, imageIds), isNull(imageObjects.deletedAt)));
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
        sessionId: row.sessionId,
        createdAt: row.createdAt,
        generationDurationMs: null,
        generationIndex: null
      }
    ])
  );
}

/** 按 id 列表从 Map 取图并补上当前消息的 task/session/message 上下文 */
function auditReferenceImagesForIds(
  imagesById: Map<string, AuditReferenceImage>,
  imageIds: string[],
  context: {
    taskId?: string | null;
    sessionId: string;
    messageId: string;
    prompt?: string | null;
  }
): AuditReferenceImage[] {
  return imageIds
    .map((id) => imagesById.get(id))
    .filter((image): image is AuditReferenceImage => Boolean(image))
    .map((image) => ({
      ...image,
      taskId: image.taskId ?? context.taskId ?? null,
      sessionId: image.sessionId ?? context.sessionId,
      messageId: context.messageId,
      prompt: context.prompt ?? null
    }));
}

/**
 * 按会话扫 `image_objects`（非参考图），按 message_id 分组；
 * `durationCheckpointByTask`：同 task 多图时，后续图的「生成耗时」相对上一张完成时间戳。
 */
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

/** 以 messages.attachments 为主序合并 `persistedImages` 中多出的行（DB 可能比 JSON 新） */
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

/** 填空字段、统一 URL 与 messageId，保证巡查列表每行形状一致 */
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

/** 优先解析 `provider_raw_response` 里 type=generation_failure；否则从 error_msg 多行文本兜底拆条 */
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

/** 迁移期兼容：运行时 `PRAGMA table_info` 判断列是否存在，再拼动态 SQL */
async function hasColumn(env: Cloudflare.Env, table: string, column: string): Promise<boolean> {
  const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return rows.results.some((row) => row.name === column);
}

// ---------- 当前登录 sysadmin 个人偏好（如默认 provider key）----------
sysadminRoutes.patch(
  "/preferences",
  zValidator("json", z.object({ preferredProviderKeyId: optionalPreferredProviderKeySchema })),
  async (c) => {
    const preferredProviderKeyId = c.req.valid("json").preferredProviderKeyId;
    if (preferredProviderKeyId) {
      await getAssignableProviderKey(c.env, preferredProviderKeyId);
    }
    await getDb(c.env)
      .update(users)
      .set({ preferredProviderKeyId, updatedAt: now() })
      .where(eq(users.id, c.get("user").id));
    return c.json({ ok: true });
  }
);
