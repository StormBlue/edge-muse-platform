import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/client";
import { providerKeyGroups, quotas, users } from "../../db/schema";
import { generatedEmailForUserId, normalizeOptionalEmail } from "../../lib/account";
import { audit } from "../../lib/audit";
import { appError } from "../../lib/errors";
import { newId, now } from "../../lib/id";
import { hashPassword } from "../../lib/password";
import { assertMaxConcurrentTasksConfigAllowed } from "../../lib/generationPolicy";
import { resolveProviderKeyGroup } from "../../lib/providerKeyGroups";
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
        providerKeyGroupId: z.string().min(1),
        maxConcurrentTasks: z.number().int().min(1).max(15).default(10),
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

      assertMaxConcurrentTasksConfigAllowed("admin", body.maxConcurrentTasks);
      await getAssignableProviderKeyGroup(c.env, body.providerKeyGroupId);

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
          preferredProviderKeyId: null,
          providerKeyGroupId: body.providerKeyGroupId,
          maxConcurrentTasks: body.maxConcurrentTasks,
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
        providerKeyGroupId: users.providerKeyGroupId,
        providerKeyGroupName: providerKeyGroups.name,
        providerKeyGroupProviderId: providerKeyGroups.providerId,
        maxConcurrentTasks: users.maxConcurrentTasks,
        allocatedQuota: quotas.allocatedQuota,
        usedQuota: quotas.usedQuota
      })
      .from(users)
      .leftJoin(quotas, eq(quotas.userId, users.id))
      .leftJoin(providerKeyGroups, eq(providerKeyGroups.id, users.providerKeyGroupId))
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
        providerKeyGroupId: z.string().min(1).optional(),
        maxConcurrentTasks: z.number().int().min(1).max(15).optional(),
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
      let changedProviderKeyGroupId: string | null = null;
      if (body.maxConcurrentTasks !== undefined) {
        assertMaxConcurrentTasksConfigAllowed("admin", body.maxConcurrentTasks);
      }
      if (
        body.providerKeyGroupId !== undefined &&
        body.providerKeyGroupId !== admin.providerKeyGroupId
      ) {
        await getAssignableProviderKeyGroup(c.env, body.providerKeyGroupId);
        changedProviderKeyGroupId = body.providerKeyGroupId;
      }
      const userUpdate: {
        nickname?: string;
        status?: "active" | "disabled";
        providerKeyGroupId?: string;
        maxConcurrentTasks?: number;
        passwordHash?: string;
        updatedAt: number;
      } = { updatedAt: timestamp };
      if (body.nickname !== undefined) userUpdate.nickname = body.nickname;
      if (body.status !== undefined) userUpdate.status = body.status;
      if (changedProviderKeyGroupId) userUpdate.providerKeyGroupId = changedProviderKeyGroupId;
      if (body.maxConcurrentTasks !== undefined)
        userUpdate.maxConcurrentTasks = body.maxConcurrentTasks;
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
      if (changedProviderKeyGroupId) {
        const managed = await getDb(c.env)
          .select({ id: users.id })
          .from(users)
          .where(sql`${users.id} = ${adminId} OR ${users.createdBy} = ${adminId}`);
        const managedUserIds = managed.map((row) => row.id);
        await getDb(c.env)
          .update(users)
          .set({
            providerKeyGroupId: changedProviderKeyGroupId,
            updatedAt: timestamp
          })
          .where(inArray(users.id, managedUserIds));
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

async function getAssignableProviderKeyGroup(env: Cloudflare.Env, groupId: string) {
  await resolveProviderKeyGroup(env, groupId);
}
