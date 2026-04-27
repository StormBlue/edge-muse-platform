import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/client";
import { providerKeys, quotas, userProviderKeys, users } from "../../db/schema";
import { generatedEmailForUserId, normalizeOptionalEmail } from "../../lib/account";
import { audit } from "../../lib/audit";
import { appError } from "../../lib/errors";
import { newId, now } from "../../lib/id";
import { hashPassword } from "../../lib/password";
import { getAssignableProviderKey } from "../../lib/providerKeys";
import { optionalEmailSchema, usernameSchema, type SysadminRouter } from "./common";

export function registerSysadminAdminRoutes(sysadminRoutes: SysadminRouter) {
  // 租户管理员（role=admin）：开通、列表、改密钥/配额/密码。
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
}
