import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const traceId = crypto.randomUUID();
  c.set("traceId", traceId);
  const startedAt = Date.now();
  await next();
  const latencyMs = Date.now() - startedAt;
  console.log(
    JSON.stringify({
      traceId,
      event: "http.request",
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      latencyMs,
      userId: c.get("user")?.id
    })
  );
});
