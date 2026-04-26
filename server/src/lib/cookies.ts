import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppContext } from "../types";

const accessCookie = "em_access";
const refreshCookie = "em_refresh";
const csrfCookie = "em_csrf";

function getCookieDomain(c: AppContext): string | undefined {
  if (c.env.ENVIRONMENT === "dev") return undefined;
  const hostname = new URL(c.req.url).hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname.includes(".") || hostname === "localhost" || hostname.includes(":"))
    return undefined;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return undefined;
  return hostname.startsWith("www.") ? hostname.slice("www.".length) : hostname;
}

function clearHostOnlyAuthCookies(c: AppContext) {
  deleteCookie(c, accessCookie, { path: "/" });
  deleteCookie(c, refreshCookie, { path: "/" });
  deleteCookie(c, csrfCookie, { path: "/" });
}

export function readAccessToken(c: AppContext): string | undefined {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return getCookie(c, accessCookie);
}

export function readRefreshToken(c: AppContext): string | undefined {
  return getCookie(c, refreshCookie);
}

export function readCsrfCookie(c: AppContext): string | undefined {
  return getCookie(c, csrfCookie);
}

export function setAuthCookies(
  c: AppContext,
  accessToken: string,
  refreshToken: string,
  csrfToken: string
) {
  const secure = c.env.ENVIRONMENT !== "dev";
  const domain = getCookieDomain(c);
  if (domain) {
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

export function clearAuthCookies(c: AppContext) {
  const domain = getCookieDomain(c);
  clearHostOnlyAuthCookies(c);
  if (!domain) return;
  deleteCookie(c, accessCookie, { path: "/", domain });
  deleteCookie(c, refreshCookie, { path: "/", domain });
  deleteCookie(c, csrfCookie, { path: "/", domain });
}
