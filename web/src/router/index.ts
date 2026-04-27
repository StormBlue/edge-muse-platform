/**
 * 前端路由：meta.public 跳过登录；meta.role 要求 admin/sysadmin 能力（与 `auth` store getters 对应）。
 * `beforeEach`：先 `bootstrap` 拉 `/api/me`（有 CSRF cookie 的公开页也会拉取以恢复会话）。
 */
import { createRouter, createWebHistory } from "vue-router";
import { getCookie } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/workspace" },
    // 公开：无需已登录；其余默认需鉴权
    { path: "/login", component: () => import("@/views/auth/Login.vue"), meta: { public: true } },
    { path: "/workspace", component: () => import("@/views/workspace/Workspace.vue") },
    { path: "/workspace/s/:sessionId", component: () => import("@/views/workspace/Workspace.vue") },
    { path: "/history", component: () => import("@/views/history/History.vue") },
    { path: "/settings/profile", component: () => import("@/views/settings/Profile.vue") },
    { path: "/settings/security", component: () => import("@/views/settings/Security.vue") },
    { path: "/admin", redirect: "/admin/users" },
    // 租户管理：admin 或 sysadmin 均可（`meta.role: admin` 在守卫里用 isAdmin）
    {
      path: "/admin/users",
      component: () => import("@/views/admin/UserList.vue"),
      meta: { role: "admin" }
    },
    { path: "/sysadmin", redirect: "/sysadmin/dashboard" },
    // 仅 sysadmin
    {
      path: "/sysadmin/dashboard",
      component: () => import("@/views/sysadmin/Dashboard.vue"),
      meta: { role: "sysadmin" }
    },
    // 服务商已改为内置目录，不再提供单独管理页；旧链接统一进入密钥管理。
    { path: "/sysadmin/providers", redirect: "/sysadmin/keys", meta: { role: "sysadmin" } },
    {
      path: "/sysadmin/keys",
      component: () => import("@/views/sysadmin/Keys.vue"),
      meta: { role: "sysadmin" }
    },
    {
      path: "/sysadmin/admins",
      redirect: { path: "/admin/users", query: { role: "admin" } },
      meta: { role: "sysadmin" }
    },
    {
      path: "/sysadmin/preferences",
      component: () => import("@/views/sysadmin/Preferences.vue"),
      meta: { role: "sysadmin" }
    },
    {
      path: "/sysadmin/users/:userId/sessions",
      component: () => import("@/views/sysadmin/UserSessions.vue"),
      meta: { role: "sysadmin" }
    },
    { path: "/403", component: () => import("@/views/Forbidden.vue"), meta: { public: true } },
    {
      path: "/:pathMatch(.*)*",
      component: () => import("@/views/NotFound.vue"),
      meta: { public: true }
    }
  ]
});

/** 全局前置守卫：未登录重定向到 `/login?redirect=`；已登录访问 `/login` 进工作台；角色不足进 `/403` */
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) {
    // 有 CSRF 的公开页也 bootstrap：可能已带会话 Cookie，避免误判未登录
    if (!to.meta.public || auth.isAuthenticated || getCookie("em_csrf")) {
      await auth.bootstrap();
    } else {
      auth.loaded = true;
    }
  }
  if (!to.meta.public && !auth.isAuthenticated)
    return `/login?redirect=${encodeURIComponent(to.fullPath)}`;
  if (to.path === "/login" && auth.isAuthenticated) return "/workspace";
  if (to.meta.role === "admin" && !auth.isAdmin) return "/403";
  if (to.meta.role === "sysadmin" && !auth.isSysadmin) return "/403";
  return true;
});

export default router;
