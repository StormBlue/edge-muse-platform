import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/client";
import {
  providerKeyGroupMembers,
  providerKeyGroups,
  providerKeys,
  providers,
  tasks,
  userProviderKeys
} from "../../db/schema";
import { audit } from "../../lib/audit";
import { decryptString, encryptString } from "../../lib/crypto";
import { appError } from "../../lib/errors";
import { newId, now } from "../../lib/id";
import { assertAssignableProviderKey } from "../../lib/providerKeys";
import {
  ensureBuiltInProviders,
  isProviderKeyAssignable,
  PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS
} from "../../providers/catalog";
import { getProvider } from "../../providers/registry";
import type { SysadminRouter } from "./common";

const keySchema = z.object({
  providerId: z.string(),
  label: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  allocatedQuota: z.number().int().min(0).nullable().optional(),
  maxConcurrency: z.number().int().min(1).max(100).default(1),
  ownerAdminId: z.string().nullable().optional(),
  enabled: z.boolean().default(true)
});

export function registerSysadminProviderKeyRoutes(sysadminRoutes: SysadminRouter) {
  // Provider 密钥 CRUD / 连通性：加密存 `encrypted_key`，列表绝不返回密文。
  sysadminRoutes.get("/provider-keys", async (c) => {
    const includeUnsupported = c.req.query("includeUnsupported") === "1";
    const activeSlots = sql<number>`COALESCE(
      SUM(
        CASE
          WHEN tasks.status IN ('queued', 'running')
            AND tasks.assigned_at IS NOT NULL
          THEN 1
          ELSE 0
        END
      ),
      0
    )`;
    const rows = await getDb(c.env)
      .select({
        id: providerKeys.id,
        providerId: providerKeys.providerId,
        label: providerKeys.label,
        model: providerKeys.model,
        keyHint: providerKeys.keyHint,
        allocatedQuota: providerKeys.allocatedQuota,
        usedQuota: providerKeys.usedQuota,
        maxConcurrency: providerKeys.maxConcurrency,
        activeSlots,
        ownerAdminId: providerKeys.ownerAdminId,
        enabled: providerKeys.enabled,
        createdAt: providerKeys.createdAt,
        updatedAt: providerKeys.updatedAt,
        deletedAt: providerKeys.deletedAt
      })
      .from(providerKeys)
      .leftJoin(tasks, eq(tasks.providerKeyId, providerKeys.id))
      .where(
        and(
          isNull(providerKeys.deletedAt),
          includeUnsupported
            ? undefined
            : inArray(providerKeys.providerId, PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS)
        )
      )
      .groupBy(providerKeys.id)
      .orderBy(desc(providerKeys.createdAt));
    return c.json({ items: rows });
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
      maxConcurrency: body.maxConcurrency,
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
        maxConcurrency: z.number().int().min(1).max(100).optional(),
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
        if (body.providerId !== existingKey.providerId) {
          const member = await getDb(c.env)
            .select({ groupId: providerKeyGroupMembers.groupId })
            .from(providerKeyGroupMembers)
            .innerJoin(providerKeyGroups, eq(providerKeyGroups.id, providerKeyGroupMembers.groupId))
            .where(
              and(
                eq(providerKeyGroupMembers.providerKeyId, existingKey.id),
                isNull(providerKeyGroups.deletedAt)
              )
            )
            .limit(1);
          if (member.length > 0) {
            throw appError("VALIDATION_ERROR", "Cannot change provider for a grouped key");
          }
        }
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
}
