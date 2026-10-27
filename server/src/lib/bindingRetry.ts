/**
 * Workers 把 KJ `DISCONNECTED` 翻译成 `Network connection lost.`，并在错误上标记 retryable。
 * 官方要求捕获这次绑定调用再重试，而不是重新调用上游。
 *
 * 次数与退避对齐 D1「Retry queries」：最多 5 次，指数退避加抖动。
 * https://developers.cloudflare.com/workers/observability/errors/
 * https://developers.cloudflare.com/d1/best-practices/retry-queries/
 */
import { errorSummary, type LogFields } from "./log";

export const TRANSIENT_BINDING_ATTEMPTS = 5;

const D1_TRANSIENT_ERRORS = [
  "network connection lost",
  "storage caused object to be reset",
  "reset because its code was updated"
];

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Workers 运行时错误表中的绑定/fetch 断连。 */
export function isTransientBindingDisconnect(error: unknown): boolean {
  return errorMessage(error).toLowerCase().includes("network connection lost");
}

/** D1 写查询文档列出的可重试错误，包含同一句断连。 */
export function isRetryableD1WriteError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return D1_TRANSIENT_ERRORS.some((fragment) => message.includes(fragment));
}

export function isImageRowConflict(error: unknown): boolean {
  return /unique constraint failed: image_objects\.(id|r2_key)/i.test(errorMessage(error));
}

/**
 * 第 `failedAttempts` 次失败后的等待。基数 100ms，上限 800ms，抖动落在区间的 50%–100%。
 * `failedAttempts` 从 1 计，第 5 次失败不再等待。
 */
export function transientBindingRetryDelayMs(
  failedAttempts: number,
  random: () => number = Math.random
): number {
  const exponent = Math.max(0, failedAttempts - 1);
  const ceiling = Math.min(800, 100 * 2 ** exponent);
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

export function bindingErrorLog(error: unknown): LogFields {
  const summary = errorSummary(error);
  if (error && typeof error === "object" && "retryable" in error) {
    summary.retryable = (error as { retryable?: unknown }).retryable === true;
  }
  return summary;
}

export function defaultBindingSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
