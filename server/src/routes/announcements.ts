/**
 * 当前用户公告中心：最近公告、分页列表、详情和已读状态。
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  countUnreadAnnouncements,
  getPublicAnnouncementDetail,
  listPublicAnnouncements,
  markAnnouncementRead,
  parsePage,
  parsePageSize
} from "../lib/announcements";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const announcementListQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional()
});

export const announcementRoutes = new Hono<AppEnv>();

announcementRoutes.use("*", requireAuth);

announcementRoutes.get("/recent", async (c) => {
  const user = c.get("user");
  const result = await listPublicAnnouncements(c.env, user, { page: 1, pageSize: 6 });
  return c.json({
    items: result.items.slice(0, 5),
    hasMore: result.total > 5,
    unreadCount: result.unreadCount ?? 0
  });
});

announcementRoutes.get("/", zValidator("query", announcementListQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const result = await listPublicAnnouncements(c.env, c.get("user"), {
    page: parsePage(query.page),
    pageSize: parsePageSize(query.pageSize, 10, 30)
  });
  return c.json(result);
});

announcementRoutes.get("/:id", async (c) => {
  const item = await getPublicAnnouncementDetail(c.env, c.get("user"), c.req.param("id"));
  return c.json({ item, unreadCount: await countUnreadAnnouncements(c.env, c.get("user")) });
});

announcementRoutes.post("/:id/read", async (c) => {
  const user = c.get("user");
  await getPublicAnnouncementDetail(c.env, user, c.req.param("id"));
  await markAnnouncementRead(c.env, user.id, c.req.param("id"));
  return c.json({ unreadCount: await countUnreadAnnouncements(c.env, user) });
});
