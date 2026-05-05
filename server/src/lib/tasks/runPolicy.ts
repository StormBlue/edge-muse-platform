import { now } from "../id";
import { redactProviderResponse } from "./providerImages";
import { MICU_REQUEST_FORMAT, resolveMicuParallelGenerations } from "../../providers/micuPolicy";
import type { GenerationFailure } from "./types";
import type { GenerateParams, UserRole } from "../../types";

/** 普通用户多图并发槽；过大易打满 provider 速率。 */
const DEFAULT_PARALLEL_GENERATIONS = 4;
/** sysadmin 可提高并发，仍受单任务 n 上限约束。 */
const SYSADMIN_PARALLEL_GENERATIONS = 10;

export function resolveParallelGenerationsForRole(
  role: UserRole,
  provider?: { requestFormat: string; model: string; mode: GenerateParams["mode"]; size: string }
): number {
  const roleLimit =
    role === "sysadmin" ? SYSADMIN_PARALLEL_GENERATIONS : DEFAULT_PARALLEL_GENERATIONS;
  if (provider?.requestFormat === MICU_REQUEST_FORMAT) {
    return Math.min(roleLimit, resolveMicuParallelGenerations(provider.model, provider.size));
  }
  return roleLimit;
}

/** 将单次 generate 或 persist 异常转为可序列化进 `provider_raw_response` 的失败项。 */
export function generationFailureFromError(
  index: number,
  error: unknown,
  phase: GenerationFailure["phase"]
): GenerationFailure {
  const code =
    error && typeof error === "object" && "code" in error ? String(error.code) : "PROVIDER_ERROR";
  const message = error instanceof Error ? error.message : "Generation failed";
  const raw =
    error && typeof error === "object" && "body" in error
      ? redactProviderResponse((error as { body?: unknown }).body)
      : undefined;
  return {
    type: "generation_failure",
    index,
    code,
    message,
    phase,
    createdAt: now(),
    ...(raw ? { raw } : {})
  };
}

/** 多图部分失败时拼成一条 assistant 可读错误文案。 */
export function summarizeGenerationFailures(failures: GenerationFailure[]): string | null {
  if (failures.length === 0) return null;
  return failures
    .map((failure) => `#${failure.index + 1} ${failure.code}: ${failure.message}`)
    .join("\n");
}
