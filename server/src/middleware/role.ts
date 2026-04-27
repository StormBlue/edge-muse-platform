/**
 * 基于角色**等级**的访问控制：`requireAuth` 后要求 `user.role` ≥ 指定档（含同级）。
 */
import { createMiddleware } from "hono/factory";
import { appError } from "../lib/errors";
import type { AppEnv, UserRole } from "../types";

const rank: Record<UserRole, number> = {
  user: 1,
  admin: 2,
  sysadmin: 3
};

export function requireRole(role: UserRole) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw appError("UNAUTHORIZED", "Authentication required");
    if (rank[user.role] < rank[role]) throw appError("FORBIDDEN", "Insufficient role");
    return next();
  });
}
