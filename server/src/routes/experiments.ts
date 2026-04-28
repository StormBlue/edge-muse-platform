/**
 * 普通用户实验事件采集。
 *
 * 事件只写结构化字段，服务端重新解析当前分配，避免前端伪造 variant 污染指标。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { clientExperimentEventSchema, recordExperimentEvent } from "../lib/experiments";
import { requireAuth } from "../middleware/auth";
import { consumeRateLimit } from "../middleware/rateLimit";
import type { AppEnv } from "../types";

export const experimentRoutes = new Hono<AppEnv>();

experimentRoutes.post(
  "/events",
  requireAuth,
  zValidator("json", clientExperimentEventSchema),
  async (c) => {
    await consumeRateLimit(c, {
      prefix: "experiment-events",
      limit: 60,
      windowSeconds: 60
    });
    await recordExperimentEvent(c.env, c.get("user"), c.req.valid("json"));
    return c.body(null, 204);
  }
);
