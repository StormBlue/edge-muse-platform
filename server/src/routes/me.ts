import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { audit } from "../lib/audit";
import { now } from "../lib/id";
import { getQuota } from "../lib/quota";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const meRoutes = new Hono<AppEnv>();

meRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ user, quota: await getQuota(c.env, user.id) });
});

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
      quota: await getQuota(c.env, user.id)
    });
  }
);
