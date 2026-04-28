/**
 * 生成体验实验的适用范围判断。
 *
 * scope 由 sysadmin 在 JSON 文本框中配置。MVP 保持简单可审计：
 * - `{}` 或 `{"mode":"all"}`：全部非 sysadmin 用户。
 * - `{"userIds":["usr_1"]}` 或 `{"includeUserIds":["usr_1"]}`：指定用户白名单。
 * - `{"adminIds":["adm_1"]}` 或 `{"ownerAdminIds":["adm_1"]}`：指定 admin 创建的用户。
 * - `{"excludeUserIds":["usr_2"]}`：在上述范围中排除指定用户。
 */
import type { AuthUser } from "../types";

export type ExperimentScopeSubject = Pick<AuthUser, "id" | "role"> & {
  createdBy?: string | null;
};

export type GenerationExperimentScope = {
  mode?: "all" | "user_whitelist" | "admin_users" | "off";
  userIds?: string[];
  includeUserIds?: string[];
  adminIds?: string[];
  ownerAdminIds?: string[];
  excludeUserIds?: string[];
};

export function isInGenerationExperimentScope(
  scope: Record<string, unknown>,
  user: ExperimentScopeSubject
) {
  if (user.role === "sysadmin") return false;
  const normalized = normalizeGenerationExperimentScope(scope);
  if (normalized.excludeUserIds.includes(user.id)) return false;
  if (normalized.mode === "off") return false;
  if (normalized.mode === "all") return true;
  if (normalized.userIds.includes(user.id)) return true;
  if (user.createdBy && normalized.adminIds.includes(user.createdBy)) return true;
  return false;
}

export function normalizeGenerationExperimentScope(
  value: Record<string, unknown>
): Required<GenerationExperimentScope> {
  const userIds = uniqueStrings([
    ...arrayOfStrings(value.userIds),
    ...arrayOfStrings(value.includeUserIds)
  ]);
  const adminIds = uniqueStrings([
    ...arrayOfStrings(value.adminIds),
    ...arrayOfStrings(value.ownerAdminIds)
  ]);
  const mode = parseScopeMode(value.mode, userIds, adminIds);
  return {
    mode,
    userIds,
    includeUserIds: userIds,
    adminIds,
    ownerAdminIds: adminIds,
    excludeUserIds: uniqueStrings(arrayOfStrings(value.excludeUserIds))
  };
}

function parseScopeMode(
  value: unknown,
  userIds: string[],
  adminIds: string[]
): Required<GenerationExperimentScope>["mode"] {
  if (value === "off") return "off";
  if (value === "user_whitelist") return "user_whitelist";
  if (value === "admin_users") return "admin_users";
  if (value === "all") return "all";
  if (userIds.length || adminIds.length) return "user_whitelist";
  return "all";
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function uniqueStrings(value: string[]) {
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}
