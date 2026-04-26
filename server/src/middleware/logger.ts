import { createMiddleware } from "hono/factory";
import { logError, logInfo } from "../lib/log";
import type { AppEnv } from "../types";

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
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
    logError("http.request.threw", error, {
      ...requestFields,
      latencyMs: Date.now() - startedAt,
      userId: c.get("user")?.id ?? null
    });
    throw error;
  } finally {
    const latencyMs = Date.now() - startedAt;
    logInfo("http.request.finished", {
      ...requestFields,
      status: c.res.status,
      latencyMs,
      userId: c.get("user")?.id ?? null
    });
  }
});
