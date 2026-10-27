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

/** 从外到内读取 Error 与 cause。Drizzle 把 D1 原文放在 cause，外层只写 Failed query。 */
function errorChain(error: unknown): string[] {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current) && parts.length < 6) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
      continue;
    }
    if (isMessageRecord(current)) {
      parts.push(current.message);
      current = current.cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  return parts;
}

function isMessageRecord(value: unknown): value is { message: string; cause?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

export function errorMessage(error: unknown): string {
  return errorChain(error).join("\n");
}

/**
 * 面向用户的失败文案。断连保留运行时原文；Drizzle 包装过的错误用内层 D1/SQLite 文本，不带 SQL 和参数。
 */
export function failureMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Generation failed";
  const messages = errorChain(error);
  const disconnected = messages.find((message) =>
    message.toLowerCase().includes("network connection lost")
  );
  if (disconnected) return disconnected;
  if (error.message.startsWith("Failed query:")) {
    const inner = [...messages].reverse().find((message) => !message.startsWith("Failed query:"));
    if (inner) return inner;
  }
  return error.message;
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
  const causes = errorChain(error).slice(1);
  if (causes.length > 0) summary.cause = causes.join("\n");
  return summary;
}

export function defaultBindingSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
