/**
 * 双提交 Cookie 模式：非安全方法要求 `X-CSRF-Token` 与 Cookie `em_csrf` **字节级一致**。
 * 登录/刷新除外：此时可能尚未下发 CSRF，或浏览器对预检/Cookie 组合有限制。
 * 仅保护 `/api/*` 已挂本中间件的路由；静态资源不走此校验。
 */
import { createMiddleware } from "hono/factory";
import { readCsrfCookie } from "../lib/cookies";
import { appError } from "../lib/errors";
import type { AppEnv } from "../types";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const csrf = createMiddleware<AppEnv>(async (c, next) => {
  if (safeMethods.has(c.req.method)) return next();
  const path = new URL(c.req.url).pathname;
  // 登录与 refresh 在 set-cookie 前后客户端可能尚未带齐双票，放行
  if (path === "/api/auth/login" || path === "/api/auth/refresh") {
    return next();
  }
  const header = c.req.header("X-CSRF-Token");
  const cookie = readCsrfCookie(c);
  // 防简单请求伪造：须同时知道 Cookie 与自定义头（第三方站读不到同站 Cookie）
  if (!header || !cookie || header !== cookie) {
    throw appError("FORBIDDEN", "Invalid CSRF token");
  }
  return next();
});
