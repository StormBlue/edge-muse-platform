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
    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });
    if (user && user.status === "active") {
      c.set("user", {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        status: user.status
      });
    }
  } catch {
    // Public routes can continue without auth.
  }
  return next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readAccessToken(c);
  if (!token) throw appError("UNAUTHORIZED", "Authentication required");
  let payload;
  try {
    payload = await verifyJwt(c.env.JWT_SECRET, token, "access");
  } catch {
    throw appError("UNAUTHORIZED", "Invalid or expired token");
  }
  const blacklisted = await c.env.KV.get(`jwt:blacklist:${payload.jti}`);
  if (blacklisted) throw appError("UNAUTHORIZED", "Token has been revoked");
  const user = await getDb(c.env).query.users.findFirst({ where: eq(users.id, payload.sub) });
  if (!user || user.status !== "active") throw appError("UNAUTHORIZED", "User disabled or missing");
  c.set("user", {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
    status: user.status
  });
  return next();
});
