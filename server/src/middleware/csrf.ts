import { createMiddleware } from "hono/factory";
import { readCsrfCookie } from "../lib/cookies";
import { appError } from "../lib/errors";
import type { AppEnv } from "../types";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const csrf = createMiddleware<AppEnv>(async (c, next) => {
  if (safeMethods.has(c.req.method)) return next();
  const path = new URL(c.req.url).pathname;
  if (path === "/api/auth/login" || path === "/api/auth/refresh") {
    return next();
  }
  const header = c.req.header("X-CSRF-Token");
  const cookie = readCsrfCookie(c);
  if (!header || !cookie || header !== cookie) {
    throw appError("FORBIDDEN", "Invalid CSRF token");
  }
  return next();
});
