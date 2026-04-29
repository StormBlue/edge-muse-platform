/**
 * 在 `await next()` 之后追加响应头，避免影响上游状态码/Content-Type 判定。
 * - **nosniff**：减 MIME 嗅探攻击面；
 * - **DENY / frame-ancestors**：禁嵌 iframe；
 * - **CSP**：允许 Turnstile 脚本与 iframe、同域 API 与 `ws/wss` 生图长连；
 * - **HSTS**：仅 production，强跳 HTTPS。
 */
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  const path = new URL(c.req.url).pathname;
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", contentSecurityPolicy(path));
  if (c.env.ENVIRONMENT === "production") {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
});

function contentSecurityPolicy(path: string) {
  if (path === "/api/docs") {
    return [
      "default-src 'self'",
      "img-src 'self' data: blob: https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "frame-src https://challenges.cloudflare.com",
      "connect-src 'self' https://challenges.cloudflare.com ws: wss:",
      "frame-ancestors 'none'"
    ].join("; ");
  }

  return [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "connect-src 'self' https://challenges.cloudflare.com ws: wss:",
    "frame-ancestors 'none'"
  ].join("; ");
}
