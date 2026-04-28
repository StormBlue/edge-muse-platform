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

  function trackAssistantPromptFilled(caseId: string | undefined, prompt: string) {
    void trackExperimentEvent(
      buildAiImageAssistantPromptFilledEvent({
        caseId,
        promptLength: prompt.length,
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
  directAccess: boolean;
}): ClientExperimentEventInput {
  return {
    eventName: "assistant_prompt_filled",
    route: "/ai-image",
    caseId: input.caseId,
    metadata: {
      promptLength: input.promptLength,
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
      referenceImageCount: input.referenceImageCount,
      promptSource: input.promptSource,
      caseContextId: input.promptSource === "case" ? undefined : input.selectedCaseId,
      directAccess: input.directAccess
    }
  };
}
