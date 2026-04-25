import { ZodError } from "zod";
import type { Hono } from "hono";
import { isAppError } from "../lib/errors";
import type { AppEnv } from "../types";

export function installErrorHandling(app: Hono<AppEnv>) {
  app.onError((error, c) => {
    const traceId = c.get("traceId");
    if (isAppError(error)) return c.json(error.toBody(), error.status);
    if (error instanceof ZodError) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.flatten() }
        },
        400
      );
    }
    console.error(
      JSON.stringify({ traceId, event: "error.unhandled", message: String(error), error })
    );
    return c.json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));
}
