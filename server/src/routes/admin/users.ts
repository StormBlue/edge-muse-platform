import { and, desc, eq, inArray, like, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/client";
import {
  providerKeys,
  quotaTransactions,
  quotas,
  tasks,
  userProviderKeys,
  users
} from "../../db/schema";
import { assertManagedUserAccess } from "../../lib/access";
import { generatedEmailForUserId, normalizeOptionalEmail } from "../../lib/account";
import { audit } from "../../lib/audit";
import { appError } from "../../lib/errors";
import { newId, now } from "../../lib/id";
import { hashPassword } from "../../lib/password";
import { getAssignableProviderKey } from "../../lib/providerKeys";
import { getQuota, grantQuota } from "../../lib/quota";
import {
  optionalEmailSchema,
  optionalProviderKeySchema,
  parsePositiveInt,
  usernameSchema,
  type AdminRouter
} from "./common";

export function registerAdminUserRoutes(adminRoutes: AdminRouter) {
  adminRoutes.get("/users", async (c) => {
    const actor = c.get("user");
    const q = c.req.query("q")?.trim();
    const status = c.req.query("status");
    const requestedRole = c.req.query("role");
    const page = parsePositiveInt(c.req.query("page"), 1);
    const pageSize = parsePositiveInt(c.req.query("pageSize"), 20, 100);
    const role =
      actor.role === "sysadmin" && (requestedRole === "admin" || requestedRole === "user")
        ? requestedRole
        : actor.role === "sysadmin"
          ? null
          : "user";
    const userFilters = and(
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
    );
    const totalRows = await getDb(c.env)
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(userFilters);
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
      .where(userFilters)
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return c.json({ items: rows, page, pageSize, total: totalRows[0]?.count ?? 0 });
  });

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
      if (
        body.providerKeyId !== undefined &&
        body.providerKeyId !== target.preferredProviderKeyId
      ) {
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
        const managed =
          target.role === "admin"
            ? await getDb(c.env)
                .select({ id: users.id })
                .from(users)
                .where(sql`${users.id} = ${target.id} OR ${users.createdBy} = ${target.id}`)
            : [{ id: target.id }];
        const managedUserIds = managed.map((row) => row.id);
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

  adminRoutes.get("/users/:id/quota", async (c) => {
    const target = await assertManagedUserAccess(c.env, c.req.param("id"), c.get("user"));
    const limit = Math.min(Number(c.req.query("limit") ?? "20"), 50);
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
}
