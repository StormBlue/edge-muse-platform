import { appError } from "../errors";
import type { PromptAssistantResult, PromptAssistantTurnInput } from "./schema";

export function assistantLogPayload(
  input: PromptAssistantTurnInput,
  result: PromptAssistantResult
) {
  return {
    mode: input.mode,
    caseId: input.caseId ?? null,
    turnIndex: input.turnIndex,
    messageCount: input.messages.length,
    inputLength: totalInputLength(input),
    outputLength: result.assistantMessage.length + (result.finalPrompt?.length ?? 0),
    readiness: result.readiness,
    degraded: result.degraded,
    degradedReason: result.degradedReason ?? null,
    model: result.model
  };
}

export function assertTotalInputLength(input: PromptAssistantTurnInput) {
  if (totalInputLength(input) > 6000) {
    throw appError("PAYLOAD_TOO_LARGE", "Prompt assistant input is too large");
  }
}

function totalInputLength(input: PromptAssistantTurnInput) {
  return (
    input.messages.reduce((sum, message) => sum + message.content.length, 0) +
    (input.caseTitle?.length ?? 0) +
    (input.casePromptSummary?.length ?? 0) +
    (input.casePromptTemplate?.length ?? 0) +
    (input.caseCategory?.length ?? 0) +
    (input.caseTags?.join("").length ?? 0) +
    (input.caseRecommendedSize?.length ?? 0) +
    (input.referenceBrief?.length ?? 0)
  );
}
