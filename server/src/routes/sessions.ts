/**
 * 会话与历史 API 入口：
 * - `sessionRoutes` 挂载 `/api/sessions/*`，负责工作台会话 CRUD、消息分页和删除；
 * - `historyRoutes` 挂载 `/api/history/*`，负责用户历史列表与详情；
 * - 具体 SQL 和图片合并 helper 拆到 `routes/sessions/`，外部路径保持不变。
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";
import { registerSessionCrudRoutes } from "./sessions/crud";
import { registerHistoryRoutes } from "./sessions/history";
import { registerSessionMessageRoutes } from "./sessions/messages";

export const sessionRoutes = new Hono<AppEnv>();

// 本组所有路由需登录；具体 session 再 `assertSessionAccess` 校验归属。
sessionRoutes.use("*", requireAuth);
registerSessionCrudRoutes(sessionRoutes);
registerSessionMessageRoutes(sessionRoutes);

export const historyRoutes = new Hono<AppEnv>();

// 历史页同样全量要求登录，详情再复用 `assertSessionAccess`。
historyRoutes.use("*", requireAuth);
registerHistoryRoutes(historyRoutes);
