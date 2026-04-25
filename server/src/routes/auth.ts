import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { passwordResets, users } from "../db/schema";
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
import { sendMail } from "../lib/mailer";
import { hashPassword, verifyPassword } from "../lib/password";
import { getQuota } from "../lib/quota";
import { verifyTurnstile } from "../lib/turnstile";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import type { AppEnv } from "../types";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  turnstileToken: z.string().optional()
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post(
  "/login",
  rateLimit({ prefix: "login", limit: 5, windowSeconds: 15 * 60 }),
  zValidator("json", loginSchema),
  async (c) => {
    const body = c.req.valid("json");
    const ip = c.req.header("CF-Connecting-IP") ?? undefined;
    if (!(await verifyTurnstile(c.env, body.turnstileToken, ip))) {
      throw appError("FORBIDDEN", "Turnstile verification failed");
    }
    const db = getDb(c.env);
    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase())
    });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      await audit(c.env, {
        action: "auth.login_failed",
        targetType: "user",
        targetId: body.email,
        ip
      });
      throw appError("UNAUTHORIZED", "Invalid email or password");
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
    await db
      .update(users)
      .set({ lastLoginAt: now(), updatedAt: now() })
      .where(eq(users.id, user.id));
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
  }
);

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
  return c.json({ user: publicUser(user), csrfToken: csrf, quota: await getQuota(c.env, user.id) });
});

authRoutes.post(
  "/password/forgot",
  rateLimit({ prefix: "forgot", limit: 5, windowSeconds: 15 * 60 }),
  zValidator(
    "json",
    z.object({ email: z.string().email(), turnstileToken: z.string().optional() })
  ),
  async (c) => {
    const body = c.req.valid("json");
    if (
      !(await verifyTurnstile(
        c.env,
        body.turnstileToken,
        c.req.header("CF-Connecting-IP") ?? undefined
      ))
    ) {
      throw appError("FORBIDDEN", "Turnstile verification failed");
    }
    const db = getDb(c.env);
    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase())
    });
    if (user) {
      const token = base64UrlEncode(randomBytes(32));
      await db.insert(passwordResets).values({
        token,
        userId: user.id,
        expiresAt: now() + 30 * 60 * 1000,
        usedAt: null,
        createdAt: now()
      });
      const resetUrl = `${new URL(c.req.url).origin}/reset-password?token=${token}`;
      await sendMail(c.env, user.email, "password-reset", { resetUrl });
    }
    return c.json({ ok: true });
  }
);

authRoutes.post(
  "/password/reset",
  zValidator("json", z.object({ token: z.string().min(16), password: z.string().min(8) })),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const reset = await db.query.passwordResets.findFirst({
      where: and(eq(passwordResets.token, body.token), isNull(passwordResets.usedAt))
    });
    if (!reset || reset.expiresAt < now())
      throw appError("VALIDATION_ERROR", "Invalid reset token");
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.password), updatedAt: now() })
      .where(eq(users.id, reset.userId));
    await db
      .update(passwordResets)
      .set({ usedAt: now() })
      .where(eq(passwordResets.token, body.token));
    await audit(c.env, {
      actorId: reset.userId,
      action: "auth.password_reset",
      targetType: "user",
      targetId: reset.userId
    });
    return c.json({ ok: true });
  }
);

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
  nickname: string;
  role: string;
  status: string;
}) {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
    status: user.status
  };
}
