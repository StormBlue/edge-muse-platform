/**
 * 为每个请求生成 `traceId`（优先 CF-Ray）并记录耗时；下游通过 `c.get("traceId")` 打业务日志。
 */
import { createMiddleware } from "hono/factory";
import { logError, logInfo } from "../lib/log";
import type { AppEnv } from "../types";

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  // 边缘上优先用 CF-Ray 与 Worker 日志对齐；本地无则随机 UUID
  const cfRay = c.req.header("CF-Ray") ?? null;
  const traceId = cfRay ?? crypto.randomUUID();
  c.set("traceId", traceId);
  const startedAt = Date.now();
  const url = new URL(c.req.url);
  const requestFields = {
    traceId,
    method: c.req.method,
    path: url.pathname,
    queryPresent: url.search.length > 0,
    cfRay,
    userAgent: c.req.header("User-Agent") ?? null
  };
  try {
    await next();
  } catch (error) {
    // 异常路径单独打堆栈，再原样抛出给 onError
    logError("http.request.threw", error, {
      ...requestFields,
      latencyMs: Date.now() - startedAt,
      userId: c.get("user")?.id ?? null
    });
    throw error;
  } finally {
    // 含 4xx/5xx 与鉴权后 userId，便于按请求关联业务日志
    const latencyMs = Date.now() - startedAt;
    logInfo("http.request.finished", {
      ...requestFields,
      status: c.res.status,
      latencyMs,
      userId: c.get("user")?.id ?? null
    });
  }
});
