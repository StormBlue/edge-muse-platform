import { and, desc, eq, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { quotaTransactions, quotas, tasks, userProviderKeys, users } from "../db/schema";
import { assertManagedUserAccess } from "../lib/access";
import { audit } from "../lib/audit";
import { appError } from "../lib/errors";
import { newId, now } from "../lib/id";
import { hashPassword } from "../lib/password";
import { getQuota, grantQuota } from "../lib/quota";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import type { AppEnv } from "../types";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", requireAuth, requireRole("admin"));

adminRoutes.get("/users", async (c) => {
  const actor = c.get("user");
  const q = c.req.query("q");
  const status = c.req.query("status");
  const role = c.req.query("role") ?? "user";
  const rows = await getDb(c.env)
    .select({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      allocatedQuota: quotas.allocatedQuota,
      usedQuota: quotas.usedQuota
    })
    .from(users)
    .leftJoin(quotas, eq(quotas.userId, users.id))
    .where(
      and(
        actor.role === "sysadmin" ? undefined : eq(users.createdBy, actor.id),
        role ? eq(users.role, role as "sysadmin" | "admin" | "user") : undefined,
        status ? eq(users.status, status as "active" | "disabled") : undefined,
        q ? like(users.email, `%${q}%`) : undefined
      )
    )
    .orderBy(desc(users.createdAt))
    .limit(100);
  return c.json({ items: rows });
});

adminRoutes.post(
  "/users",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      nickname: z.string().min(1).max(40),
      quota: z.number().int().min(0).default(0)
    })
  ),
  async (c) => {
    const actor = c.get("user");
    const body = c.req.valid("json");
    if (actor.role !== "sysadmin") {
      const actorQuota = await getQuota(c.env, actor.id);
      if (actorQuota.remainingQuota !== null && body.quota > actorQuota.remainingQuota) {
        throw appError("QUOTA_EXCEEDED", "Cannot grant more quota than remaining");
      }
    }
    const id = newId("usr");
    const timestamp = now();
    await getDb(c.env)
      .insert(users)
      .values({
        id,
        email: body.email.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        nickname: body.nickname,
        role: "user",
        createdBy: actor.id,
        preferredProviderKeyId: null,
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
    const actorKey = await getDb(c.env).query.userProviderKeys.findFirst({
      where: eq(userProviderKeys.userId, actor.id)
    });
    if (actorKey) {
      await getDb(c.env).insert(userProviderKeys).values({
        userId: id,
        providerKeyId: actorKey.providerKeyId,
        assignedAt: timestamp
      });
    }
    if (actor.role !== "sysadmin" && body.quota > 0) {
      await c.env.DB.prepare(
        "UPDATE quotas SET allocated_quota = allocated_quota - ?1, updated_at = ?2 WHERE user_id = ?3"
      )
        .bind(body.quota, timestamp, actor.id)
        .run();
    }
    await audit(c.env, {
      actorId: actor.id,
      action: "admin.user_create",
      targetType: "user",
      targetId: id
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
      status: z.enum(["active", "disabled"]).optional()
    })
  ),
  async (c) => {
    const target = await assertManagedUserAccess(c.env, c.req.param("id"), c.get("user"));
    const body = c.req.valid("json");
    await getDb(c.env)
      .update(users)
      .set({ ...body, updatedAt: now() })
      .where(eq(users.id, target.id));
    await audit(c.env, {
      actorId: c.get("user").id,
      action: "admin.user_update",
      targetType: "user",
      targetId: target.id,
      payload: body
    });
    return c.json({ ok: true });
  }
);

adminRoutes.get("/users/:id/quota", async (c) => {
  const target = await assertManagedUserAccess(c.env, c.req.param("id"), c.get("user"));
  const tx = await getDb(c.env)
    .select()
    .from(quotaTransactions)
    .where(eq(quotaTransactions.userId, target.id))
    .orderBy(desc(quotaTransactions.createdAt))
    .limit(50);
  return c.json({ quota: await getQuota(c.env, target.id), transactions: tx });
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
