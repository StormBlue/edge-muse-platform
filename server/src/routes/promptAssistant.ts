/**
 * AI 提示词助手接口。
 *
 * 只接受文生图/图生图；日志只记录长度、模式、轮次和降级状态，不记录完整 prompt。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  assistantLogPayload,
  isPromptAssistantEnabled,
  promptAssistantTurnSchema,
  runPromptAssistantTurn
} from "../lib/promptAssistant";
import { appError } from "../lib/errors";
import { logWarn } from "../lib/log";
import { recordGenerationEvent } from "../lib/generationEntry";
import { consumeRateLimit } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const promptAssistantRoutes = new Hono<AppEnv>();

promptAssistantRoutes.post(
  "/turn",
  requireAuth,
  zValidator("json", promptAssistantTurnSchema),
  async (c) => {
    if (!isPromptAssistantEnabled(c.env)) {
      throw appError("FORBIDDEN", "Prompt assistant is disabled");
    }
    await consumeRateLimit(c, {
      prefix: "prompt-assistant",
      limit: 30,
      windowSeconds: 24 * 60 * 60
    });
    const user = c.get("user");
    const input = c.req.valid("json");
    const result = await runPromptAssistantTurn(c.env, input);
    await recordAssistantGenerationEvents(c.env, user, input, result, c.get("traceId"));
    console.info("prompt_assistant_turn", {
      traceId: c.get("traceId"),
      userId: user.id,
      ...assistantLogPayload(input, result)
    });
    return c.json(result);
  }
);

type PromptAssistantUser = Parameters<typeof recordGenerationEvent>[1];
type PromptAssistantInput = Parameters<typeof assistantLogPayload>[0];
type PromptAssistantResult = Parameters<typeof assistantLogPayload>[1];

async function recordAssistantGenerationEvents(
  env: Cloudflare.Env,
  user: PromptAssistantUser,
  input: PromptAssistantInput,
  result: PromptAssistantResult,
  traceId: string
) {
  const metadata = {
    mode: input.mode,
    turnIndex: input.turnIndex,
    messageCount: input.messages.length,
    degraded: result.degraded,
    model: result.model
  };
  try {
    await recordGenerationEvent(env, user, {
      eventName: "assistant_turn_requested",
      route: "/ai-image",
      caseId: input.caseId,
      metadata
    });
    if (result.degraded) {
      await recordGenerationEvent(env, user, {
        eventName: "assistant_turn_degraded",
        route: "/ai-image",
        caseId: input.caseId,
        metadata
      });
    }
  } catch (error) {
    logWarn("prompt_assistant.generation_event_failed", {
      traceId,
      userId: user.id,
      message: error instanceof Error ? error.message : "unknown"
    });
  }
}
