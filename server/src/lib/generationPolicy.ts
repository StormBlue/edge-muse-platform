/**
 * 生图张数等**产品策略**（与 docs「仅 sysadmin 可调张数」等对齐）。
 */
import { appError } from "./errors";
import type { SessionMode, UserRole } from "../types";

/** 普通用户固定张数 */
export const DEFAULT_IMAGE_COUNT = 1;
/** sysadmin 单次任务允许的最大 n（与 zod、settings 上限一致） */
export const MAX_SYSADMIN_IMAGE_COUNT = 200;

/** 非 sysadmin 时同一用户同时只能有一个 queued/running 任务（与 tasks 中 assertNoActiveGenerationTask 配合） */
export function isSingleActiveGenerationRole(role: UserRole): boolean {
  return role !== "sysadmin";
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
