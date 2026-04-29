import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { announcementReads, announcements } from "../db/schema";
import { appError } from "./errors";
import { newId, now } from "./id";
import type { AppBindings, AuthUser } from "../types";

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 20000;

export const announcementTargetSchema = z.enum(["all", "admins"]);
export const announcementStatusSchema = z.enum(["draft", "published", "archived"]);

export const announcementCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
    content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
    targetAudience: announcementTargetSchema.default("all"),
    status: announcementStatusSchema.default("published")
  })
  .strict();

export const announcementPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
    content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH).optional(),
    targetAudience: announcementTargetSchema.optional(),
    status: announcementStatusSchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export type AnnouncementTarget = z.infer<typeof announcementTargetSchema>;
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;
export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>;
export type AnnouncementPatchInput = z.infer<typeof announcementPatchSchema>;

export type AnnouncementListOptions = {
  page?: number;
  pageSize?: number;
  status?: AnnouncementStatus;
  targetAudience?: AnnouncementTarget;
  q?: string;
};

export type AnnouncementListResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadCount?: number;
};

export type PublicAnnouncementListItem = {
  id: string;
  title: string;
  contentPreview: string;
  targetAudience: AnnouncementTarget;
  publishedAt: number;
  createdAt: number;
  isRead: boolean;
};

export type PublicAnnouncementDetail = PublicAnnouncementListItem & {
  content: string;
};

export type SysadminAnnouncementItem = {
  id: string;
  title: string;
  content: string;
  contentPreview: string;
  targetAudience: AnnouncementTarget;
  status: AnnouncementStatus;
  createdBy: string | null;
  updatedBy: string | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export function parsePage(value: string | undefined, fallback = 1) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(Math.floor(parsed), 1) : fallback;
}

export function parsePageSize(value: string | undefined, fallback = 10, max = 50) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), max);
}

export async function listPublicAnnouncements(
  env: AppBindings,
  user: AuthUser,
  options: AnnouncementListOptions = {}
): Promise<AnnouncementListResult<PublicAnnouncementListItem>> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 10;
  const offset = (page - 1) * pageSize;
  const visibleWhere = publicAnnouncementWhere(user);
  const totalRows = await getDb(env)
    .select({ count: sql<number>`count(*)` })
    .from(announcements)
    .where(visibleWhere);
  const rows = await getDb(env)
    .select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      targetAudience: announcements.targetAudience,
      publishedAt: announcements.publishedAt,
      createdAt: announcements.createdAt,
      readAt: announcementReads.readAt
    })
    .from(announcements)
    .leftJoin(
      announcementReads,
      and(
        eq(announcementReads.announcementId, announcements.id),
        eq(announcementReads.userId, user.id)
      )
    )
    .where(visibleWhere)
    .orderBy(desc(announcements.publishedAt), desc(announcements.createdAt))
    .limit(pageSize)
    .offset(offset);
  const total = totalRows[0]?.count ?? 0;
  const unreadCount = await countUnreadAnnouncements(env, user);
  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      contentPreview: preview(row.content),
      targetAudience: row.targetAudience,
      publishedAt: row.publishedAt ?? row.createdAt,
      createdAt: row.createdAt,
      isRead: Boolean(row.readAt)
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    unreadCount
  };
}

export async function getPublicAnnouncementDetail(
  env: AppBindings,
  user: AuthUser,
  id: string
): Promise<PublicAnnouncementDetail> {
  const rows = await getDb(env)
    .select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      targetAudience: announcements.targetAudience,
      publishedAt: announcements.publishedAt,
      createdAt: announcements.createdAt,
      readAt: announcementReads.readAt
    })
    .from(announcements)
    .leftJoin(
      announcementReads,
      and(
        eq(announcementReads.announcementId, announcements.id),
        eq(announcementReads.userId, user.id)
      )
    )
    .where(and(eq(announcements.id, id), publicAnnouncementWhere(user)))
    .limit(1);
  const row = rows[0];
  if (!row) throw appError("NOT_FOUND", "Announcement not found");
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    contentPreview: preview(row.content),
    targetAudience: row.targetAudience,
    publishedAt: row.publishedAt ?? row.createdAt,
    createdAt: row.createdAt,
    isRead: Boolean(row.readAt)
  };
}

export async function markAnnouncementRead(
  env: AppBindings,
  userId: string,
  announcementId: string
) {
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(announcement_id, user_id) DO UPDATE SET read_at = ?3`
  )
    .bind(announcementId, userId, timestamp)
    .run();
  return timestamp;
}

export async function countUnreadAnnouncements(env: AppBindings, user: AuthUser) {
  const visibleWhere = publicAnnouncementWhere(user);
  const rows = await getDb(env)
    .select({ count: sql<number>`count(*)` })
    .from(announcements)
    .leftJoin(
      announcementReads,
      and(
        eq(announcementReads.announcementId, announcements.id),
        eq(announcementReads.userId, user.id)
      )
    )
    .where(and(visibleWhere, isNull(announcementReads.readAt)));
  return rows[0]?.count ?? 0;
}

export async function listSysadminAnnouncements(
  env: AppBindings,
  options: AnnouncementListOptions = {}
): Promise<AnnouncementListResult<SysadminAnnouncementItem>> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const filters = sysadminAnnouncementWhere(options);
  const totalRows = await getDb(env)
    .select({ count: sql<number>`count(*)` })
    .from(announcements)
    .where(filters);
  const rows = await getDb(env)
    .select()
    .from(announcements)
    .where(filters)
    .orderBy(desc(announcements.updatedAt))
    .limit(pageSize)
    .offset(offset);
  const total = totalRows[0]?.count ?? 0;
  return {
    items: rows.map(toSysadminAnnouncementItem),
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1)
  };
}

export async function createAnnouncement(
  env: AppBindings,
  actorId: string,
  input: AnnouncementCreateInput
) {
  const timestamp = now();
  const publishedAt = input.status === "published" ? timestamp : null;
  const row = {
    id: newId("ann"),
    title: input.title,
    content: input.content,
    targetAudience: input.targetAudience,
    status: input.status,
    createdBy: actorId,
    updatedBy: actorId,
    publishedAt,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null
  };
  await getDb(env).insert(announcements).values(row);
  return toSysadminAnnouncementItem(row);
}

export async function updateAnnouncement(
  env: AppBindings,
  actorId: string,
  id: string,
  input: AnnouncementPatchInput
) {
  const existing = await getDb(env).query.announcements.findFirst({
    where: and(eq(announcements.id, id), isNull(announcements.deletedAt))
  });
  if (!existing) throw appError("NOT_FOUND", "Announcement not found");

  const timestamp = now();
  const nextStatus = input.status ?? existing.status;
  const publishedAt =
    nextStatus === "published" && existing.status !== "published"
      ? timestamp
      : nextStatus === "published"
        ? existing.publishedAt
        : null;
  await getDb(env)
    .update(announcements)
    .set({
      title: input.title ?? existing.title,
      content: input.content ?? existing.content,
      targetAudience: input.targetAudience ?? existing.targetAudience,
      status: nextStatus,
      publishedAt,
      updatedBy: actorId,
      updatedAt: timestamp
    })
    .where(eq(announcements.id, id));
  const updated = await getDb(env).query.announcements.findFirst({
    where: eq(announcements.id, id)
  });
  if (!updated) throw appError("NOT_FOUND", "Announcement not found");
  return toSysadminAnnouncementItem(updated);
}

export async function deleteAnnouncement(env: AppBindings, actorId: string, id: string) {
  const existing = await getDb(env).query.announcements.findFirst({
    where: and(eq(announcements.id, id), isNull(announcements.deletedAt))
  });
  if (!existing) throw appError("NOT_FOUND", "Announcement not found");
  await getDb(env)
    .update(announcements)
    .set({
      status: "archived",
      updatedBy: actorId,
      updatedAt: now(),
      deletedAt: now()
    })
    .where(eq(announcements.id, id));
}

function publicAnnouncementWhere(user: AuthUser) {
  return and(
    eq(announcements.status, "published"),
    isNull(announcements.deletedAt),
    user.role === "admin" || user.role === "sysadmin"
      ? or(eq(announcements.targetAudience, "all"), eq(announcements.targetAudience, "admins"))
      : eq(announcements.targetAudience, "all")
  );
}

function sysadminAnnouncementWhere(options: AnnouncementListOptions) {
  return and(
    isNull(announcements.deletedAt),
    options.status ? eq(announcements.status, options.status) : undefined,
    options.targetAudience ? eq(announcements.targetAudience, options.targetAudience) : undefined,
    options.q
      ? or(
          like(announcements.title, `%${options.q}%`),
          like(announcements.content, `%${options.q}%`)
        )
      : undefined
  );
}

function toSysadminAnnouncementItem(
  row: typeof announcements.$inferSelect
): SysadminAnnouncementItem {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    contentPreview: preview(row.content),
    targetAudience: row.targetAudience,
    status: row.status,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function preview(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}
