import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  generationFeatureGrants,
  providerKeyGroups,
  users,
  type ProviderKeyGroup
} from "../db/schema";
import { MICU_GROK_PROVIDER_ID } from "../providers/catalog";
import { appError, isAppError } from "./errors";
import { now } from "./id";
import {
  providerCapabilitiesFromResolvedGroup,
  resolveDefaultProviderKeyGroupForUser,
  resolveProviderKeyGroup,
  type ProviderCapabilities,
  type ResolvedProviderKeyGroup
} from "./providerKeyGroups";
import type { AppBindings, AuthUser } from "../types";

export const DEFAULT_GENERATION_TARGET_ID = "default";
export const MICU_GROK_GENERATION_TARGET_ID = "micu_grok";
export const MICU_GROK_GENERATION_FEATURE = "micu_grok_image";

export type GenerationTargetId =
  | typeof DEFAULT_GENERATION_TARGET_ID
  | typeof MICU_GROK_GENERATION_TARGET_ID;

export type GenerationTarget = {
  id: GenerationTargetId;
  label: string;
  experimental: boolean;
  providerCapabilities: ProviderCapabilities;
};

export type GenerationFeatureGrantAdmin = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  status: string;
  granted: boolean;
};

export async function getGenerationTargetsForUser(
  env: AppBindings,
  user: Pick<AuthUser, "id" | "role">
): Promise<GenerationTarget[]> {
  const targets: GenerationTarget[] = [];
  const defaultTarget = await getDefaultGenerationTarget(env, user.id);
  if (defaultTarget) targets.push(defaultTarget);
  const grokTarget = await getMicuGrokGenerationTarget(env, user);
  if (grokTarget) targets.push(grokTarget);
  return targets;
}

export async function resolveGenerationTargetForUser(
  env: AppBindings,
  input: { user: Pick<AuthUser, "id" | "role">; targetId?: string | null }
): Promise<{ target: GenerationTarget; resolved: ResolvedProviderKeyGroup }> {
  const targetId = normalizeGenerationTargetId(input.targetId);
  if (targetId === DEFAULT_GENERATION_TARGET_ID) {
    const resolved = await resolveDefaultProviderKeyGroupForUser(env, input.user.id);
    return {
      target: {
        id: DEFAULT_GENERATION_TARGET_ID,
        label: "默认生成",
        experimental: false,
        providerCapabilities: providerCapabilitiesFromResolvedGroup(resolved)
      },
      resolved
    };
  }

  if (!(await canUseMicuGrokImage(env, input.user))) {
    throw appError("FORBIDDEN", "Generation target is not enabled", {
      generationTargetId: targetId
    });
  }
  const resolved = await resolveMicuGrokProviderKeyGroup(env);
  return {
    target: {
      id: MICU_GROK_GENERATION_TARGET_ID,
      label: "米醋 Grok 图像",
      experimental: true,
      providerCapabilities: providerCapabilitiesFromResolvedGroup(resolved)
    },
    resolved
  };
}

export async function canUseMicuGrokImage(
  env: AppBindings,
  user: Pick<AuthUser, "id" | "role">
): Promise<boolean> {
  if (user.role === "sysadmin") return true;
  if (user.role !== "admin") return false;
  const row = await getDb(env).query.generationFeatureGrants.findFirst({
    where: and(
      eq(generationFeatureGrants.feature, MICU_GROK_GENERATION_FEATURE),
      eq(generationFeatureGrants.userId, user.id),
      eq(generationFeatureGrants.enabled, true)
    )
  });
  return Boolean(row);
}

export async function listMicuGrokAdminGrants(
  env: AppBindings
): Promise<GenerationFeatureGrantAdmin[]> {
  const db = getDb(env);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      nickname: users.nickname,
      status: users.status,
      enabled: generationFeatureGrants.enabled
    })
    .from(users)
    .leftJoin(
      generationFeatureGrants,
      and(
        eq(generationFeatureGrants.userId, users.id),
        eq(generationFeatureGrants.feature, MICU_GROK_GENERATION_FEATURE)
      )
    )
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.username));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    username: row.username,
    nickname: row.nickname,
    status: row.status,
    granted: Boolean(row.enabled)
  }));
}

export async function saveMicuGrokAdminGrants(
  env: AppBindings,
  input: { actorId: string; adminIds: string[] }
): Promise<GenerationFeatureGrantAdmin[]> {
  const adminIds = [...new Set(input.adminIds.map((id) => id.trim()).filter(Boolean))];
  const db = getDb(env);
  if (adminIds.length) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, adminIds), eq(users.role, "admin")));
    if (rows.length !== adminIds.length) {
      throw appError("VALIDATION_ERROR", "Only admin users can be granted Grok image access");
    }
  }
  const timestamp = now();
  await db
    .update(generationFeatureGrants)
    .set({ enabled: false, updatedBy: input.actorId, updatedAt: timestamp })
    .where(eq(generationFeatureGrants.feature, MICU_GROK_GENERATION_FEATURE));
  if (adminIds.length) {
    await db
      .insert(generationFeatureGrants)
      .values(
        adminIds.map((userId) => ({
          feature: MICU_GROK_GENERATION_FEATURE as typeof MICU_GROK_GENERATION_FEATURE,
          userId,
          enabled: true,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          createdAt: timestamp,
          updatedAt: timestamp
        }))
      )
      .onConflictDoUpdate({
        target: [generationFeatureGrants.feature, generationFeatureGrants.userId],
        set: {
          enabled: true,
          updatedBy: input.actorId,
          updatedAt: timestamp
        }
      });
  }
  return listMicuGrokAdminGrants(env);
}

function normalizeGenerationTargetId(value: string | null | undefined): GenerationTargetId {
  if (!value || value === DEFAULT_GENERATION_TARGET_ID) return DEFAULT_GENERATION_TARGET_ID;
  if (value === MICU_GROK_GENERATION_TARGET_ID) return MICU_GROK_GENERATION_TARGET_ID;
  throw appError("VALIDATION_ERROR", "Unknown generation target", { generationTargetId: value });
}

async function getDefaultGenerationTarget(
  env: AppBindings,
  userId: string
): Promise<GenerationTarget | null> {
  try {
    const resolved = await resolveDefaultProviderKeyGroupForUser(env, userId);
    return {
      id: DEFAULT_GENERATION_TARGET_ID,
      label: "默认生成",
      experimental: false,
      providerCapabilities: providerCapabilitiesFromResolvedGroup(resolved)
    };
  } catch (error) {
    if (!isAppError(error) || error.code !== "PROVIDER_ERROR") throw error;
    return null;
  }
}

async function getMicuGrokGenerationTarget(
  env: AppBindings,
  user: Pick<AuthUser, "id" | "role">
): Promise<GenerationTarget | null> {
  if (!(await canUseMicuGrokImage(env, user))) return null;
  try {
    const resolved = await resolveMicuGrokProviderKeyGroup(env);
    return {
      id: MICU_GROK_GENERATION_TARGET_ID,
      label: "米醋 Grok 图像",
      experimental: true,
      providerCapabilities: providerCapabilitiesFromResolvedGroup(resolved)
    };
  } catch (error) {
    if (!isAppError(error) || error.code !== "PROVIDER_ERROR") throw error;
    return null;
  }
}

async function resolveMicuGrokProviderKeyGroup(
  env: AppBindings
): Promise<ResolvedProviderKeyGroup> {
  const group = await getFirstEnabledGroupForProvider(env, MICU_GROK_PROVIDER_ID);
  if (!group) throw appError("PROVIDER_ERROR", "No Grok provider key group configured");
  const resolved = await resolveProviderKeyGroup(env, group.id);
  if (!resolved) throw appError("PROVIDER_ERROR", "No Grok provider key group configured");
  return resolved;
}

async function getFirstEnabledGroupForProvider(
  env: AppBindings,
  providerId: string
): Promise<ProviderKeyGroup | null> {
  const rows = await getDb(env)
    .select()
    .from(providerKeyGroups)
    .where(
      and(
        eq(providerKeyGroups.providerId, providerId),
        eq(providerKeyGroups.enabled, true),
        isNull(providerKeyGroups.deletedAt)
      )
    )
    .orderBy(asc(providerKeyGroups.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
