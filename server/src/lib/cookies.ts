/**
 * 认证与 CSRF 相关 Cookie：
 * - access/refresh：httpOnly，供服务端读；前端主要用 `Authorization: Bearer` 或依赖 Cookie 同域发送。
 * - `em_csrf`：非 httpOnly，供浏览器 JS 读并填 `X-CSRF-Token`；与 `middleware/csrf` 配对防跨站非 GET。
 * 生产环境可设 `Domain` 以便子域共享，先清除 host-only 旧 Cookie 防重复。
 */
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppContext } from "../types";

const accessCookie = "em_access";
const refreshCookie = "em_refresh";
/** 非 httpOnly，供 `api/client` 读并塞 `X-CSRF-Token` */
const csrfCookie = "em_csrf";

/**
 * 生产环境为「可抽顶级域」的 hostname 设 `Domain=example.com`，使子域共享登录态。
 * 裸 IP、localhost、IPv4 不设，否则部分浏览器会拒绝 Set-Cookie。
 */
function getCookieDomain(c: AppContext): string | undefined {
  if (c.env.ENVIRONMENT === "dev") return undefined;
  const hostname = new URL(c.req.url).hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname.includes(".") || hostname === "localhost" || hostname.includes(":"))
    return undefined;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return undefined;
  return hostname.startsWith("www.") ? hostname.slice("www.".length) : hostname;
}

/** 无 domain 的删法，与「只设过 host-only」的旧 Cookie 对齐 */
function clearHostOnlyAuthCookies(c: AppContext) {
  deleteCookie(c, accessCookie, { path: "/" });
  deleteCookie(c, refreshCookie, { path: "/" });
  deleteCookie(c, csrfCookie, { path: "/" });
}

/** 优先读 `Authorization: Bearer`，否则读 `em_access` Cookie */
export function readAccessToken(c: AppContext): string | undefined {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return getCookie(c, accessCookie);
}

/** 刷新会话专用，仅在 `/api/auth/refresh` 等路由使用 */
export function readRefreshToken(c: AppContext): string | undefined {
  return getCookie(c, refreshCookie);
}

/** CSRF 双提交：与请求头中 token 比对 */
export function readCsrfCookie(c: AppContext): string | undefined {
  return getCookie(c, csrfCookie);
}

/** 登录成功：写三枚 Cookie，access 15min、refresh/csrf 7d */
export function setAuthCookies(
  c: AppContext,
  accessToken: string,
  refreshToken: string,
  csrfToken: string
) {
  const secure = c.env.ENVIRONMENT !== "dev";
  const domain = getCookieDomain(c);
  if (domain) {
    // 从 host-only 迁到带 Domain 时，先清旧键再写，防同一响应里出现两条同名不同域
    clearHostOnlyAuthCookies(c);
  }
  setCookie(c, accessCookie, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    domain,
    maxAge: 15 * 60
  });
  setCookie(c, refreshCookie, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    domain,
    maxAge: 7 * 24 * 60 * 60
  });
  setCookie(c, csrfCookie, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "Lax",
    path: "/",
    domain,
    maxAge: 7 * 24 * 60 * 60
  });
}

/** 登出：清 host + domain 两类路径，避免残留 */
export function clearAuthCookies(c: AppContext) {
  const domain = getCookieDomain(c);
  clearHostOnlyAuthCookies(c);
  if (!domain) return;
  deleteCookie(c, accessCookie, { path: "/", domain });
  deleteCookie(c, refreshCookie, { path: "/", domain });
  deleteCookie(c, csrfCookie, { path: "/", domain });
}
