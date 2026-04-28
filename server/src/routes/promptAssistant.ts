/**
 * AI 提示词助手接口。
 *
 * 只接受文生图/图生图；日志只记录长度、模式、轮次和降级状态，不记录完整 prompt。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  assistantLogPayload,
  promptAssistantTurnSchema,
  runPromptAssistantTurn
} from "../lib/promptAssistant";
import { consumeRateLimit } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const promptAssistantRoutes = new Hono<AppEnv>();

promptAssistantRoutes.post(
  "/turn",
  requireAuth,
  zValidator("json", promptAssistantTurnSchema),
  async (c) => {
    await consumeRateLimit(c, {
      prefix: "prompt-assistant",
      limit: 30,
      windowSeconds: 24 * 60 * 60
    });
    const input = c.req.valid("json");
    const result = await runPromptAssistantTurn(c.env, input);
    console.info("prompt_assistant_turn", {
      traceId: c.get("traceId"),
      userId: c.get("user").id,
      ...assistantLogPayload(input, result)
    });
    return c.json(result);
  }
);
