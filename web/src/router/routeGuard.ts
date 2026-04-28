/**
 * 路由守卫纯逻辑。
 *
 * `index.ts` 负责读取 Pinia 与 Cookie；这里只判断是否需要 bootstrap 和最终跳转结果，
 * 让登录态、角色权限、A/B 首页落点可以用单元测试稳定覆盖。
 */
import { homePath } from "./homePath";
import type { GenerationExperience } from "@/stores/auth";

export type RouteAccessRole = "admin" | "sysadmin";

export type RouteAccessTarget = {
  path: string;
  fullPath: string;
  meta: {
    public?: boolean;
    role?: RouteAccessRole;
  };
};

export type RouteAccessAuthState = {
  loaded: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSysadmin: boolean;
  generationExperience: Pick<GenerationExperience, "navTarget"> | null;
};

export function shouldBootstrapRoute(
  to: RouteAccessTarget,
  auth: Pick<RouteAccessAuthState, "loaded" | "isAuthenticated">,
  hasCsrfCookie: boolean
) {
  if (auth.loaded) return false;
  return !to.meta.public || auth.isAuthenticated || hasCsrfCookie;
}

export function routeAccessDecision(to: RouteAccessTarget, auth: RouteAccessAuthState) {
  if (!to.meta.public && !auth.isAuthenticated) {
    return `/login?redirect=${encodeURIComponent(to.fullPath)}`;
  }
  if (to.path === "/" || (to.path === "/login" && auth.isAuthenticated)) {
    return homePath(auth);
  }
  if (to.meta.role === "admin" && !auth.isAdmin) return "/403";
  if (to.meta.role === "sysadmin" && !auth.isSysadmin) return "/403";
  return true;
}
