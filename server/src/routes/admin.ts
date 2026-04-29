/**
 * 租户管理员 API（`/api/admin/*`）入口：
 * - `requireRole("admin")`：含 admin 与 sysadmin；
 * - 非 sysadmin 时只能管理自己挂名的下属，sysadmin 可跨租户查看 admin/user；
 * - 具体业务按 provider key 与用户管理拆到 `routes/admin/`。
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import type { AppEnv } from "../types";
import { registerAdminProviderKeyRoutes } from "./admin/providerKeys";
import { registerAdminUserRoutes } from "./admin/users";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", requireAuth, requireRole("admin"));

registerAdminProviderKeyRoutes(adminRoutes);
registerAdminUserRoutes(adminRoutes);
