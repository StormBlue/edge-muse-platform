/**
 * 生图张数等**产品策略**（与 docs「仅 sysadmin 可调张数」等对齐）。
 */
import { appError } from "./errors";
import type { SessionMode, UserRole } from "../types";

/** 普通用户固定张数 */
export const DEFAULT_IMAGE_COUNT = 1;
/** sysadmin 单次任务允许的最大 n（与 zod、settings 上限一致） */
export const MAX_SYSADMIN_IMAGE_COUNT = 200;
/** admin 默认/最大同时 queued+running 任务数 */
export const DEFAULT_ADMIN_CONCURRENT_TASKS = 10;
export const MAX_ADMIN_CONCURRENT_TASKS = 15;
/** 普通用户默认/最大同时 queued+running 任务数 */
export const DEFAULT_USER_CONCURRENT_TASKS = 5;
export const MAX_USER_CONCURRENT_TASKS = 10;

/**
 * 旧策略兼容函数：非 sysadmin 仍需要用户级 active task 限制，但不再固定为 1。
 * 新代码应优先使用 `resolveMaxConcurrentTasksForRole`。
 */
export function isSingleActiveGenerationRole(role: UserRole): boolean {
  return role !== "sysadmin";
}

export function defaultMaxConcurrentTasksForRole(role: UserRole): number | null {
  if (role === "sysadmin") return null;
  if (role === "admin") return DEFAULT_ADMIN_CONCURRENT_TASKS;
  return DEFAULT_USER_CONCURRENT_TASKS;
}

export function maxConfigurableConcurrentTasksForRole(role: UserRole): number | null {
  if (role === "sysadmin") return null;
  if (role === "admin") return MAX_ADMIN_CONCURRENT_TASKS;
  return MAX_USER_CONCURRENT_TASKS;
}

export function resolveMaxConcurrentTasksForRole(
  role: UserRole,
  configured: number | null | undefined
): number | null {
  const fallback = defaultMaxConcurrentTasksForRole(role);
  const max = maxConfigurableConcurrentTasksForRole(role);
  if (fallback === null || max === null) return null;
  if (configured === null || configured === undefined) return fallback;
  if (!Number.isInteger(configured) || configured < 1) return fallback;
  return Math.min(configured, max);
}

export function assertMaxConcurrentTasksConfigAllowed(role: UserRole, value: number): void {
  const max = maxConfigurableConcurrentTasksForRole(role);
  if (max === null) return;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw appError("VALIDATION_ERROR", `Max concurrent tasks must be between 1 and ${max}`);
  }
}

/** 校验 n 在 [1, MAX] 内，且非 sysadmin 只能为 1 */
export function assertImageCountAllowed(role: UserRole, count: number): void {
  if (!Number.isInteger(count) || count < DEFAULT_IMAGE_COUNT || count > MAX_SYSADMIN_IMAGE_COUNT) {
    throw appError(
      "VALIDATION_ERROR",
      `Image count must be between ${DEFAULT_IMAGE_COUNT} and ${MAX_SYSADMIN_IMAGE_COUNT}`
    );
  }
  if (role !== "sysadmin" && count !== DEFAULT_IMAGE_COUNT) {
    throw appError("VALIDATION_ERROR", "Only system administrators can customize image count");
  }
}

/** 路由层与任务层共用的张数解析。 */
export function resolveImageCountForRole(
  role: UserRole,
  _mode: SessionMode,
  requestedCount: number
): number {
  assertImageCountAllowed(role, requestedCount);
  return requestedCount;
}
