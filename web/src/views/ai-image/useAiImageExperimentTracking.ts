import { computed } from "vue";
import { trackExperimentEvent, type ClientExperimentEventInput } from "@/api/experiments";
import { isDirectGenerationAccess } from "@/components/layout/generationExperimentEvents";
import type { GenerationExperience } from "@/stores/auth";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";

type AiImageTrackingAuthState = {
  generationExperience: GenerationExperience | null | undefined;
  isSysadmin: boolean;
};

type AiImageSubmitExperimentInput = {
  promptSource: "case" | "assistant" | "user" | "unknown";
  selectedCaseId?: string;
  mode: string;
  size: string;
  n: number;
  referenceImageCount: number;
  directAccess: boolean;
};

export function useAiImageExperimentTracking(auth: AiImageTrackingAuthState) {
  const directAccess = computed(() =>
    resolveAiImageDirectAccess(auth.generationExperience, auth.isSysadmin)
  );

  function trackPromptCaseSelected(item: Pick<PromptCase, "id" | "category" | "sourceRepo">) {
    void trackExperimentEvent(buildAiImagePromptCaseSelectedEvent(item, directAccess.value));
  }

  function trackAssistantStarted(input: { caseId?: string; mode: PromptCaseMode }) {
    void trackExperimentEvent(
      buildAiImageAssistantStartedEvent({
        caseId: input.caseId,
        mode: input.mode,
        directAccess: directAccess.value
      })
    );
  }

  function trackAssistantPromptFilled(input: {
    caseId?: string;
    prompt: string;
    turnCount: number;
  }) {
    void trackExperimentEvent(
      buildAiImageAssistantPromptFilledEvent({
        caseId: input.caseId,
        promptLength: input.prompt.length,
        turnCount: input.turnCount,
        directAccess: directAccess.value
      })
    );
  }

  function buildSubmitExperimentEvent(input: AiImageSubmitExperimentInput) {
    return buildAiImageSubmitExperimentEvent(input);
  }

  return {
    directAccess,
    trackPromptCaseSelected,
    trackAssistantStarted,
    trackAssistantPromptFilled,
    buildSubmitExperimentEvent
  };
}

export function resolveAiImageDirectAccess(
  generationExperience: GenerationExperience | null | undefined,
  isSysadmin: boolean
) {
  return isDirectGenerationAccess("/ai-image", generationExperience ?? null, isSysadmin);
}

export function buildAiImagePromptCaseSelectedEvent(
  item: Pick<PromptCase, "id" | "category" | "sourceRepo">,
  directAccess: boolean
): ClientExperimentEventInput {
  return {
    eventName: "prompt_case_selected",
    route: "/ai-image",
    caseId: item.id,
    metadata: {
      category: item.category,
      sourceRepo: item.sourceRepo,
      directAccess
    }
  };
}

export function buildAiImageAssistantStartedEvent(input: {
  caseId?: string;
  mode: PromptCaseMode;
  directAccess: boolean;
}): ClientExperimentEventInput {
  return {
    eventName: "assistant_started",
    route: "/ai-image",
    caseId: input.caseId,
    metadata: {
      mode: input.mode,
      directAccess: input.directAccess
    }
  };
}

export function buildAiImageAssistantPromptFilledEvent(input: {
  caseId?: string;
  promptLength: number;
  turnCount: number;
  directAccess: boolean;
}): ClientExperimentEventInput {
  return {
    eventName: "assistant_prompt_filled",
    route: "/ai-image",
    caseId: input.caseId,
    metadata: {
      promptLength: input.promptLength,
      turnCount: input.turnCount,
      directAccess: input.directAccess
    }
  };
}

export function buildAiImageSubmitExperimentEvent(input: AiImageSubmitExperimentInput) {
  return {
    route: "/ai-image" as const,
    caseId: input.promptSource === "case" ? input.selectedCaseId : undefined,
    metadata: {
      mode: input.mode,
      size: input.size,
      n: input.n,
      referenceImageCount: input.referenceImageCount,
      promptSource: input.promptSource,
      caseContextId: input.promptSource === "case" ? undefined : input.selectedCaseId,
      directAccess: input.directAccess
    }
  };
}
