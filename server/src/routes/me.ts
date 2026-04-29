/**
 * 当前登录用户（`/api/me`）：
 * - GET：`user` 来自 `requireAuth` 中间件（库表 active 用户），`quota` 由 `getQuota` 现算。
 * - PATCH：仅允许改昵称；响应里 `user` 为**合并后**对象（昵称新值，其余与 JWT 注入一致）。
 */
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { audit } from "../lib/audit";
import { getGenerationEntryForUser } from "../lib/generationEntry";
import { now } from "../lib/id";
import { isPromptAssistantEnabled } from "../lib/promptAssistant";
import { getProviderCapabilitiesForUser } from "../lib/providerKeys";
import { getQuota } from "../lib/quota";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const meRoutes = new Hono<AppEnv>();

// GET：应用首屏/路由守卫调用；与 auth store `bootstrap` 对齐
meRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    user,
    quota: await getQuota(c.env, user.id),
    providerCapabilities: await getProviderCapabilitiesForUser(c.env, user.id),
    generationEntry: await getGenerationEntryForUser(c.env, user),
    promptAssistantEnabled: isPromptAssistantEnabled(c.env)
  });
});

// PATCH /api/me：仅改昵称；响应仍带刷新后的 quota 以便侧栏与设置页数字一致
meRoutes.patch(
  "/",
  requireAuth,
  zValidator("json", z.object({ nickname: z.string().min(1).max(40) })),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    await getDb(c.env)
      .update(users)
      .set({ nickname: body.nickname, updatedAt: now() })
      .where(eq(users.id, user.id));
    await audit(c.env, {
      actorId: user.id,
      action: "user.update_profile",
      targetType: "user",
      targetId: user.id,
      payload: body
    });
    return c.json({
      user: { ...user, nickname: body.nickname },
      quota: await getQuota(c.env, user.id),
      providerCapabilities: await getProviderCapabilitiesForUser(c.env, user.id),
      generationEntry: await getGenerationEntryForUser(c.env, user),
      promptAssistantEnabled: isPromptAssistantEnabled(c.env)
    });
  }
);
