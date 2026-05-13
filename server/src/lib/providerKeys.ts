/**
 * Provider key 解析与能力快照。
 *
 * 生图任务、`/api/me`、登录/刷新都需要知道“当前用户实际会使用哪把密钥”。
 * 这里把解析顺序集中起来，避免前端能力提示和任务执行走出两套规则。
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { providerKeys, userProviderKeys, users, type ProviderKey } from "../db/schema";
import { isProviderKeyAssignable } from "../providers/catalog";
import { appError } from "./errors";
import type { AppBindings } from "../types";

export { getProviderCapabilitiesForUser, type ProviderCapabilities } from "./providerKeyGroups";

/**
 * 为任务解析实际使用的 `provider_keys` 行：优先用户偏好的 key →
 * `user_provider_keys` 绑定；无人显式配置时报错。
 *
 * 这里刻意不再做“全局最新启用 key”兜底，避免 sysadmin 新增 Cubence key 后，
 * 未绑定用户被动切到新服务商，破坏灰度和既有米醋 API 分配策略。
 */
export async function resolveProviderKey(env: AppBindings, userId: string) {
  const db = getDb(env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.preferredProviderKeyId) {
    const preferred = await db.query.providerKeys.findFirst({
      where: and(
        eq(providerKeys.id, user.preferredProviderKeyId),
        eq(providerKeys.enabled, true),
        isNull(providerKeys.deletedAt)
      )
    });
    if (preferred) return preferred;
  }
  const assigned = await db.query.userProviderKeys.findFirst({
    where: eq(userProviderKeys.userId, userId)
  });
  const keyId = assigned?.providerKeyId;
  if (keyId) {
    const key = await db.query.providerKeys.findFirst({
      where: and(
        eq(providerKeys.id, keyId),
        eq(providerKeys.enabled, true),
        isNull(providerKeys.deletedAt)
      )
    });
    if (key) return key;
  }
  return selectResolvedProviderKey(null, null);
}

/**
 * 纯选择函数用于单元测试固定解析策略：只接受“用户偏好”或“用户绑定”的 key，
 * 不接收全局 fallback，防止后续改造重新引入跨服务商隐式切换。
 */
export function selectResolvedProviderKey(
  preferred: ProviderKey | null | undefined,
  assigned: ProviderKey | null | undefined
): ProviderKey {
  if (preferred) return preferred;
  if (assigned) return assigned;
  throw appError("PROVIDER_ERROR", "No provider key configured");
}

type AssignableProviderKeyCandidate = Pick<ProviderKey, "providerId" | "enabled" | "deletedAt">;

/** 校验 provider key 存在、启用、未删除后，还必须属于当前产品允许分配的内置 provider。 */
export function assertAssignableProviderKey<T extends AssignableProviderKeyCandidate>(
  key: T | null | undefined
): asserts key is T {
  if (!key || !key.enabled || key.deletedAt !== null) {
    throw appError("NOT_FOUND", "Provider key not found");
  }
  if (!isProviderKeyAssignable(key.providerId)) {
    throw appError("VALIDATION_ERROR", "Unsupported provider key");
  }
}

/** 所有 providerKeyId 写入路径统一走这里，避免旧 provider key 绕过密钥页限制继续分配。 */
export async function getAssignableProviderKey(env: AppBindings, providerKeyId: string) {
  const key = await getDb(env).query.providerKeys.findFirst({
    where: eq(providerKeys.id, providerKeyId)
  });
  assertAssignableProviderKey(key);
  return key;
}
