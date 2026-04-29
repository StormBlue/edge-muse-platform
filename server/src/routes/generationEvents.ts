/**
 * 普通用户生成入口事件采集。
 *
 * 只记录页面与漏斗事件，不做 A/B 分配或实验归因。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { clientGenerationEventSchema, recordGenerationEvent } from "../lib/generationEntry";
import { requireAuth } from "../middleware/auth";
import { consumeRateLimit } from "../middleware/rateLimit";
import type { AppEnv } from "../types";

export const generationEventRoutes = new Hono<AppEnv>();

generationEventRoutes.post(
  "/events",
  requireAuth,
  zValidator("json", clientGenerationEventSchema),
  async (c) => {
    await consumeRateLimit(c, {
      prefix: "generation-events",
      limit: 60,
      windowSeconds: 60
    });
    await recordGenerationEvent(c.env, c.get("user"), c.req.valid("json"));
    return c.body(null, 204);
  }
);
