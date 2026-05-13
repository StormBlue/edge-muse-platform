/**
 * 系统管理员 API（`/api/sysadmin/*`）入口：
 * - 全路由 `requireAuth` + `requireRole("sysadmin")`，可跨租户读配置、任意用户数据（巡查）；
 * - 具体业务按 provider/key/admin/dashboard/user/session/preference 拆到 `routes/sysadmin/`；
 * - 子模块仍在同一个 Hono 实例上注册，外部路径和响应结构保持不变。
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import type { AppEnv } from "../types";
import { registerSysadminAdminRoutes } from "./sysadmin/admins";
import { registerSysadminAnnouncementRoutes } from "./sysadmin/announcements";
import { registerSysadminAuditSessionRoutes } from "./sysadmin/auditSessions";
import { registerSysadminDashboardRoutes } from "./sysadmin/dashboard";
import { registerSysadminGenerationEntryRoutes } from "./sysadmin/generationEntry";
import { registerSysadminKeyGroupRoutes } from "./sysadmin/keyGroups";
import { registerSysadminPreferenceRoutes } from "./sysadmin/preferences";
import { registerSysadminPromptCaseRoutes } from "./sysadmin/promptCases";
import { registerSysadminProviderKeyRoutes } from "./sysadmin/providerKeys";
import { registerSysadminProviderRoutes } from "./sysadmin/providers";
import { registerSysadminUserRoutes } from "./sysadmin/users";

export const sysadminRoutes = new Hono<AppEnv>();

// 仅 sysadmin；与 admin 路由组（租户管理员）权限模型不同。
sysadminRoutes.use("*", requireAuth, requireRole("sysadmin"));

registerSysadminProviderRoutes(sysadminRoutes);
registerSysadminProviderKeyRoutes(sysadminRoutes);
registerSysadminKeyGroupRoutes(sysadminRoutes);
registerSysadminAdminRoutes(sysadminRoutes);
registerSysadminDashboardRoutes(sysadminRoutes);
registerSysadminUserRoutes(sysadminRoutes);
registerSysadminAuditSessionRoutes(sysadminRoutes);
registerSysadminPreferenceRoutes(sysadminRoutes);
registerSysadminPromptCaseRoutes(sysadminRoutes);
registerSysadminGenerationEntryRoutes(sysadminRoutes);
registerSysadminAnnouncementRoutes(sysadminRoutes);
