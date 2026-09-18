/**
 * Sysadmin 会话巡查列表：先取出本页 sessions，再按 session_id 聚合任务数/图数/封面。
 * `userId=_` 允许全站列表，但仍禁止 `LEFT JOIN tasks` 后再 GROUP BY + OFFSET。
 */
import { parseJson } from "./json";
import type { AppBindings, UserRole } from "../types";

export type AuditSessionListInput = {
  userId: string;
  q?: string;
  page: number;
  pageSize: number;
};

export type AuditSessionListItem = {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string | null;
    username: string | null;
    nickname: string | null;
    role: UserRole | null;
  };
  title: string;
  mode: "image2image" | "text2image";
  providerKeyId: string | null;
  settings: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  archived: boolean;
  deletedAt: number | null;
  taskCount: number;
  imageCount: number;
  coverImage: {
    id: string;
    url: string;
    mime: string;
    width: number | null;
    height: number | null;
    byteSize: number;
    taskId: string | null;
    sessionId: string;
  } | null;
};

export type AuditSessionListResult = {
  items: AuditSessionListItem[];
  page: number;
  pageSize: number;
  total: number;
};

type AuditSessionRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_username: string | null;
  user_nickname: string | null;
  user_role: UserRole | null;
  title: string;
  mode: string;
  provider_key_id: string | null;
  settings: string;
  created_at: number;
  updated_at: number;
  last_message_at: number;
  archived: number;
  deleted_at: number | null;
  task_count: number;
  image_count: number;
  cover_image_id: string | null;
  cover_mime: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_byte_size: number | null;
  cover_task_id: string | null;
};

async function usersHasUsername(env: AppBindings): Promise<boolean> {
  const rows = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  return rows.results.some((row) => row.name === "username");
}

function auditSessionWhereSql(input: { userId: string; q?: string }): {
  conditions: string[];
  binds: unknown[];
} {
  const conditions = ["1 = 1"];
  const binds: unknown[] = [];
  if (input.userId !== "_") {
    binds.push(input.userId);
    conditions.push(`sessions.user_id = ?${binds.length}`);
  }
  const q = input.q?.trim();
  if (q) {
    binds.push(`%${q}%`);
    const searchIndex = binds.length;
    conditions.push(
      `(sessions.title LIKE ?${searchIndex} OR EXISTS (
          SELECT 1 FROM messages m
          WHERE m.session_id = sessions.id AND m.deleted_at IS NULL AND m.prompt LIKE ?${searchIndex}
        ))`
    );
  }
  return { conditions, binds };
}

/** 对本页会话聚合：走 idx_tasks_session / idx_image_objects_session，不 JOIN 全站 tasks。 */
const AUDIT_PAGE_AGGREGATES = `
         (
           SELECT COUNT(*)
           FROM tasks task_totals
           WHERE task_totals.session_id = page.id
         ) AS task_count,
         (
           SELECT COUNT(*)
           FROM (
             SELECT json_extract(accepted_images.value, '$.id') AS image_id
             FROM messages accepted_image_messages,
               json_each(
                 CASE
                   WHEN json_valid(accepted_image_messages.attachments)
                     THEN accepted_image_messages.attachments
                   ELSE '[]'
                 END
               ) accepted_images
             WHERE accepted_image_messages.session_id = page.id
               AND accepted_image_messages.deleted_at IS NULL
               AND json_extract(accepted_images.value, '$.id') IS NOT NULL
             UNION
             SELECT persisted_images.id AS image_id
             FROM image_objects persisted_images
             INNER JOIN tasks persisted_image_tasks ON persisted_image_tasks.id = persisted_images.task_id
             WHERE persisted_images.session_id = page.id
               AND persisted_images.deleted_at IS NULL
               AND persisted_images.is_reference = 0
               AND persisted_image_tasks.message_id IS NOT NULL
           ) merged_success_images
         ) AS image_count,
         cover.id AS cover_image_id,
         cover.mime AS cover_mime,
         cover.width AS cover_width,
         cover.height AS cover_height,
         cover.byte_size AS cover_byte_size,
         cover.task_id AS cover_task_id`;

export function buildAuditSessionListSql(input: AuditSessionListInput & { hasUsername: boolean }): {
  sql: string;
  binds: unknown[];
  countSql: string;
  countBinds: unknown[];
} {
  const page = Number.isFinite(input.page) ? Math.max(Math.floor(input.page), 1) : 1;
  const pageSize = Number.isFinite(input.pageSize)
    ? Math.min(Math.max(Math.floor(input.pageSize), 1), 50)
    : 12;
  const offset = (page - 1) * pageSize;
  const { conditions, binds } = auditSessionWhereSql(input);
  const whereSql = conditions.join(" AND ");
  const limitIndex = binds.length + 1;
  const offsetIndex = binds.length + 2;
  const usernameSelect = input.hasUsername ? "users.username" : "NULL";
  const countSql = `SELECT COUNT(*) AS total FROM sessions WHERE ${whereSql}`;
  const sql = `SELECT page.id,
         page.user_id,
         users.email AS user_email,
         ${usernameSelect} AS user_username,
         users.nickname AS user_nickname,
         users.role AS user_role,
         page.title,
         page.mode,
         page.provider_key_id,
         page.settings,
         page.created_at,
         page.updated_at,
         page.last_message_at,
         page.archived,
         page.deleted_at,
         ${AUDIT_PAGE_AGGREGATES}
       FROM (
         SELECT sessions.id,
           sessions.user_id,
           sessions.title,
           sessions.mode,
           sessions.provider_key_id,
           sessions.settings,
           sessions.created_at,
           sessions.updated_at,
           sessions.last_message_at,
           sessions.archived,
           sessions.deleted_at
         FROM sessions
         WHERE ${whereSql}
         ORDER BY sessions.last_message_at DESC
         LIMIT ?${limitIndex} OFFSET ?${offsetIndex}
       ) AS page
       LEFT JOIN users ON users.id = page.user_id
       LEFT JOIN image_objects cover ON cover.id = COALESCE(
           (
             SELECT latest_persisted_images.id
             FROM image_objects latest_persisted_images
             INNER JOIN tasks latest_image_tasks ON latest_image_tasks.id = latest_persisted_images.task_id
             WHERE latest_persisted_images.session_id = page.id
               AND latest_persisted_images.deleted_at IS NULL
               AND latest_persisted_images.is_reference = 0
               AND latest_image_tasks.message_id IS NOT NULL
             ORDER BY latest_persisted_images.created_at DESC
             LIMIT 1
           ),
           (
             SELECT json_extract(cover_images.value, '$.id')
             FROM messages cover_messages,
               json_each(
                 CASE
                   WHEN json_valid(cover_messages.attachments)
                     THEN cover_messages.attachments
                   ELSE '[]'
                 END
               ) cover_images
             WHERE cover_messages.session_id = page.id
               AND cover_messages.deleted_at IS NULL
               AND json_extract(cover_images.value, '$.id') IS NOT NULL
             ORDER BY cover_messages.created_at DESC, CAST(cover_images.key AS INTEGER) DESC
             LIMIT 1
           )
         )
         AND cover.deleted_at IS NULL
         AND cover.is_reference = 0`;
  return {
    sql,
    binds: [...binds, pageSize, offset],
    countSql,
    countBinds: binds
  };
}

export async function listAuditSessions(
  env: AppBindings,
  input: AuditSessionListInput
): Promise<AuditSessionListResult> {
  const page = Number.isFinite(input.page) ? Math.max(Math.floor(input.page), 1) : 1;
  const pageSize = Number.isFinite(input.pageSize)
    ? Math.min(Math.max(Math.floor(input.pageSize), 1), 50)
    : 12;
  const hasUsername = await usersHasUsername(env);
  const query = buildAuditSessionListSql({ ...input, page, pageSize, hasUsername });
  const totalRows = query.countBinds.length
    ? await env.DB.prepare(query.countSql)
        .bind(...query.countBinds)
        .all<{ total: number }>()
    : await env.DB.prepare(query.countSql).all<{ total: number }>();
  const rows = await env.DB.prepare(query.sql)
    .bind(...query.binds)
    .all<AuditSessionRow>();
  return {
    items: rows.results.map((row) => ({
      id: row.id,
      userId: row.user_id,
      user: {
        id: row.user_id,
        email: row.user_email,
        username: row.user_username,
        nickname: row.user_nickname,
        role: row.user_role
      },
      title: row.title,
      mode: row.mode === "text2image" ? "text2image" : "image2image",
      providerKeyId: row.provider_key_id,
      settings: parseJson(row.settings, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessageAt: row.last_message_at,
      archived: Boolean(row.archived),
      deletedAt: row.deleted_at,
      taskCount: row.task_count,
      imageCount: row.image_count,
      coverImage: row.cover_image_id
        ? {
            id: row.cover_image_id,
            url: `/api/i/${row.cover_image_id}`,
            mime: row.cover_mime ?? "image/png",
            width: row.cover_width,
            height: row.cover_height,
            byteSize: row.cover_byte_size ?? 0,
            taskId: row.cover_task_id,
            sessionId: row.id
          }
        : null
    })),
    page,
    pageSize,
    total: totalRows.results[0]?.total ?? 0
  };
}
