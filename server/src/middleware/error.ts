import { ZodError } from "zod";
import type { Hono } from "hono";
import { isAppError } from "../lib/errors";
import { logError, logWarn } from "../lib/log";
import type { AppEnv } from "../types";

export function installErrorHandling(app: Hono<AppEnv>) {
  app.onError((error, c) => {
    const traceId = c.get("traceId");
    const request = {
      traceId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      userId: c.get("user")?.id ?? null
    };
    if (isAppError(error)) {
      logWarn("error.app", {
        ...request,
        code: error.code,
        status: error.status,
        message: error.message,
        details: error.details ?? null
      });
      return c.json(error.toBody(), error.status);
    }
    if (error instanceof ZodError) {
      logWarn("error.validation", {
        ...request,
        status: 400,
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message
        }))
      });
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.flatten() }
        },
        400
      );
    }
    logError("error.unhandled", error, request);
    return c.json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500);
  });

  app.notFound((c) => {
    logWarn("http.not_found", {
      traceId: c.get("traceId"),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      userId: c.get("user")?.id ?? null
    });
    return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
  });
}
