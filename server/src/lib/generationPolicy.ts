/**
 * 生图张数、并发单任务等**产品策略**（与 docs「仅 sysadmin 可调张数」等对齐）。
 * `chat` 模式强制单张，避免与对话接口语义混淆。
 */
import { appError } from "./errors";
import type { SessionMode, UserRole } from "../types";

/** 普通用户与 chat 模式下的固定张数 */
export const DEFAULT_IMAGE_COUNT = 1;
/** sysadmin 单次任务允许的最大 n（与 zod、settings 上限一致） */
export const MAX_SYSADMIN_IMAGE_COUNT = 100;

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

/**
 * 路由层与任务层共用的张数解析：普通用户 n 在 assert 后原样；chat 恒为 1。
 */
export function resolveImageCountForRole(
  role: UserRole,
  mode: SessionMode,
  requestedCount: number
): number {
  assertImageCountAllowed(role, requestedCount);
  // 多轮对话：每轮只出 1 张，与 UI/接口语义一致
  return mode === "chat" ? DEFAULT_IMAGE_COUNT : requestedCount;
}
