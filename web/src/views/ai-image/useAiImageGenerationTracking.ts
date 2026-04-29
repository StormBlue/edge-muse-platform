import { trackGenerationEvent, type ClientGenerationEventInput } from "@/api/generation";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";

type AiImageSubmitGenerationInput = {
  promptSource: "case" | "assistant" | "user" | "unknown";
  selectedCaseId?: string;
  mode: string;
  size: string;
  n: number;
  referenceImageCount: number;
};

export function useAiImageGenerationTracking() {
  function trackPromptCaseSelected(item: Pick<PromptCase, "id" | "category" | "sourceRepo">) {
    void trackGenerationEvent(buildAiImagePromptCaseSelectedEvent(item));
  }

  function trackAssistantStarted(input: { caseId?: string; mode: PromptCaseMode }) {
    void trackGenerationEvent(
      buildAiImageAssistantStartedEvent({
        caseId: input.caseId,
        mode: input.mode
      })
    );
  }

  function trackAssistantPromptFilled(input: {
    caseId?: string;
    prompt: string;
    turnCount: number;
  }) {
    void trackGenerationEvent(
      buildAiImageAssistantPromptFilledEvent({
        caseId: input.caseId,
        promptLength: input.prompt.length,
        turnCount: input.turnCount
      })
    );
  }

  function buildSubmitGenerationEvent(input: AiImageSubmitGenerationInput) {
    return buildAiImageSubmitGenerationEvent(input);
  }

  return {
    trackPromptCaseSelected,
    trackAssistantStarted,
    trackAssistantPromptFilled,
    buildSubmitGenerationEvent
  };
}

export function buildAiImagePromptCaseSelectedEvent(
  item: Pick<PromptCase, "id" | "category" | "sourceRepo">
): ClientGenerationEventInput {
  return {
    eventName: "prompt_case_selected",
    route: "/ai-image",
    caseId: item.id,
    metadata: {
      category: item.category,
      sourceRepo: item.sourceRepo
    }
  };
}

export function buildAiImageAssistantStartedEvent(input: {
  caseId?: string;
  mode: PromptCaseMode;
}): ClientGenerationEventInput {
  return {
    eventName: "assistant_started",
    route: "/ai-image",
    caseId: input.caseId,
    metadata: {
      mode: input.mode
    }
  };
}

export function buildAiImageAssistantPromptFilledEvent(input: {
  caseId?: string;
  promptLength: number;
  turnCount: number;
}): ClientGenerationEventInput {
  return {
    eventName: "assistant_prompt_filled",
    route: "/ai-image",
    caseId: input.caseId,
    metadata: {
      promptLength: input.promptLength,
      turnCount: input.turnCount
    }
  };
}

export function buildAiImageSubmitGenerationEvent(input: AiImageSubmitGenerationInput) {
  return {
    route: "/ai-image" as const,
    caseId: input.promptSource === "case" ? input.selectedCaseId : undefined,
    metadata: {
      mode: input.mode,
      size: input.size,
      n: input.n,
      referenceImageCount: input.referenceImageCount,
      promptSource: input.promptSource,
      caseContextId: input.promptSource === "case" ? undefined : input.selectedCaseId
    }
  };
}
