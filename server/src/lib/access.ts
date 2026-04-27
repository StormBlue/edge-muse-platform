/**
 * 资源级权限：校验「当前登录用户」是否可访问某会话 / 任务 / 下属用户。
 * 与 docs 中「本人数据 + 管理员管辖范围」一致。
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { sessions, tasks, users } from "../db/schema";
import { appError } from "./errors";
import type { AppBindings, AuthUser } from "../types";

/** 会话必须存在、未软删，且 `sessions.user_id` 与 token 主体一致（不可读他人会话） */
export async function assertSessionAccess(env: AppBindings, sessionId: string, user: AuthUser) {
  const session = await getDb(env).query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), isNull(sessions.deletedAt))
  });
  if (!session) throw appError("NOT_FOUND", "Session not found");
  if (session.userId !== user.id) throw appError("FORBIDDEN", "No access");
  return session;
}

/** 任务必须存在且归属当前用户（生图记录不可跨用户读取） */
export async function assertTaskAccess(env: AppBindings, taskId: string, user: AuthUser) {
  const task = await getDb(env).query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw appError("NOT_FOUND", "Task not found");
  if (task.userId !== user.id) throw appError("FORBIDDEN", "No access");
  return task;
}

/**
 * 管理端：sysadmin 可管任意用户；admin 仅可管 `created_by === 自己` 且 `role === user` 的账号（不含其他 admin）。
 */
export async function assertManagedUserAccess(
  env: AppBindings,
  targetUserId: string,
  actor: AuthUser
) {
  const target = await getDb(env).query.users.findFirst({ where: eq(users.id, targetUserId) });
  if (!target) throw appError("NOT_FOUND", "User not found");
  if (actor.role === "sysadmin") return target;
  if (actor.role === "admin" && target.createdBy === actor.id && target.role === "user")
    return target;
  throw appError("FORBIDDEN", "No access to user");
}
