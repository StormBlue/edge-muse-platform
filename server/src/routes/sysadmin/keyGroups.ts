import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/client";
import {
  providerKeyGroupMembers,
  providerKeyGroups,
  providerKeys,
  providers
} from "../../db/schema";
import { audit } from "../../lib/audit";
import { appError } from "../../lib/errors";
import { newId, now } from "../../lib/id";
import {
  assertProviderKeyGroupContainsKeysFromSameProvider,
  assertProviderKeysNotUsedByOtherGroups
} from "../../lib/providerKeyGroups";
import { ensureBuiltInProviders, isProviderKeyAssignable } from "../../providers/catalog";
import type { SysadminRouter } from "./common";

const groupSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).nullable().optional(),
  enabled: z.boolean().default(true),
  keyIds: z.array(z.string().min(1)).optional()
});

const groupPatchSchema = z.object({
  providerId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  enabled: z.boolean().optional()
});

const reorderSchema = z.object({
  keyIds: z.array(z.string().min(1)).default([])
});

export function registerSysadminKeyGroupRoutes(sysadminRoutes: SysadminRouter) {
  sysadminRoutes.get("/provider-key-groups", async (c) => {
    const rows = await getDb(c.env)
      .select({
        id: providerKeyGroups.id,
        providerId: providerKeyGroups.providerId,
        name: providerKeyGroups.name,
        description: providerKeyGroups.description,
        enabled: providerKeyGroups.enabled,
        createdAt: providerKeyGroups.createdAt,
        updatedAt: providerKeyGroups.updatedAt
      })
      .from(providerKeyGroups)
      .where(isNull(providerKeyGroups.deletedAt))
      .orderBy(asc(providerKeyGroups.providerId), asc(providerKeyGroups.name));
    const items = await Promise.all(
      rows.map(async (group) => ({ ...group, members: await listGroupMembers(c.env, group.id) }))
    );
    return c.json({ items });
  });

  sysadminRoutes.get("/provider-key-groups/:id", async (c) => {
    const group = await getDb(c.env).query.providerKeyGroups.findFirst({
      where: and(eq(providerKeyGroups.id, c.req.param("id")), isNull(providerKeyGroups.deletedAt))
    });
    if (!group) throw appError("NOT_FOUND", "Provider key group not found");
    const members = await listGroupMembers(c.env, group.id);
    return c.json({ group, members });
  });

  sysadminRoutes.post("/provider-key-groups", zValidator("json", groupSchema), async (c) => {
    await ensureBuiltInProviders(c.env);
    const body = c.req.valid("json");
    await assertAssignableProvider(c.env, body.providerId);
    const keyIds = uniqueIds(body.keyIds ?? []);
    await assertProviderKeyGroupContainsKeysFromSameProvider(c.env, {
      providerId: body.providerId,
      providerKeyIds: keyIds
    });
    await assertProviderKeysNotUsedByOtherGroups(c.env, { providerKeyIds: keyIds });

    const timestamp = now();
    const groupId = newId("pkg");
    await getDb(c.env)
      .insert(providerKeyGroups)
      .values({
        id: groupId,
        providerId: body.providerId,
        name: body.name,
        description: body.description ?? null,
        enabled: body.enabled,
        createdBy: c.get("user").id,
        updatedBy: c.get("user").id,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null
      });
    await replaceGroupMembers(c.env, {
      groupId,
      providerId: body.providerId,
      keyIds,
      timestamp
    });
    await audit(c.env, {
      actorId: c.get("user").id,
      action: "sys.provider_key_group_create",
      targetType: "provider_key_group",
      targetId: groupId,
      payload: { providerId: body.providerId, keyCount: keyIds.length }
    });
    return c.json({ id: groupId }, 201);
  });

  sysadminRoutes.patch(
    "/provider-key-groups/:id",
    zValidator("json", groupPatchSchema),
    async (c) => {
      const groupId = c.req.param("id");
      const body = c.req.valid("json");
      const existing = await getDb(c.env).query.providerKeyGroups.findFirst({
        where: and(eq(providerKeyGroups.id, groupId), isNull(providerKeyGroups.deletedAt))
      });
      if (!existing) throw appError("NOT_FOUND", "Provider key group not found");
      if (body.providerId !== undefined) {
        await assertAssignableProvider(c.env, body.providerId);
        const members = await listGroupMembers(c.env, groupId);
        await assertProviderKeyGroupContainsKeysFromSameProvider(c.env, {
          providerId: body.providerId,
          providerKeyIds: members.map((member) => member.id)
        });
      }
      const patch = {
        ...(body.providerId !== undefined ? { providerId: body.providerId } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        updatedBy: c.get("user").id,
        updatedAt: now()
      };
      await getDb(c.env)
        .update(providerKeyGroups)
        .set(patch)
        .where(eq(providerKeyGroups.id, groupId));
      await audit(c.env, {
        actorId: c.get("user").id,
        action: "sys.provider_key_group_update",
        targetType: "provider_key_group",
        targetId: groupId,
        payload: {
          providerId: body.providerId,
          name: body.name,
          descriptionChanged: body.description !== undefined,
          enabled: body.enabled
        }
      });
      return c.json({ ok: true });
    }
  );

  sysadminRoutes.put(
    "/provider-key-groups/:id/members",
    zValidator("json", reorderSchema),
    async (c) => {
      const groupId = c.req.param("id");
      const group = await getDb(c.env).query.providerKeyGroups.findFirst({
        where: and(eq(providerKeyGroups.id, groupId), isNull(providerKeyGroups.deletedAt))
      });
      if (!group) throw appError("NOT_FOUND", "Provider key group not found");
      const keyIds = uniqueIds(c.req.valid("json").keyIds);
      await replaceGroupMembers(c.env, {
        groupId,
        providerId: group.providerId,
        keyIds,
        timestamp: now()
      });
      await getDb(c.env)
        .update(providerKeyGroups)
        .set({ updatedBy: c.get("user").id, updatedAt: now() })
        .where(eq(providerKeyGroups.id, groupId));
      await audit(c.env, {
        actorId: c.get("user").id,
        action: "sys.provider_key_group_members_update",
        targetType: "provider_key_group",
        targetId: groupId,
        payload: { keyCount: keyIds.length, keyIds }
      });
      return c.json({ ok: true, members: await listGroupMembers(c.env, groupId) });
    }
  );

  sysadminRoutes.delete("/provider-key-groups/:id", async (c) => {
    const timestamp = now();
    await getDb(c.env)
      .update(providerKeyGroups)
      .set({
        enabled: false,
        updatedBy: c.get("user").id,
        updatedAt: timestamp,
        deletedAt: timestamp
      })
      .where(eq(providerKeyGroups.id, c.req.param("id")));
    await audit(c.env, {
      actorId: c.get("user").id,
      action: "sys.provider_key_group_delete",
      targetType: "provider_key_group",
      targetId: c.req.param("id")
    });
    return c.json({ ok: true });
  });
}

async function assertAssignableProvider(env: Cloudflare.Env, providerId: string): Promise<void> {
  if (!isProviderKeyAssignable(providerId))
    throw appError("VALIDATION_ERROR", "Unsupported provider");
  const provider = await getDb(env).query.providers.findFirst({
    where: and(
      eq(providers.id, providerId),
      eq(providers.enabled, true),
      isNull(providers.deletedAt)
    )
  });
  if (!provider) throw appError("NOT_FOUND", "Provider not found");
}

async function listGroupMembers(env: Cloudflare.Env, groupId: string) {
  return getDb(env)
    .select({
      id: providerKeys.id,
      providerKeyId: providerKeys.id,
      providerId: providerKeys.providerId,
      label: providerKeys.label,
      model: providerKeys.model,
      keyHint: providerKeys.keyHint,
      maxConcurrency: providerKeys.maxConcurrency,
      enabled: providerKeys.enabled,
      allocatedQuota: providerKeys.allocatedQuota,
      usedQuota: providerKeys.usedQuota,
      sortOrder: providerKeyGroupMembers.sortOrder
    })
    .from(providerKeyGroupMembers)
    .innerJoin(providerKeys, eq(providerKeys.id, providerKeyGroupMembers.providerKeyId))
    .where(eq(providerKeyGroupMembers.groupId, groupId))
    .orderBy(asc(providerKeyGroupMembers.sortOrder), asc(providerKeys.createdAt));
}

async function replaceGroupMembers(
  env: Cloudflare.Env,
  input: { groupId: string; providerId: string; keyIds: string[]; timestamp: number }
): Promise<void> {
  await assertProviderKeyGroupContainsKeysFromSameProvider(env, {
    providerId: input.providerId,
    providerKeyIds: input.keyIds
  });
  await assertProviderKeysNotUsedByOtherGroups(env, {
    groupId: input.groupId,
    providerKeyIds: input.keyIds
  });
  await getDb(env)
    .delete(providerKeyGroupMembers)
    .where(eq(providerKeyGroupMembers.groupId, input.groupId));
  if (!input.keyIds.length) return;
  await getDb(env)
    .insert(providerKeyGroupMembers)
    .values(
      input.keyIds.map((providerKeyId, index) => ({
        groupId: input.groupId,
        providerKeyId,
        sortOrder: index,
        createdAt: input.timestamp,
        updatedAt: input.timestamp
      }))
    );
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}
