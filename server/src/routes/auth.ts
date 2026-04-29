/**
 * 登录 / 登出 / 刷新 / 改密。
 *
 * Cookie 策略（与 `lib/cookies`、`web apiFetch` 配套）：
 * - access / refresh 为 httpOnly；CSRF token 非 httpOnly，供 JS 读并塞 `X-CSRF-Token`。
 * - 登出：把当前 access 的 `jti` 写入 KV `jwt:blacklist:*`，TTL 与 access 寿命一致（约 15min），
 *   `requireAuth` 会拒掉已登出 token。
 *
 * 登录：Turnstile 可选/视环境；失败与错误密码均 **`consumeRateLimit`** 防爆破；成功写 `lastLoginAt`。
 */
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
import { getGenerationEntryForUser } from "../lib/generationEntry";
import { now } from "../lib/id";
import { signJwt, verifyJwt } from "../lib/jwt";
import { logWarn } from "../lib/log";
import { hashPassword, verifyPassword } from "../lib/password";
import { isPromptAssistantEnabled } from "../lib/promptAssistant";
import { getProviderCapabilitiesForUser } from "../lib/providerKeys";
import { getQuota } from "../lib/quota";
import { verifyTurnstile } from "../lib/turnstile";
import { requireAuth } from "../middleware/auth";
import { consumeRateLimit } from "../middleware/rateLimit";
import type { AppEnv, AuthUser } from "../types";

/** 登录体：邮箱或用户名 + 密码；Turnstile 由环境决定是否强制 */
const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(8),
  turnstileToken: z.string().optional()
});

/** 同一 IP/桶内：失败或可疑尝试的滑动窗口限流，防爆破 */
const loginRateLimit = { prefix: "login", limit: 20, windowSeconds: 15 * 60 };

export const authRoutes = new Hono<AppEnv>();

// ===================== 登录：Turnstile → 用户解析（邮箱小写或用户名）→ 验密 → Cookie + 响应体 =====================
// POST /api/auth/login：identifier 可用邮箱或用户名；成功返回 `csrfToken` 供首次 apiFetch 写头
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
  // 失败路径先打满限流桶，防枚举用户与撞库；disabled 也会先 consume 再返回 403
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
  // access 15min；refresh 7d；每次登录/刷新轮换 jti；CSRF 随机 16 字节
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
    quota: await getQuota(c.env, user.id),
    providerCapabilities: await getProviderCapabilitiesForUser(c.env, user.id),
    generationEntry: await getGenerationEntryForUser(c.env, publicUser(user)),
    promptAssistantEnabled: isPromptAssistantEnabled(c.env)
  });
});

// ===================== 登出 / 刷新 / 改密 =====================
// 登出：能解析 access 则黑 jti（TTL 与 access 剩余寿命一致策略上取 15min）；再清客户端 Cookie
authRoutes.post("/logout", requireAuth, async (c) => {
  const token = readAccessToken(c);
  if (token) {
    try {
      const payload = await verifyJwt(c.env.JWT_SECRET, token, "access");
      await c.env.KV.put(`jwt:blacklist:${payload.jti}`, "1", { expirationTtl: 15 * 60 });
    } catch {
      // 已过期 access 无有效 jti，仍 `clearAuthCookies` 清客户端态
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

// refresh：仅读 httpOnly refresh Cookie；轮换**整组** token+csrf，并更新 `lastLoginAt`（视为活跃）
authRoutes.post("/refresh", async (c) => {
  const token = readRefreshToken(c);
  if (!token) throw appError("UNAUTHORIZED", "Refresh token required");
  let payload;
  try {
    payload = await verifyJwt(c.env.JWT_SECRET, token, "refresh");
  } catch {
    clearAuthCookies(c);
    throw appError("UNAUTHORIZED", "Invalid or expired refresh token");
  }
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
  return c.json({
    user: publicUser(user),
    csrfToken: csrf,
    quota: await getQuota(c.env, user.id),
    providerCapabilities: await getProviderCapabilitiesForUser(c.env, user.id),
    generationEntry: await getGenerationEntryForUser(c.env, publicUser(user)),
    promptAssistantEnabled: isPromptAssistantEnabled(c.env)
  });
});

// 改密：不使旧 token 失效（若需「全端下线」可扩展为黑当前 jti 或版本号）
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

/** 响应中剔除 passwordHash 等敏感字段，仅公开属性 */
function publicUser(user: {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: AuthUser["role"];
  status: AuthUser["status"];
  preferredProviderKeyId?: string | null;
}): AuthUser {
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
