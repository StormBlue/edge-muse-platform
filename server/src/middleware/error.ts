/**
 * 全局 onError：AppError / ZodError / 未捕获异常 分支处理；并注册 404 JSON 体。
 * 所有分支打结构化日志（含 traceId、path、userId），避免把 Zod 细节泄露到 500。
 */
import { ZodError } from "zod";
import type { Hono } from "hono";
import { isAppError } from "../lib/errors";
import { logError, logWarn } from "../lib/log";
import type { AppEnv } from "../types";

export function installErrorHandling(app: Hono<AppEnv>) {
  // 业务错误：原样 HTTP 状态 + toBody
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
    // 校验器：flatten 细节进 body，HTTP 400
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
    // 其它异常：打堆栈，对外统一 500
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
