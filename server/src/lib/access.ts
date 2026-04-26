import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { sessions, tasks, users } from "../db/schema";
import { appError } from "./errors";
import type { AppBindings, AuthUser } from "../types";

export async function assertSessionAccess(env: AppBindings, sessionId: string, user: AuthUser) {
  const session = await getDb(env).query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), isNull(sessions.deletedAt))
  });
  if (!session) throw appError("NOT_FOUND", "Session not found");
  if (session.userId !== user.id) throw appError("FORBIDDEN", "No access");
  return session;
}

export async function assertTaskAccess(env: AppBindings, taskId: string, user: AuthUser) {
  const task = await getDb(env).query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw appError("NOT_FOUND", "Task not found");
  if (task.userId !== user.id) throw appError("FORBIDDEN", "No access");
  return task;
}

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
