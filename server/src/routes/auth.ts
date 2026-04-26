import { eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { audit } from "../lib/audit";
import {
  clearAuthCookies,
  readAccessToken,
  readRefreshToken,
  setAuthCookies
} from "../lib/cookies";
import { appError } from "../lib/errors";
import { randomBytes, base64UrlEncode } from "../lib/encoding";
import { now } from "../lib/id";
import { signJwt, verifyJwt } from "../lib/jwt";
import { logWarn } from "../lib/log";
import { hashPassword, verifyPassword } from "../lib/password";
import { getQuota } from "../lib/quota";
import { verifyTurnstile } from "../lib/turnstile";
import { requireAuth } from "../middleware/auth";
import { consumeRateLimit } from "../middleware/rateLimit";
import type { AppEnv } from "../types";

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(8),
  turnstileToken: z.string().optional()
});

const loginRateLimit = { prefix: "login", limit: 20, windowSeconds: 15 * 60 };

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  const ip = c.req.header("CF-Connecting-IP") ?? undefined;
  if (!(await verifyTurnstile(c.env, body.turnstileToken, ip))) {
    logWarn("auth.login_turnstile_failed", {
      traceId: c.get("traceId"),
      identifierLength: body.email.trim().length,
      ip,
      hasTurnstileToken: Boolean(body.turnstileToken)
    });
    throw appError("FORBIDDEN", "Turnstile verification failed");
  }
  const db = getDb(c.env);
  const identifier = body.email.trim();
  if (!identifier) throw appError("VALIDATION_ERROR", "Username/email is required");
  const user = await db.query.users.findFirst({
    where: or(eq(users.email, identifier.toLowerCase()), eq(users.username, identifier))
  });
  const passwordMatches = user ? await verifyPassword(body.password, user.passwordHash) : false;
  if (!user || !passwordMatches || user.status !== "active") {
    await consumeRateLimit(c, loginRateLimit);
  }
  if (!user || !passwordMatches) {
    await audit(c.env, {
      action: "auth.login_failed",
      targetType: "user",
      targetId: identifier,
      ip
    });
    throw appError("UNAUTHORIZED", "Invalid username/email or password");
  }
  if (user.status !== "active") throw appError("FORBIDDEN", "User disabled");
  const accessToken = await signJwt(
    c.env.JWT_SECRET,
    { sub: user.id, email: user.email, role: user.role, type: "access" },
    15 * 60
  );
  const refreshToken = await signJwt(
    c.env.JWT_SECRET,
    { sub: user.id, email: user.email, role: user.role, type: "refresh" },
    7 * 24 * 60 * 60
  );
  const csrf = base64UrlEncode(randomBytes(16));
  setAuthCookies(c, accessToken, refreshToken, csrf);
  await db.update(users).set({ lastLoginAt: now(), updatedAt: now() }).where(eq(users.id, user.id));
  await audit(c.env, {
    actorId: user.id,
    action: "auth.login",
    targetType: "user",
    targetId: user.id,
    ip
  });
  return c.json({
    user: publicUser(user),
    csrfToken: csrf,
    quota: await getQuota(c.env, user.id)
  });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const token = readAccessToken(c);
  if (token) {
    try {
      const payload = await verifyJwt(c.env.JWT_SECRET, token, "access");
      await c.env.KV.put(`jwt:blacklist:${payload.jti}`, "1", { expirationTtl: 15 * 60 });
    } catch {
      // Expired tokens do not need blacklisting.
    }
  }
  await audit(c.env, {
    actorId: c.get("user").id,
    action: "auth.logout",
    targetType: "user",
    targetId: c.get("user").id
  });
  clearAuthCookies(c);
  return c.json({ ok: true });
});

authRoutes.post("/refresh", async (c) => {
  const token = readRefreshToken(c);
  if (!token) throw appError("UNAUTHORIZED", "Refresh token required");
  const payload = await verifyJwt(c.env.JWT_SECRET, token, "refresh");
  const user = await getDb(c.env).query.users.findFirst({ where: eq(users.id, payload.sub) });
  if (!user || user.status !== "active") throw appError("UNAUTHORIZED", "User disabled or missing");
  const accessToken = await signJwt(
    c.env.JWT_SECRET,
    { sub: user.id, email: user.email, role: user.role, type: "access" },
    15 * 60
  );
  const refreshToken = await signJwt(
    c.env.JWT_SECRET,
    { sub: user.id, email: user.email, role: user.role, type: "refresh" },
    7 * 24 * 60 * 60
  );
  const csrf = base64UrlEncode(randomBytes(16));
  setAuthCookies(c, accessToken, refreshToken, csrf);
  await getDb(c.env)
    .update(users)
    .set({ lastLoginAt: now(), updatedAt: now() })
    .where(eq(users.id, user.id));
  return c.json({ user: publicUser(user), csrfToken: csrf, quota: await getQuota(c.env, user.id) });
});

authRoutes.post(
  "/password/change",
  requireAuth,
  zValidator("json", z.object({ oldPassword: z.string().min(1), newPassword: z.string().min(8) })),
  async (c) => {
    const body = c.req.valid("json");
    const user = await getDb(c.env).query.users.findFirst({
      where: eq(users.id, c.get("user").id)
    });
    if (!user || !(await verifyPassword(body.oldPassword, user.passwordHash))) {
      throw appError("UNAUTHORIZED", "Old password is incorrect");
    }
    await getDb(c.env)
      .update(users)
      .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: now() })
      .where(eq(users.id, user.id));
    await audit(c.env, {
      actorId: user.id,
      action: "auth.password_change",
      targetType: "user",
      targetId: user.id
    });
    return c.json({ ok: true });
  }
);

function publicUser(user: {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: string;
  status: string;
  preferredProviderKeyId?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    status: user.status,
    preferredProviderKeyId: user.preferredProviderKeyId ?? null
  };
}
