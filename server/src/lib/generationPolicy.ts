import { appError } from "./errors";
import type { SessionMode, UserRole } from "../types";

export const DEFAULT_IMAGE_COUNT = 1;
export const MAX_SYSADMIN_IMAGE_COUNT = 100;

export function isSingleActiveGenerationRole(role: UserRole): boolean {
  return role !== "sysadmin";
}

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

export function resolveImageCountForRole(
  role: UserRole,
  mode: SessionMode,
  requestedCount: number
): number {
  assertImageCountAllowed(role, requestedCount);
  return mode === "chat" ? DEFAULT_IMAGE_COUNT : requestedCount;
}
