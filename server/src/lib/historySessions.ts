/**
 * 用户历史会话列表：先按 sessions 过滤排序分页，再对本页做任务/封面聚合。
 * 避免 `LEFT JOIN tasks ... GROUP BY sessions.id LIMIT OFFSET` 把该用户全部任务膨胀进中间结果。
 */
import { parseJson } from "./json";
import type { AppBindings } from "../types";

export type HistoryListOrder = "recent" | "oldest" | "task_count";

export type HistoryListInput = {
  userId: string;
  q?: string;
  order?: string;
  page: number;
  pageSize: number;
};

export type HistoryListCoverImage = {
  id: string;
  url: string;
  mime: string | null;
  width: number | null;
  height: number | null;
  byteSize: number;
  taskId: string | null;
  sessionId: string;
};

export type HistoryListItem = {
  id: string;
  userId: string;
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
  requestedImageCount: number;
  imageCount: number;
  status: string | null;
  coverImage: HistoryListCoverImage | null;
};

export type HistoryListResult = {
  items: HistoryListItem[];
  page: number;
  pageSize: number;
  total: number;
};

type HistoryListRow = {
  id: string;
  user_id: string;
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
  requested_image_count: number;
  image_count: number;
  session_status: string | null;
  cover_image_id: string | null;
  cover_mime: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_byte_size: number | null;
  cover_task_id: string | null;
};

/** 本页会话上的相关子查询：只应对 LIMIT 之后的 page 行执行。 */
const HISTORY_PAGE_AGGREGATES = `
         (
           SELECT COUNT(*)
           FROM tasks task_totals
           WHERE task_totals.session_id = page.id
         ) AS task_count,
         (
           SELECT COALESCE(
             SUM(
               CASE
                 WHEN json_valid(requested_tasks.params)
                   THEN COALESCE(CAST(json_extract(requested_tasks.params, '$.n') AS INTEGER), 1)
                 ELSE 1
               END
             ),
             0
           )
           FROM tasks requested_tasks
           WHERE requested_tasks.session_id = page.id
         ) AS requested_image_count,
         (
           SELECT COUNT(*)
           FROM messages accepted_image_messages,
             json_each(accepted_image_messages.attachments) accepted_images
           WHERE accepted_image_messages.session_id = page.id
             AND accepted_image_messages.deleted_at IS NULL
             AND json_valid(accepted_image_messages.attachments)
         ) AS image_count,
         COALESCE(
           (
             SELECT active_tasks.status
             FROM tasks active_tasks
             WHERE active_tasks.session_id = page.id
               AND active_tasks.status IN ('running', 'queued')
             ORDER BY CASE active_tasks.status WHEN 'running' THEN 0 ELSE 1 END,
               active_tasks.queued_at DESC
             LIMIT 1
           ),
           (
             SELECT latest_tasks.status
             FROM tasks latest_tasks
             WHERE latest_tasks.session_id = page.id
             ORDER BY latest_tasks.queued_at DESC
             LIMIT 1
           )
         ) AS session_status,
         cover.id AS cover_image_id,
         cover.mime AS cover_mime,
         cover.width AS cover_width,
         cover.height AS cover_height,
         cover.byte_size AS cover_byte_size,
         cover.task_id AS cover_task_id`;

function normalizeHistoryOrder(order: string | undefined): HistoryListOrder {
  if (order === "oldest" || order === "task_count") return order;
  return "recent";
}

function historyWhereSql(input: { userId: string; q?: string }): {
  conditions: string[];
  binds: unknown[];
} {
  const conditions = ["sessions.deleted_at IS NULL", "sessions.user_id = ?1"];
  const binds: unknown[] = [input.userId];
  const q = input.q?.trim();
  if (q) {
    binds.push(`%${q}%`);
    const searchIndex = binds.length;
    // 搜索仍可扫该用户消息 prompt，但外层必须先限制本人未删会话。
    conditions.push(
      `(sessions.title LIKE ?${searchIndex} OR EXISTS (
          SELECT 1 FROM messages m
          WHERE m.session_id = sessions.id AND m.deleted_at IS NULL AND m.prompt LIKE ?${searchIndex}
        ))`
    );
  }
  return { conditions, binds };
}

function historyInnerOrderSql(order: HistoryListOrder): string {
  if (order === "oldest") return "sessions.created_at ASC";
  if (order === "task_count") {
    // 按任务数全局排序必须在 LIMIT 前计算 COUNT，但走 session_id 索引相关子查询，不是 JOIN 全表。
    return `(SELECT COUNT(*) FROM tasks task_order WHERE task_order.session_id = sessions.id) DESC, sessions.last_message_at DESC`;
  }
  return "sessions.last_message_at DESC";
}

/**
 * 历史列表 SQL：内层只从 sessions 取出一页，外层再按 page.id 聚合。
 * 测试可用同一字符串跑 EXPLAIN QUERY PLAN。
 */
export function buildUserHistoryListSql(input: HistoryListInput): {
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
  const { conditions, binds } = historyWhereSql(input);
  const whereSql = conditions.join(" AND ");
  const orderSql = historyInnerOrderSql(normalizeHistoryOrder(input.order));
  const limitIndex = binds.length + 1;
  const offsetIndex = binds.length + 2;
  const countSql = `SELECT COUNT(*) AS total FROM sessions WHERE ${whereSql}`;
  const sql = `SELECT page.id,
         page.user_id,
         page.title,
         page.mode,
         page.provider_key_id,
         page.settings,
         page.created_at,
         page.updated_at,
         page.last_message_at,
         page.archived,
         page.deleted_at,
         ${HISTORY_PAGE_AGGREGATES}
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
         ORDER BY ${orderSql}
         LIMIT ?${limitIndex} OFFSET ?${offsetIndex}
       ) AS page
       LEFT JOIN image_objects cover ON cover.id = (
           SELECT json_extract(cover_images.value, '$.id')
           FROM messages cover_messages,
             json_each(cover_messages.attachments) cover_images
           WHERE cover_messages.session_id = page.id
             AND cover_messages.deleted_at IS NULL
             AND json_valid(cover_messages.attachments)
             AND json_extract(cover_images.value, '$.id') IS NOT NULL
           ORDER BY cover_messages.created_at DESC, CAST(cover_images.key AS INTEGER) DESC
           LIMIT 1
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

export async function listUserHistorySessions(
  env: AppBindings,
  input: HistoryListInput
): Promise<HistoryListResult> {
  const page = Number.isFinite(input.page) ? Math.max(Math.floor(input.page), 1) : 1;
  const pageSize = Number.isFinite(input.pageSize)
    ? Math.min(Math.max(Math.floor(input.pageSize), 1), 50)
    : 12;
  const query = buildUserHistoryListSql({ ...input, page, pageSize });
  const totalRows = await env.DB.prepare(query.countSql)
    .bind(...query.countBinds)
    .all<{ total: number }>();
  const rows = await env.DB.prepare(query.sql)
    .bind(...query.binds)
    .all<HistoryListRow>();
  return {
    items: rows.results.map(mapHistoryListRow),
    page,
    pageSize,
    total: totalRows.results[0]?.total ?? 0
  };
}

function mapHistoryListRow(row: HistoryListRow): HistoryListItem {
  return {
    id: row.id,
    userId: row.user_id,
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
    requestedImageCount: Math.max(row.requested_image_count, row.image_count),
    imageCount: row.image_count,
    status: row.session_status,
    coverImage: row.cover_image_id
      ? {
          id: row.cover_image_id,
          url: `/api/i/${row.cover_image_id}`,
          mime: row.cover_mime,
          width: row.cover_width,
          height: row.cover_height,
          byteSize: row.cover_byte_size ?? 0,
          taskId: row.cover_task_id,
          sessionId: row.id
        }
      : null
  };
}
