import { createRouter, createWebHistory } from "vue-router";
import { getCookie } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/workspace" },
    { path: "/login", component: () => import("@/views/auth/Login.vue"), meta: { public: true } },
    { path: "/workspace", component: () => import("@/views/workspace/Workspace.vue") },
    { path: "/workspace/s/:sessionId", component: () => import("@/views/workspace/Workspace.vue") },
    { path: "/history", component: () => import("@/views/history/History.vue") },
    { path: "/settings/profile", component: () => import("@/views/settings/Profile.vue") },
    { path: "/settings/security", component: () => import("@/views/settings/Security.vue") },
    { path: "/admin", redirect: "/admin/users" },
    {
      path: "/admin/users",
      component: () => import("@/views/admin/UserList.vue"),
      meta: { role: "admin" }
    },
    { path: "/sysadmin", redirect: "/sysadmin/dashboard" },
    {
      path: "/sysadmin/dashboard",
      component: () => import("@/views/sysadmin/Dashboard.vue"),
      meta: { role: "sysadmin" }
    },
    {
      path: "/sysadmin/providers",
      component: () => import("@/views/sysadmin/Providers.vue"),
      meta: { role: "sysadmin" }
    },
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

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) {
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
