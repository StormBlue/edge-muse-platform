/**
 * 鉴权中间件（access JWT 来自 `readAccessToken`：Authorization Bearer 或 Cookie）。
 *
 * - `optionalAuth`：无 token 或验签失败则**不设** `user`，不中断；供公开页「有则展示头像」等。
 * - `requireAuth`：必须 `verifyJwt` 通过、KV 无 `jwt:blacklist:jti`、DB 用户存在且 `active`。
 */
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { readAccessToken } from "../lib/cookies";
import { appError } from "../lib/errors";
import { verifyJwt } from "../lib/jwt";
import type { AppEnv } from "../types";

export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readAccessToken(c);
  if (!token) return next();
  try {
    const payload = await verifyJwt(c.env.JWT_SECRET, token, "access");
    const db = getDb(c.env);
    // 与 requireAuth 一致从 DB 拉最新 profile；**不**查黑名单（可选场景以不挡公开为主）
    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });
    if (user && user.status === "active") {
      c.set("user", {
        id: user.id,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
        status: user.status,
        preferredProviderKeyId: user.preferredProviderKeyId,
        providerKeyGroupId: user.providerKeyGroupId,
        maxConcurrentTasks: user.maxConcurrentTasks
      });
    }
  } catch {
    // 过期/伪造：不设 user，下游按「未登录」处理
  }
  return next();
});

/** 强鉴权：黑名单键与 `auth` 登出、`signJwt` jti 一一对应 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readAccessToken(c);
  if (!token) throw appError("UNAUTHORIZED", "Authentication required");
  let payload;
  try {
    payload = await verifyJwt(c.env.JWT_SECRET, token, "access");
  } catch {
    throw appError("UNAUTHORIZED", "Invalid or expired token");
  }
  // 登出只黑 access 的 jti；refresh rotate 后旧 access 在此失效
  const blacklisted = await c.env.KV.get(`jwt:blacklist:${payload.jti}`);
  if (blacklisted) throw appError("UNAUTHORIZED", "Token has been revoked");
  const user = await getDb(c.env).query.users.findFirst({ where: eq(users.id, payload.sub) });
  if (!user || user.status !== "active") throw appError("UNAUTHORIZED", "User disabled or missing");
  c.set("user", {
    id: user.id,
    email: user.email,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    status: user.status,
    preferredProviderKeyId: user.preferredProviderKeyId,
    providerKeyGroupId: user.providerKeyGroupId,
    maxConcurrentTasks: user.maxConcurrentTasks
  });
  return next();
});
