/**
 * 租户管理员 API（`/api/admin/*`）：
 * - `requireRole("admin")`：含 **admin 与 sysadmin**（`requireRole` 实现里 admin 可访问 admin 路由）；
 * - 非 sysadmin 时 `users.createdBy = actor.id`，只能管自己挂名的下属；sysadmin 可调 `?role=` 看全局 admin/user；
 * - 配额、子用户 CRUD、用量聚合等与 `quotas` / `user_provider_keys` 联动。
 */
import { and, desc, eq, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import {
  providerKeys,
  quotaTransactions,
  quotas,
  tasks,
  userProviderKeys,
  users
} from "../db/schema";
import { assertManagedUserAccess } from "../lib/access";
import { generatedEmailForUserId, normalizeOptionalEmail } from "../lib/account";
import { audit } from "../lib/audit";
import { appError } from "../lib/errors";
import { newId, now } from "../lib/id";
import { hashPassword } from "../lib/password";
import { getAssignableProviderKey } from "../lib/providerKeys";
import { getQuota, grantQuota } from "../lib/quota";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS } from "../providers/catalog";
import type { AppEnv } from "../types";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", requireAuth, requireRole("admin"));

// ===================== 校验 schema（与前端表单/错误提示对齐） =====================

/** 空串视为未提供邮箱，与「可选」字段表单一致 */
const optionalEmailSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}, z.string().email().optional());

/** 空串表示不更新或不绑定 provider key */
const optionalProviderKeySchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}, z.string().min(1).optional());

/** 去首尾空白，防复制粘贴带入换行 */
const usernameSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value.trim();
}, z.string().min(1).max(40));

// ---------- 下属用户列表：非 sysadmin 仅 `createdBy = 自己`；sysadmin 可按 ?role= 筛 admin|user ----------
/**
 * 多表 join 聚合 `generationCount` / `lastGenerationAt`；where 随 `actor.role` 分支。
 * `role` 为 null 且 actor 为 sysadmin 时：`inArray(users.role, ["admin","user"])` 看两类下属。
 */
adminRoutes.get("/users", async (c) => {
  const actor = c.get("user");
  const q = c.req.query("q");
  const status = c.req.query("status");
  const requestedRole = c.req.query("role");
  // sysadmin 显式要某一类；否则全站两类；普通 admin 的 role 在下方固定为 "user"（通过三元）
  const role =
    actor.role === "sysadmin" && (requestedRole === "admin" || requestedRole === "user")
      ? requestedRole
      : actor.role === "sysadmin"
        ? null
        : "user";
  const rows = await getDb(c.env)
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      nickname: users.nickname,
      role: users.role,
      status: users.status,
      preferredProviderKeyId: users.preferredProviderKeyId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastLoginAt: users.lastLoginAt,
      allocatedQuota: quotas.allocatedQuota,
      usedQuota: quotas.usedQuota,
      providerKeyId: userProviderKeys.providerKeyId,
      generationCount: sql<number>`count(${tasks.id})`,
      lastGenerationAt: sql<number | null>`max(${tasks.queuedAt})`
    })
    .from(users)
    .leftJoin(quotas, eq(quotas.userId, users.id))
    .leftJoin(userProviderKeys, eq(userProviderKeys.userId, users.id))
    .leftJoin(tasks, eq(tasks.userId, users.id))
    .where(
      and(
        actor.role === "sysadmin" ? undefined : eq(users.createdBy, actor.id),
        actor.role === "sysadmin" && !role ? inArray(users.role, ["admin", "user"]) : undefined,
        role ? eq(users.role, role as "admin" | "user") : undefined,
        status ? eq(users.status, status as "active" | "disabled") : undefined,
        q
          ? or(
              like(users.email, `%${q}%`),
              like(users.username, `%${q}%`),
              like(users.nickname, `%${q}%`)
            )
          : undefined
      )
    )
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(100);
  return c.json({ items: rows });
});

// ---------- 可选的 Provider 密钥（下拉用）：不返回 `encryptedKey`；sysadmin 看全部启用，admin 仅「绑到自己 user_id」的 key ----------
adminRoutes.get("/provider-keys", async (c) => {
  const actor = c.get("user");
  const db = getDb(c.env);
  const baseSelect = {
    id: providerKeys.id,
    label: providerKeys.label,
    keyHint: providerKeys.keyHint,
    enabled: providerKeys.enabled
  };

  if (actor.role === "sysadmin") {
    const rows = await db
      .select(baseSelect)
      .from(providerKeys)
      .where(
        and(
          eq(providerKeys.enabled, true),
          isNull(providerKeys.deletedAt),
          inArray(providerKeys.providerId, PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS)
        )
      )
      .orderBy(desc(providerKeys.createdAt));
    return c.json({ items: rows });
  }

  const rows = await db
    .select(baseSelect)
    .from(providerKeys)
    .innerJoin(userProviderKeys, eq(userProviderKeys.providerKeyId, providerKeys.id))
    .where(
      and(
        eq(userProviderKeys.userId, actor.id),
        eq(providerKeys.enabled, true),
        isNull(providerKeys.deletedAt),
        inArray(providerKeys.providerId, PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS)
      )
    )
    .orderBy(desc(providerKeys.createdAt));
  return c.json({ items: rows });
});

// ---------- 创建下属用户：配额从「操作者自己的池子」扣减（非 sysadmin）；admin 角色须指定 providerKeyId ----------
adminRoutes.post(
  "/users",
  zValidator(
    "json",
    z.object({
      email: optionalEmailSchema,
      username: usernameSchema,
      password: z.string().min(8),
      nickname: z.string().min(1).max(40),
      role: z.enum(["admin", "user"]).default("user"),
      providerKeyId: optionalProviderKeySchema,
      quota: z.number().int().min(0).nullable().default(0)
    })
  ),
  async (c) => {
    const actor = c.get("user");
    const body = c.req.valid("json");
    if (actor.role !== "sysadmin" && body.role !== "user") {
      throw appError("FORBIDDEN", "Only system administrators can create admins");
    }
    const email = normalizeOptionalEmail(body.email);
    const existing = await getDb(c.env).query.users.findFirst({
      where: email
        ? or(eq(users.email, email), eq(users.username, body.username))
        : eq(users.username, body.username)
    });
    if (existing) throw appError("VALIDATION_ERROR", "Username or email already exists");

    let providerKeyId = body.providerKeyId;
    const actorKey = await getDb(c.env).query.userProviderKeys.findFirst({
      where: eq(userProviderKeys.userId, actor.id)
    });

    if (actor.role !== "sysadmin" && providerKeyId && providerKeyId !== actorKey?.providerKeyId) {
      throw appError("FORBIDDEN", "No access to provider key");
    }
    providerKeyId = providerKeyId ?? actorKey?.providerKeyId;
    if (body.role === "admin" && !providerKeyId) {
      throw appError("VALIDATION_ERROR", "Provider key is required for admins");
    }

    if (providerKeyId) {
      await getAssignableProviderKey(c.env, providerKeyId);
    }

    if (actor.role !== "sysadmin") {
      if (body.quota === null) {
        throw appError("FORBIDDEN", "Only system administrators can grant unlimited quota");
      }
      const actorQuota = await getQuota(c.env, actor.id);
      const quotaToGrant = body.quota ?? 0;
      if (actorQuota.remainingQuota !== null && quotaToGrant > actorQuota.remainingQuota) {
        throw appError("QUOTA_EXCEEDED", "Cannot grant more quota than remaining");
      }
    }
    const id = newId(body.role === "admin" ? "adm" : "usr");
    const timestamp = now();
    await getDb(c.env)
      .insert(users)
      .values({
        id,
        email: email ?? generatedEmailForUserId(id),
        username: body.username,
        passwordHash: await hashPassword(body.password),
        nickname: body.nickname,
        role: body.role,
        createdBy: actor.id,
        preferredProviderKeyId: providerKeyId ?? null,
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
    if (providerKeyId) {
      await getDb(c.env).insert(userProviderKeys).values({
        userId: id,
        providerKeyId,
        assignedAt: timestamp
      });
    }
    // 租户 admin 给子用户预分配额度时，从自己 `quotas.allocated_quota` 扣减（与 grantQuota 语义一致，避免超发）
    if (actor.role !== "sysadmin" && (body.quota ?? 0) > 0) {
      await c.env.DB.prepare(
        "UPDATE quotas SET allocated_quota = allocated_quota - ?1, updated_at = ?2 WHERE user_id = ?3"
      )
        .bind(body.quota ?? 0, timestamp, actor.id)
        .run();
    }
    await audit(c.env, {
      actorId: actor.id,
      action: body.role === "admin" ? "sys.admin_create" : "admin.user_create",
      targetType: "user",
      targetId: id,
      payload: { role: body.role }
    });
    return c.json({ id }, 201);
  }
);

// ---------- 更新用户：非 sysadmin 不能改 key/配额/密码；改密钥时对「管辖树」下用户 UPSERT `user_provider_keys` ----------
adminRoutes.patch(
  "/users/:id",
  zValidator(
    "json",
    z.object({
      nickname: z.string().min(1).max(40).optional(),
      status: z.enum(["active", "disabled"]).optional(),
      providerKeyId: optionalProviderKeySchema,
      quota: z.number().int().min(0).nullable().optional(),
      password: z.string().min(8).optional()
    })
  ),
  async (c) => {
    const actor = c.get("user");
    const target = await assertManagedUserAccess(c.env, c.req.param("id"), actor);
    const body = c.req.valid("json");
    if (target.role === "sysadmin")
      throw appError("FORBIDDEN", "System admins cannot be edited here");
    if (
      actor.role !== "sysadmin" &&
      ("providerKeyId" in body || "quota" in body || body.password)
    ) {
      throw appError("FORBIDDEN", "Insufficient role");
    }
    const timestamp = now();
    let changedProviderKeyId: string | null = null;
    if (body.providerKeyId !== undefined && body.providerKeyId !== target.preferredProviderKeyId) {
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
      await getDb(c.env).update(users).set(userUpdate).where(eq(users.id, target.id));
    }
    if ("quota" in body) {
      await c.env.DB.prepare(
        `INSERT INTO quotas (user_id, allocated_quota, used_quota, updated_at)
         VALUES (?1, ?2, 0, ?3)
         ON CONFLICT(user_id) DO UPDATE SET allocated_quota = ?2, updated_at = ?3`
      )
        .bind(target.id, body.quota ?? null, timestamp)
        .run();
    }
    if (changedProviderKeyId) {
      // 若被改的是租户 admin，则其本人 + 所有 createdBy 指向它的用户一并换绑到同一把 key
      const managed =
        target.role === "admin"
          ? await getDb(c.env)
              .select({ id: users.id })
              .from(users)
              .where(sql`${users.id} = ${target.id} OR ${users.createdBy} = ${target.id}`)
          : [{ id: target.id }];
      const managedUserIds = managed.map((row) => row.id);
      // 运行时先读 users.preferredProviderKeyId，再读 user_provider_keys；两边必须同时级联换绑。
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
      if (target.role === "admin") {
        await getDb(c.env)
          .update(providerKeys)
          .set({ ownerAdminId: target.id, updatedAt: timestamp })
          .where(eq(providerKeys.id, changedProviderKeyId));
      }
    }
    await audit(c.env, {
      actorId: actor.id,
      action: "admin.user_update",
      targetType: "user",
      targetId: target.id,
      payload: { ...body, password: undefined, passwordReset: Boolean(body.password) }
    });
    return c.json({ ok: true });
  }
);

// ---------- 配额流水游标列表 + 加配额（grant）：非 sysadmin 加多少先从自己池子减多少 ----------
adminRoutes.get("/users/:id/quota", async (c) => {
  const target = await assertManagedUserAccess(c.env, c.req.param("id"), c.get("user"));
  const limit = Math.min(Number(c.req.query("limit") ?? "20"), 50);
  // cursor=上条 `createdAt`，拉取**更早**的流水（`lt`，与新在前排序一致）
  const cursor = Number(c.req.query("cursor") ?? "0");
  const tx = await getDb(c.env)
    .select()
    .from(quotaTransactions)
    .where(
      and(
        eq(quotaTransactions.userId, target.id),
        cursor ? lt(quotaTransactions.createdAt, cursor) : undefined
      )
    )
    .orderBy(desc(quotaTransactions.createdAt))
    .limit(limit + 1);
  return c.json({
    quota: await getQuota(c.env, target.id),
    transactions: tx.slice(0, limit),
    nextCursor: tx.length > limit ? tx[limit].createdAt : null
  });
});

adminRoutes.post(
  "/users/:id/quota",
  zValidator("json", z.object({ amount: z.number().int().min(1).max(1_000_000) })),
  async (c) => {
    const actor = c.get("user");
    const target = await assertManagedUserAccess(c.env, c.req.param("id"), actor);
    const { amount } = c.req.valid("json");
    if (actor.role !== "sysadmin") {
      const actorQuota = await getQuota(c.env, actor.id);
      if (actorQuota.remainingQuota !== null && amount > actorQuota.remainingQuota) {
        throw appError("QUOTA_EXCEEDED", "Cannot grant more quota than remaining");
      }
      await c.env.DB.prepare(
        "UPDATE quotas SET allocated_quota = allocated_quota - ?1, updated_at = ?2 WHERE user_id = ?3"
      )
        .bind(amount, now(), actor.id)
        .run();
    }
    const quota = await grantQuota(c.env, { userId: target.id, amount, operatorId: actor.id });
    await audit(c.env, {
      actorId: actor.id,
      action: "admin.quota_grant",
      targetType: "user",
      targetId: target.id,
      payload: { amount }
    });
    return c.json({ quota });
  }
);

// ---------- 单用户任务按 status/mode 聚合 + 近 30 日按天趋势（queued_at 按天桶）----------
adminRoutes.get("/users/:id/usage", async (c) => {
  const target = await assertManagedUserAccess(c.env, c.req.param("id"), c.get("user"));
  const stats = await c.env.DB.prepare(
    `SELECT status, mode, COUNT(*) as count
     FROM tasks
     WHERE user_id = ?1
     GROUP BY status, mode`
  )
    .bind(target.id)
    .all<{ status: string; mode: string; count: number }>();
  const trend = await c.env.DB.prepare(
    `SELECT CAST((queued_at / 86400000) AS INTEGER) as day, COUNT(*) as count
     FROM tasks
     WHERE user_id = ?1 AND queued_at > ?2
     GROUP BY day
     ORDER BY day ASC`
  )
    .bind(target.id, Date.now() - 30 * 24 * 60 * 60 * 1000)
    .all<{ day: number; count: number }>();
  const totalRow = await getDb(c.env)
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.userId, target.id));
  return c.json({ stats: stats.results, trend: trend.results, total: totalRow[0]?.count ?? 0 });
});

// ---------- 强制重置密码（不返回明文）；**被操作者**为 sysadmin 时拒绝（任意 sysadmin 账号均不可在此改密）----------
adminRoutes.post(
  "/users/:id/password",
  zValidator("json", z.object({ password: z.string().min(8) })),
  async (c) => {
    const actor = c.get("user");
    const target = await assertManagedUserAccess(c.env, c.req.param("id"), actor);
    if (target.role === "sysadmin")
      throw appError("FORBIDDEN", "System admin passwords cannot be reset here");
    await getDb(c.env)
      .update(users)
      .set({ passwordHash: await hashPassword(c.req.valid("json").password), updatedAt: now() })
      .where(eq(users.id, target.id));
    await audit(c.env, {
      actorId: actor.id,
      action: "admin.user_password_reset",
      targetType: "user",
      targetId: target.id
    });
    return c.json({ ok: true });
  }
);
