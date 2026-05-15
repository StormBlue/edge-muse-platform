/**
 * Provider key group 解析与能力快照。
 *
 * 新调度模型以 `users.provider_key_group_id` 为权威来源；迁移期允许从旧单 key 绑定推导一个兼容 group，
 * 避免尚未回填或测试库旧数据导致 `/me` 与任务创建立刻不可用。
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  providerKeyGroupMembers,
  providerKeyGroups,
  providerKeys,
  providers,
  userProviderKeys,
  users,
  type Provider,
  type ProviderKey,
  type ProviderKeyGroup
} from "../db/schema";
import { isProviderKeyAssignable } from "../providers/catalog";
import { getProvider } from "../providers/registry";
import type { ImageProvider } from "../providers/types";
import { appError, isAppError } from "./errors";
import { now } from "./id";
import { parseJson } from "./json";
import type { AppBindings, SessionMode } from "../types";

export type ProviderKeyGroupMemberWithKey = {
  groupId: string;
  providerKeyId: string;
  sortOrder: number;
  key: ProviderKey;
};

export type ResolvedProviderKeyGroup = {
  group: ProviderKeyGroup;
  provider: Provider;
  members: ProviderKeyGroupMemberWithKey[];
};

export type ProviderCapabilities = {
  providerId: string;
  providerName: string;
  providerKeyId: string | null;
  providerKeyGroupId: string | null;
  providerKeyGroupName: string | null;
  requestFormat: string;
  model: string;
  supportedModes: SessionMode[];
  supportedSizes: string[];
  maxReferenceImages: number | null;
};

const PLATFORM_REFERENCE_IMAGE_LIMIT = 5;
const ALL_SESSION_MODES: SessionMode[] = ["image2image", "text2image"];

export async function resolveProviderKeyGroupForUser(
  env: AppBindings,
  userId: string
): Promise<ResolvedProviderKeyGroup> {
  const db = getDb(env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw appError("UNAUTHORIZED", "User missing");

  const groupId = user.providerKeyGroupId;
  if (groupId) {
    const resolved = await resolveProviderKeyGroup(env, groupId);
    if (resolved) return resolved;
    throw appError("PROVIDER_ERROR", "No provider key group configured");
  }

  return resolveLegacyProviderKeyAsGroup(env, userId);
}

export async function resolveProviderKeyGroup(
  env: AppBindings,
  groupId: string
): Promise<ResolvedProviderKeyGroup | null> {
  const db = getDb(env);
  const group = await db.query.providerKeyGroups.findFirst({
    where: and(
      eq(providerKeyGroups.id, groupId),
      eq(providerKeyGroups.enabled, true),
      isNull(providerKeyGroups.deletedAt)
    )
  });
  if (!group) return null;

  const provider = await db.query.providers.findFirst({
    where: and(
      eq(providers.id, group.providerId),
      eq(providers.enabled, true),
      isNull(providers.deletedAt)
    )
  });
  if (!provider) throw appError("PROVIDER_ERROR", "Provider disabled");
  if (!isProviderKeyAssignable(provider.id)) {
    throw appError("VALIDATION_ERROR", "Unsupported provider key group");
  }

  const rows = await db
    .select({
      groupId: providerKeyGroupMembers.groupId,
      providerKeyId: providerKeyGroupMembers.providerKeyId,
      sortOrder: providerKeyGroupMembers.sortOrder,
      key: providerKeys
    })
    .from(providerKeyGroupMembers)
    .innerJoin(providerKeys, eq(providerKeys.id, providerKeyGroupMembers.providerKeyId))
    .where(
      and(
        eq(providerKeyGroupMembers.groupId, group.id),
        eq(providerKeys.providerId, group.providerId),
        eq(providerKeys.enabled, true),
        isNull(providerKeys.deletedAt),
        inArray(providerKeys.providerId, [provider.id])
      )
    )
    .orderBy(providerKeyGroupMembers.sortOrder, providerKeys.createdAt);

  if (!rows.length) throw appError("PROVIDER_ERROR", "No provider key configured");
  return {
    group,
    provider,
    members: rows.map((row) => ({
      groupId: row.groupId,
      providerKeyId: row.providerKeyId,
      sortOrder: row.sortOrder,
      key: row.key
    }))
  };
}

export async function getProviderCapabilitiesForUser(
  env: AppBindings,
  userId: string
): Promise<ProviderCapabilities | null> {
  let resolved: ResolvedProviderKeyGroup;
  try {
    resolved = await resolveProviderKeyGroupForUser(env, userId);
  } catch (error) {
    if (!isAppError(error) || error.code !== "PROVIDER_ERROR") throw error;
    return null;
  }
  return providerCapabilitiesFromResolvedGroup(resolved);
}

export function providerCapabilitiesFromResolvedGroup(
  resolved: ResolvedProviderKeyGroup
): ProviderCapabilities {
  const providerImpl = getProvider(resolved.provider.requestFormat);
  const firstKey = resolved.members[0]?.key ?? null;
  return {
    providerId: resolved.provider.id,
    providerName: resolved.provider.name,
    providerKeyId: firstKey?.id ?? null,
    providerKeyGroupId: resolved.group.id,
    providerKeyGroupName: resolved.group.name,
    requestFormat: resolved.provider.requestFormat,
    model: firstKey?.model ?? resolved.provider.defaultModel,
    supportedModes: providerImpl.supportedModes ?? [...ALL_SESSION_MODES],
    supportedSizes: parseProviderSupportedSizes(resolved.provider.supportedSizes, providerImpl),
    maxReferenceImages: providerImpl.maxReferenceImages ?? PLATFORM_REFERENCE_IMAGE_LIMIT
  };
}

async function resolveLegacyProviderKeyAsGroup(
  env: AppBindings,
  userId: string
): Promise<ResolvedProviderKeyGroup> {
  const db = getDb(env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const preferredKey = user?.preferredProviderKeyId
    ? await db.query.providerKeys.findFirst({
        where: and(
          eq(providerKeys.id, user.preferredProviderKeyId),
          eq(providerKeys.enabled, true),
          isNull(providerKeys.deletedAt)
        )
      })
    : null;
  const assigned = await db.query.userProviderKeys.findFirst({
    where: eq(userProviderKeys.userId, userId)
  });
  const assignedKey = assigned
    ? await db.query.providerKeys.findFirst({
        where: and(
          eq(providerKeys.id, assigned.providerKeyId),
          eq(providerKeys.enabled, true),
          isNull(providerKeys.deletedAt)
        )
      })
    : null;
  const key = preferredKey ?? assignedKey;
  if (!key) throw appError("PROVIDER_ERROR", "No provider key configured");
  if (!isProviderKeyAssignable(key.providerId)) {
    throw appError("VALIDATION_ERROR", "Unsupported provider key");
  }

  const provider = await db.query.providers.findFirst({
    where: and(
      eq(providers.id, key.providerId),
      eq(providers.enabled, true),
      isNull(providers.deletedAt)
    )
  });
  if (!provider) throw appError("PROVIDER_ERROR", "Provider disabled");

  const group = await ensureLegacyProviderKeyGroup(env, key);

  return {
    group,
    provider,
    members: [
      {
        groupId: group.id,
        providerKeyId: key.id,
        sortOrder: 0,
        key
      }
    ]
  };
}

/**
 * 确保存在与单把密钥对应的兼容分组 `pkg_<keyId>`（含成员行）。
 * 个人偏好像 `preferred_provider_key_id` 更新时需与生图用的 `provider_key_group_id` 对齐。
 */
export async function ensureLegacyProviderKeyGroup(
  env: AppBindings,
  key: ProviderKey
): Promise<ProviderKeyGroup> {
  const db = getDb(env);
  const groupId = `pkg_${key.id}`;
  const existing = await db.query.providerKeyGroups.findFirst({
    where: and(eq(providerKeyGroups.id, groupId), isNull(providerKeyGroups.deletedAt))
  });
  const timestamp = now();
  if (!existing) {
    await db.insert(providerKeyGroups).values({
      id: groupId,
      providerId: key.providerId,
      name: `${key.label} 默认分组`,
      description: "Migrated from single provider key binding",
      enabled: true,
      createdBy: key.ownerAdminId,
      updatedBy: key.ownerAdminId,
      createdAt: key.createdAt || timestamp,
      updatedAt: timestamp,
      deletedAt: null
    });
  } else if (!existing.enabled || existing.providerId !== key.providerId) {
    await db
      .update(providerKeyGroups)
      .set({
        providerId: key.providerId,
        enabled: true,
        updatedBy: key.ownerAdminId,
        updatedAt: timestamp,
        deletedAt: null
      })
      .where(eq(providerKeyGroups.id, groupId));
  }

  const member = await db.query.providerKeyGroupMembers.findFirst({
    where: and(
      eq(providerKeyGroupMembers.groupId, groupId),
      eq(providerKeyGroupMembers.providerKeyId, key.id)
    )
  });
  if (!member) {
    await db.insert(providerKeyGroupMembers).values({
      groupId,
      providerKeyId: key.id,
      sortOrder: 0,
      createdAt: key.createdAt || timestamp,
      updatedAt: timestamp
    });
  }

  const group = await db.query.providerKeyGroups.findFirst({
    where: and(
      eq(providerKeyGroups.id, groupId),
      eq(providerKeyGroups.enabled, true),
      isNull(providerKeyGroups.deletedAt)
    )
  });
  if (!group) throw appError("PROVIDER_ERROR", "No provider key group configured");
  return group;
}

function parseProviderSupportedSizes(
  supportedSizes: string,
  providerImpl: ImageProvider
): string[] {
  const sizes = parseJson<string[]>(supportedSizes, providerImpl.supportedSizes);
  return sizes.length ? sizes : providerImpl.supportedSizes;
}

export async function assertProviderKeyGroupContainsKeysFromSameProvider(
  env: AppBindings,
  input: { providerId: string; providerKeyIds: string[] }
): Promise<void> {
  if (!input.providerKeyIds.length) return;
  const rows = await getDb(env)
    .select({
      count: sql<number>`count(*)`
    })
    .from(providerKeys)
    .where(
      and(
        inArray(providerKeys.id, input.providerKeyIds),
        eq(providerKeys.providerId, input.providerId),
        isNull(providerKeys.deletedAt)
      )
    );
  if ((rows[0]?.count ?? 0) !== input.providerKeyIds.length) {
    throw appError("VALIDATION_ERROR", "Provider key group members must belong to one provider");
  }
}

export async function assertProviderKeysNotUsedByOtherGroups(
  env: AppBindings,
  input: { groupId?: string; providerKeyIds: string[] }
): Promise<void> {
  if (!input.providerKeyIds.length) return;
  const rows = await getDb(env)
    .select({
      groupId: providerKeyGroupMembers.groupId,
      providerKeyId: providerKeyGroupMembers.providerKeyId
    })
    .from(providerKeyGroupMembers)
    .innerJoin(providerKeyGroups, eq(providerKeyGroups.id, providerKeyGroupMembers.groupId))
    .where(
      and(
        inArray(providerKeyGroupMembers.providerKeyId, input.providerKeyIds),
        isNull(providerKeyGroups.deletedAt)
      )
    );
  const conflict = rows.find((row) => row.groupId !== input.groupId);
  if (conflict) {
    throw appError("VALIDATION_ERROR", "Provider key is already used by another group");
  }
}
