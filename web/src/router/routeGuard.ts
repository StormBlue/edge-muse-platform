/**
 * 路由守卫纯逻辑。
 *
 * `index.ts` 负责读取 Pinia 与 Cookie；这里只判断是否需要 bootstrap 和最终跳转结果，
 * 让登录态、角色权限、默认首页落点可以用单元测试稳定覆盖。
 */
import { homePath } from "./homePath";
import type { GenerationEntry } from "@/api/generation";

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
  generationEntry: GenerationEntry | null;
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
  if (!auth.isSysadmin && auth.generationEntry) {
    if (to.path.startsWith("/ai-image") && !auth.generationEntry.showAiImage) {
      return auth.generationEntry.navTarget;
    }
    if (to.path.startsWith("/workspace") && !auth.generationEntry.showWorkspace) {
      return auth.generationEntry.navTarget;
    }
  }
  return true;
}
