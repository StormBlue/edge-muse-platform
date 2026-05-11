/**
 * AI 提示词助手领域逻辑。
 *
 * 目标是把普通用户的自然语言需求逐步整理成 GPT-Image 2 可用的专业图片 prompt。
 * Workers AI 不可用或输出不合规时，返回静态降级结果，保证页面流程不中断。
 */
import { DEFAULT_PROMPT_ASSISTANT_MODEL, resolvePromptAssistantModel } from "../aiModelSettings";
import { logWarn } from "../log";
import type { AppBindings } from "../../types";
import { classifyPromptAssistantError, summarizePromptAssistantError } from "./errors";
import { fallbackAssistantResult } from "./fallback";
import { extractAiText, parseAiResult } from "./parse";
import { runPromptAssistantModelWithRetry } from "./runner";
import type { PromptAssistantResult, PromptAssistantTurnInput } from "./schema";
import { assertTotalInputLength } from "./logging";

export async function runPromptAssistantTurn(
  env: AppBindings,
  input: PromptAssistantTurnInput
): Promise<PromptAssistantResult> {
  assertTotalInputLength(input);
  let model = DEFAULT_PROMPT_ASSISTANT_MODEL;
  let aiText = "";
  try {
    model = await resolvePromptAssistantModel(env);
    const result = await runPromptAssistantModelWithRetry(env, model, input);
    aiText = extractAiText(result);
    const parsed = parseAiResult(aiText, input);
    return { ...parsed, degraded: false, degradedReason: null, model };
  } catch (error) {
    const degradedReason = classifyPromptAssistantError(error);
    logWarn("prompt_assistant.degraded", {
      model,
      turnIndex: input.turnIndex,
      messageCount: input.messages.length,
      aiTextLength: aiText.length,
      degradedReason,
      error: summarizePromptAssistantError(error)
    });
    return { ...fallbackAssistantResult(input), degraded: true, degradedReason, model };
  }
}

export { assistantLogPayload } from "./logging";
export { isPromptAssistantEnabled, promptAssistantTurnSchema } from "./schema";
export type { PromptAssistantResult, PromptAssistantTurnInput } from "./schema";
