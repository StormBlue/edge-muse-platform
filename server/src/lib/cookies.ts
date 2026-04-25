import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppContext } from "../types";

const accessCookie = "em_access";
const refreshCookie = "em_refresh";
const csrfCookie = "em_csrf";

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
  setCookie(c, accessCookie, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 15 * 60
  });
  setCookie(c, refreshCookie, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60
  });
  setCookie(c, csrfCookie, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60
  });
}

export function clearAuthCookies(c: AppContext) {
  deleteCookie(c, accessCookie, { path: "/" });
  deleteCookie(c, refreshCookie, { path: "/" });
  deleteCookie(c, csrfCookie, { path: "/" });
}
