import { computed, ref } from "vue";

export type AiImagePromptSource = "case" | "assistant" | "user" | null;

export function useAiImagePromptState() {
  const finalPrompt = ref("");
  const finalPromptSource = ref<AiImagePromptSource>(null);
  const resettablePrompt = ref("");
  const resettablePromptSource = ref<Exclude<AiImagePromptSource, "user"> | null>(null);

  const canResetPrompt = computed(
    () => Boolean(resettablePromptSource.value) && finalPrompt.value !== resettablePrompt.value
  );

  function setPrompt(value: string, source: Exclude<AiImagePromptSource, null>) {
    finalPrompt.value = value;
    finalPromptSource.value = source;
    if (source === "case" || source === "assistant") {
      resettablePrompt.value = value;
      resettablePromptSource.value = source;
    }
  }

  function setResettablePrompt(value: string, source: Exclude<AiImagePromptSource, "user" | null>) {
    finalPrompt.value = value;
    finalPromptSource.value = source;
    resettablePrompt.value = value;
    resettablePromptSource.value = source;
  }

  function resetPrompt() {
    if (!resettablePromptSource.value) return;
    finalPrompt.value = resettablePrompt.value;
    finalPromptSource.value = resettablePromptSource.value;
  }

  function clearPrompt(options: { discardResetTarget?: boolean } = {}) {
    finalPrompt.value = "";
    finalPromptSource.value = resettablePromptSource.value ? "user" : null;
    if (options.discardResetTarget) discardResetTarget();
  }

  function discardResetTarget() {
    resettablePrompt.value = "";
    resettablePromptSource.value = null;
    if (!finalPrompt.value.trim()) finalPromptSource.value = null;
  }

  return {
    canResetPrompt,
    finalPrompt,
    finalPromptSource,
    resettablePromptSource,
    clearPrompt,
    discardResetTarget,
    resetPrompt,
    setPrompt,
    setResettablePrompt
  };
}
