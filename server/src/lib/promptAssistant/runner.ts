import { logWarn } from "../log";
import type { AppBindings } from "../../types";
import { optionsForModel, requestForModel } from "./request";
import { isRetriableAiError, summarizePromptAssistantError, wait } from "./errors";
import type { PromptAssistantTurnInput } from "./schema";

const AI_RETRY_DELAYS_MS = [500, 1500, 3500];

export async function runPromptAssistantModelWithRetry(
  env: AppBindings,
  model: string,
  input: PromptAssistantTurnInput
) {
  if (!env.AI) throw new Error("Workers AI binding is not configured");
  const request = requestForModel(model, input);
  const options = optionsForModel(env, model);
  for (let attempt = 0; attempt <= AI_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await env.AI.run(model, request, options);
    } catch (error) {
      const willRetry = attempt < AI_RETRY_DELAYS_MS.length && isRetriableAiError(error);
      if (!willRetry) throw error;
      logWarn("prompt_assistant.ai_retry", {
        model,
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        error: summarizePromptAssistantError(error)
      });
      await wait(AI_RETRY_DELAYS_MS[attempt]);
    }
  }
}
