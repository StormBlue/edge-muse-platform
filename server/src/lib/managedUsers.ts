/**
 * 管理端用户列表：先在 users 上筛选分页，再对本页 user_id 聚合任务数。
 * 禁止 `LEFT JOIN tasks GROUP BY users.id LIMIT OFFSET`，否则会读完匹配用户的全部历史任务。
 */
import type { AppBindings, AuthUser, UserRole } from "../types";

export type ManagedUserListInput = {
  actor: Pick<AuthUser, "id" | "role">;
  q?: string;
  status?: string;
  requestedRole?: string;
  page: number;
  pageSize: number;
};

export type ManagedUserListItem = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: UserRole;
  status: "active" | "disabled";
  preferredProviderKeyId: string | null;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
  allocatedQuota: number | null;
  usedQuota: number | null;
  providerKeyGroupId: string | null;
  providerKeyGroupName: string | null;
  providerKeyGroupProviderId: string | null;
  maxConcurrentTasks: number | null;
  maxImagesPerGeneration: number | null;
  generationCount: number;
  lastGenerationAt: number | null;
};

export type ManagedUserListResult = {
  items: ManagedUserListItem[];
  page: number;
  pageSize: number;
  total: number;
};

type ManagedUserRow = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: UserRole;
  status: "active" | "disabled";
  preferred_provider_key_id: string | null;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
  allocated_quota: number | null;
  used_quota: number | null;
  provider_key_group_id: string | null;
  provider_key_group_name: string | null;
  provider_key_group_provider_id: string | null;
  max_concurrent_tasks: number | null;
  max_images_per_generation: number | null;
};

type TaskStatRow = {
  user_id: string;
  generation_count: number;
  last_generation_at: number | null;
};

function resolveListRole(
  actor: Pick<AuthUser, "role">,
  requestedRole: string | undefined
): "admin" | "user" | null {
  if (actor.role === "sysadmin" && (requestedRole === "admin" || requestedRole === "user")) {
    return requestedRole;
  }
  if (actor.role === "sysadmin") return null;
  return "user";
}

function managedUserWhereSql(input: ManagedUserListInput): {
  conditions: string[];
  binds: unknown[];
} {
  const conditions: string[] = [];
  const binds: unknown[] = [];
  const role = resolveListRole(input.actor, input.requestedRole);
  if (input.actor.role !== "sysadmin") {
    binds.push(input.actor.id);
    conditions.push(`users.created_by = ?${binds.length}`);
  }
  if (input.actor.role === "sysadmin" && !role) {
    conditions.push(`users.role IN ('admin', 'user')`);
  }
  if (role) {
    binds.push(role);
    conditions.push(`users.role = ?${binds.length}`);
  }
  if (input.status === "active" || input.status === "disabled") {
    binds.push(input.status);
    conditions.push(`users.status = ?${binds.length}`);
  }
  const q = input.q?.trim();
  if (q) {
    binds.push(`%${q}%`);
    const searchIndex = binds.length;
    // 前导通配不能走 email/username 唯一索引，但不得为此再 JOIN tasks。
    conditions.push(
      `(users.email LIKE ?${searchIndex} OR users.username LIKE ?${searchIndex} OR users.nickname LIKE ?${searchIndex})`
    );
  }
  return { conditions, binds };
}

/** 只分页 users，不 JOIN tasks。 */
export function buildManagedUserPageSql(input: ManagedUserListInput): {
  sql: string;
  binds: unknown[];
  countSql: string;
  countBinds: unknown[];
} {
  const page = Number.isFinite(input.page) ? Math.max(Math.floor(input.page), 1) : 1;
  const pageSize = Number.isFinite(input.pageSize)
    ? Math.min(Math.max(Math.floor(input.pageSize), 1), 100)
    : 20;
  const offset = (page - 1) * pageSize;
  const { conditions, binds } = managedUserWhereSql(input);
  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(*) AS total FROM users ${whereSql}`;
  const limitIndex = binds.length + 1;
  const offsetIndex = binds.length + 2;
  const sql = `SELECT users.id,
         users.email,
         users.username,
         users.nickname,
         users.role,
         users.status,
         users.preferred_provider_key_id,
         users.created_at,
         users.updated_at,
         users.last_login_at,
         quotas.allocated_quota,
         quotas.used_quota,
         users.provider_key_group_id,
         provider_key_groups.name AS provider_key_group_name,
         provider_key_groups.provider_id AS provider_key_group_provider_id,
         users.max_concurrent_tasks,
         users.max_images_per_generation
       FROM users
       LEFT JOIN quotas ON quotas.user_id = users.id
       LEFT JOIN provider_key_groups ON provider_key_groups.id = users.provider_key_group_id
       ${whereSql}
       ORDER BY users.created_at DESC
       LIMIT ?${limitIndex} OFFSET ?${offsetIndex}`;
  return {
    sql,
    binds: [...binds, pageSize, offset],
    countSql,
    countBinds: binds
  };
}

/** 对本页 user_id 聚合任务；应走 idx_tasks_user_queued。 */
export function buildManagedUserTaskStatsSql(userIds: string[]): { sql: string; binds: unknown[] } {
  if (userIds.length === 0) return { sql: "", binds: [] };
  const placeholders = userIds.map((_, index) => `?${index + 1}`).join(", ");
  return {
    sql: `SELECT user_id,
         COUNT(*) AS generation_count,
         MAX(queued_at) AS last_generation_at
       FROM tasks
       WHERE user_id IN (${placeholders})
       GROUP BY user_id`,
    binds: userIds
  };
}

export async function listManagedUsers(
  env: AppBindings,
  input: ManagedUserListInput
): Promise<ManagedUserListResult> {
  const page = Number.isFinite(input.page) ? Math.max(Math.floor(input.page), 1) : 1;
  const pageSize = Number.isFinite(input.pageSize)
    ? Math.min(Math.max(Math.floor(input.pageSize), 1), 100)
    : 20;
  const query = buildManagedUserPageSql({ ...input, page, pageSize });
  const totalRows = await env.DB.prepare(query.countSql)
    .bind(...query.countBinds)
    .all<{ total: number }>();
  const rows = await env.DB.prepare(query.sql)
    .bind(...query.binds)
    .all<ManagedUserRow>();
  const userIds = rows.results.map((row) => row.id);
  const statsQuery = buildManagedUserTaskStatsSql(userIds);
  const stats = statsQuery.sql
    ? await env.DB.prepare(statsQuery.sql)
        .bind(...statsQuery.binds)
        .all<TaskStatRow>()
    : { results: [] as TaskStatRow[] };
  const statsByUser = new Map(stats.results.map((row) => [row.user_id, row]));
  return {
    items: rows.results.map((row) => {
      const taskStats = statsByUser.get(row.id);
      return {
        id: row.id,
        email: row.email,
        username: row.username,
        nickname: row.nickname,
        role: row.role,
        status: row.status,
        preferredProviderKeyId: row.preferred_provider_key_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastLoginAt: row.last_login_at,
        allocatedQuota: row.allocated_quota,
        usedQuota: row.used_quota,
        providerKeyGroupId: row.provider_key_group_id,
        providerKeyGroupName: row.provider_key_group_name,
        providerKeyGroupProviderId: row.provider_key_group_provider_id,
        maxConcurrentTasks: row.max_concurrent_tasks,
        maxImagesPerGeneration: row.max_images_per_generation,
        generationCount: taskStats?.generation_count ?? 0,
        lastGenerationAt: taskStats?.last_generation_at ?? null
      };
    }),
    page,
    pageSize,
    total: totalRows.results[0]?.total ?? 0
  };
}
