/**
 * 系统管理员公告管理。
 */
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  announcementCreateSchema,
  announcementPatchSchema,
  announcementStatusSchema,
  announcementTargetSchema,
  createAnnouncement,
  deleteAnnouncement,
  listSysadminAnnouncements,
  parsePage,
  parsePageSize,
  updateAnnouncement
} from "../../lib/announcements";
import { audit } from "../../lib/audit";
import type { SysadminRouter } from "./common";

const sysadminAnnouncementQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  status: announcementStatusSchema.optional(),
  targetAudience: announcementTargetSchema.optional(),
  q: z.string().trim().min(1).max(120).optional()
});

export function registerSysadminAnnouncementRoutes(sysadminRoutes: SysadminRouter) {
  sysadminRoutes.get(
    "/announcements",
    zValidator("query", sysadminAnnouncementQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      return c.json(
        await listSysadminAnnouncements(c.env, {
          page: parsePage(query.page),
          pageSize: parsePageSize(query.pageSize, 20, 50),
          status: query.status,
          targetAudience: query.targetAudience,
          q: query.q
        })
      );
    }
  );

  sysadminRoutes.post("/announcements", zValidator("json", announcementCreateSchema), async (c) => {
    const user = c.get("user");
    const item = await createAnnouncement(c.env, user.id, c.req.valid("json"));
    await audit(c.env, {
      actorId: user.id,
      action: "sys.announcement_create",
      targetType: "announcement",
      targetId: item.id,
      payload: auditPayload(item)
    });
    return c.json({ item }, 201);
  });

  sysadminRoutes.patch(
    "/announcements/:id",
    zValidator("json", announcementPatchSchema),
    async (c) => {
      const user = c.get("user");
      const item = await updateAnnouncement(c.env, user.id, c.req.param("id"), c.req.valid("json"));
      await audit(c.env, {
        actorId: user.id,
        action: "sys.announcement_update",
        targetType: "announcement",
        targetId: item.id,
        payload: auditPayload(item)
      });
      return c.json({ item });
    }
  );

  sysadminRoutes.delete("/announcements/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    await deleteAnnouncement(c.env, user.id, id);
    await audit(c.env, {
      actorId: user.id,
      action: "sys.announcement_delete",
      targetType: "announcement",
      targetId: id
    });
    return c.json({ ok: true });
  });
}

function auditPayload(item: {
  title: string;
  targetAudience: string;
  status: string;
  publishedAt: number | null;
}) {
  return {
    title: item.title,
    targetAudience: item.targetAudience,
    status: item.status,
    publishedAt: item.publishedAt
  };
}
