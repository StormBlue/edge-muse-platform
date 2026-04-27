import { base64ToBytes } from "../encoding";
import { appError } from "../errors";
import { logError, logInfo, logWarn, urlSummary } from "../log";
import { putImage } from "../r2";
import type { AppBindings, ImageAttachment } from "../../types";
import type { ProviderImage } from "../../providers/types";

/** 基64/URL 图从 provider 拉回时的重试次数与单次超时、指数退避（毫秒） */
const PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS = 6;
const PROVIDER_IMAGE_DOWNLOAD_ATTEMPT_TIMEOUT_MS = 30_000;
const PROVIDER_IMAGE_DOWNLOAD_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

/**
 * 将 provider 返回的 url/base64/bytes 统一 `putImage` 入库，并返回带 `/api/i/:id` 的 `ImageAttachment`。
 */
export async function persistProviderImage(
  env: AppBindings,
  input: { image: ProviderImage; ownerUserId: string; sessionId: string; taskId: string }
): Promise<ImageAttachment> {
  const baseFields = {
    taskId: input.taskId,
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    providerImage: providerImageSummary(input.image)
  };
  if (input.image.kind === "url") {
    logInfo("provider.image.download_started", {
      ...baseFields,
      sourceUrl: urlSummary(input.image.url),
      maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
      attemptTimeoutMs: PROVIDER_IMAGE_DOWNLOAD_ATTEMPT_TIMEOUT_MS
    });
    const downloaded = await downloadProviderImageWithRetry(input.image.url, baseFields);
    logInfo("provider.image.download_succeeded", {
      ...baseFields,
      sourceUrl: urlSummary(input.image.url),
      status: downloaded.status,
      mime: downloaded.mime,
      byteSize: downloaded.bytes.byteLength,
      attempts: downloaded.attempts,
      latencyMs: downloaded.latencyMs
    });
    return putImage(env, {
      ownerUserId: input.ownerUserId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      bytes: downloaded.bytes,
      mime: downloaded.mime
    });
  }
  if (input.image.kind === "base64") {
    const bytes = base64ToBytes(input.image.data);
    logInfo("provider.image.base64_decoded", {
      ...baseFields,
      mime: input.image.mime,
      byteSize: bytes.byteLength
    });
    return putImage(env, {
      ownerUserId: input.ownerUserId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      bytes,
      mime: input.image.mime
    });
  }
  logInfo("provider.image.bytes_ready", {
    ...baseFields,
    mime: input.image.mime,
    byteSize: input.image.bytes.byteLength
  });
  return putImage(env, {
    ownerUserId: input.ownerUserId,
    sessionId: input.sessionId,
    taskId: input.taskId,
    bytes: input.image.bytes,
    mime: input.image.mime
  });
}

type DownloadedProviderImage = {
  bytes: Uint8Array;
  mime: string;
  status: number;
  attempts: number;
  latencyMs: number;
};

/**
 * 供应商直链 URL 拉图：带超时、可重试状态码与指数退避，避免拖死整 task。
 */
async function downloadProviderImageWithRetry(
  url: string,
  logFields: Record<string, unknown>
): Promise<DownloadedProviderImage> {
  const totalStartedAt = Date.now();
  let lastMessage = "Provider image download failed";
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PROVIDER_IMAGE_DOWNLOAD_ATTEMPT_TIMEOUT_MS
    );
    try {
      logInfo("provider.image.download_attempt_started", {
        ...logFields,
        sourceUrl: urlSummary(url),
        attempt,
        maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS
      });
      const response = await fetch(url, {
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
          "User-Agent": "Edge-Muse-Platform/1.0"
        },
        signal: controller.signal
      });
      lastStatus = response.status;
      lastMessage = `Provider image download failed with HTTP ${response.status}`;
      if (!response.ok) {
        const retryable = isRetryableDownloadStatus(response.status);
        const nextDelayMs = retryable ? downloadBackoffDelayMs(attempt) : null;
        logWarn("provider.image.download_attempt_failed", {
          ...logFields,
          sourceUrl: urlSummary(url),
          attempt,
          maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
          status: response.status,
          statusText: response.statusText,
          retryable,
          nextDelayMs,
          latencyMs: Date.now() - attemptStartedAt
        });
        if (!retryable || nextDelayMs === null) break;
        await sleep(nextDelayMs);
        continue;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0) {
        lastMessage = "Provider image download returned an empty response";
        const nextDelayMs = downloadBackoffDelayMs(attempt);
        logWarn("provider.image.download_attempt_empty", {
          ...logFields,
          sourceUrl: urlSummary(url),
          attempt,
          maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
          status: response.status,
          nextDelayMs,
          latencyMs: Date.now() - attemptStartedAt
        });
        if (nextDelayMs === null) break;
        await sleep(nextDelayMs);
        continue;
      }

      logInfo("provider.image.download_attempt_succeeded", {
        ...logFields,
        sourceUrl: urlSummary(url),
        attempt,
        maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
        status: response.status,
        mime: response.headers.get("Content-Type") ?? "image/png",
        byteSize: bytes.byteLength,
        latencyMs: Date.now() - attemptStartedAt
      });
      return {
        bytes,
        mime: response.headers.get("Content-Type") ?? "image/png",
        status: response.status,
        attempts: attempt,
        latencyMs: Date.now() - totalStartedAt
      };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Provider image download failed";
      const nextDelayMs = downloadBackoffDelayMs(attempt);
      logError("provider.image.download_attempt_exception", error, {
        ...logFields,
        sourceUrl: urlSummary(url),
        attempt,
        maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
        retryable: nextDelayMs !== null,
        nextDelayMs,
        latencyMs: Date.now() - attemptStartedAt
      });
      if (nextDelayMs === null) break;
      await sleep(nextDelayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  logWarn("provider.image.download_failed", {
    ...logFields,
    sourceUrl: urlSummary(url),
    attempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
    lastStatus,
    message: lastMessage,
    latencyMs: Date.now() - totalStartedAt
  });
  throw appError(
    "PROVIDER_ERROR",
    `Provider image download failed after ${PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS} attempts`
  );
}

/** 简单策略：4xx/5xx 均可能重试（亦可能快速失败，由 attempt 上限约束） */
function isRetryableDownloadStatus(status: number): boolean {
  return status >= 400;
}

/** 结合随机抖动，降低惊群 */
function downloadBackoffDelayMs(attempt: number): number | null {
  if (attempt >= PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS) return null;
  const baseDelay = PROVIDER_IMAGE_DOWNLOAD_BACKOFF_MS[attempt - 1] ?? 16_000;
  return Math.round(baseDelay * (0.8 + Math.random() * 0.4));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 超大 raw JSON 不整包写入 DB，只记长度/截断标记 */
export function redactProviderResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const json = JSON.stringify(raw);
  if (json.length <= 16_384) return raw;
  return { truncated: true, length: json.length };
}

/** 日志用：统计一批 provider 返回里 url/base64/bytes 数量 */
export function providerImageKindCounts(images: ProviderImage[]): Record<string, number> {
  return images.reduce<Record<string, number>>((counts, image) => {
    counts[image.kind] = (counts[image.kind] ?? 0) + 1;
    return counts;
  }, {});
}

/** 避免把 URL/大段 base64 打进日志 */
export function providerImageSummary(image: ProviderImage): Record<string, unknown> {
  if (image.kind === "url") {
    return { kind: image.kind, url: urlSummary(image.url) };
  }
  if (image.kind === "base64") {
    return {
      kind: image.kind,
      mime: image.mime,
      base64Chars: image.data.length
    };
  }
  return {
    kind: image.kind,
    mime: image.mime,
    byteSize: image.bytes.byteLength
  };
}
