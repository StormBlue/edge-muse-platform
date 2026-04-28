<script setup lang="ts">
/**
 * 自然对话式 Prompt 助手面板。
 *
 * 助手只负责生成最终 prompt；回填后仍需要用户点击“生成”，不会直接消耗生图配额。
 */
import { computed, ref, watch } from "vue";
import { RotateCcw, Send } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { trackExperimentEvent } from "@/api/experiments";
import PromptAssistantFinalPrompt from "./PromptAssistantFinalPrompt.vue";
import PromptAssistantMessages from "./PromptAssistantMessages.vue";
import type { ProviderCapabilities } from "@/stores/auth";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";
import type { AssistantMessage, AssistantResponse } from "./promptAssistantTypes";

const props = defineProps<{
  mode: PromptCaseMode;
  caseItem: PromptCase | null;
  provider: ProviderCapabilities | null;
  referenceCount: number;
}>();

const emit = defineEmits<{
  fill: [value: { prompt: string; recommendedSize: string }];
}>();

const { t } = useI18n();
const MAX_ASSISTANT_TURNS = 8;
const messages = ref<AssistantMessage[]>([]);
const input = ref("");
const loading = ref(false);
const latest = ref<AssistantResponse | null>(null);
const editableFinalPrompt = ref("");

const completedAssistantReplies = computed(
  () => messages.value.filter((message) => message.role === "assistant").length
);
const canSend = computed(
  () =>
    input.value.trim().length > 0 &&
    !loading.value &&
    completedAssistantReplies.value < MAX_ASSISTANT_TURNS
);
const finalPrompt = computed(() => latest.value?.finalPrompt ?? "");
const limitReached = computed(
  () =>
    !loading.value && !finalPrompt.value && completedAssistantReplies.value >= MAX_ASSISTANT_TURNS
);

watch(finalPrompt, (value) => {
  editableFinalPrompt.value = value;
});

async function sendTurn() {
  if (!canSend.value) return;
  const isFirstTurn = messages.value.length === 0;
  const nextMessages: AssistantMessage[] = [
    ...messages.value,
    { role: "user", content: input.value.trim() }
  ];
  input.value = "";
  messages.value = nextMessages;
  loading.value = true;
  if (isFirstTurn) {
    void trackExperimentEvent({
      eventName: "assistant_started",
      route: "/ai-image",
      caseId: props.caseItem?.id,
      metadata: { mode: props.mode }
    });
  }
  try {
    const result = await apiFetch<AssistantResponse>("/prompt-assistant/turn", {
      method: "POST",
      body: JSON.stringify({
        mode: props.mode,
        locale: "zh-CN",
        turnIndex: completedAssistantReplies.value,
        caseId: props.caseItem?.id,
        caseTitle: props.caseItem?.title,
        casePromptTemplate: props.caseItem?.promptTemplate,
        provider: props.provider
          ? {
              model: props.provider.model,
              supportedSizes: props.provider.supportedSizes,
              maxReferenceImages: props.provider.maxReferenceImages
            }
          : undefined,
        referenceBrief:
          props.mode === "image2image"
            ? t("aiImage.referenceBrief", { count: props.referenceCount })
            : undefined,
        messages: nextMessages
      })
    });
    latest.value = result;
    messages.value = [...nextMessages, { role: "assistant", content: result.assistantMessage }];
  } catch (error) {
    const message =
      error && typeof error === "object" && "error" in error
        ? (error as { error: { message: string } }).error.message
        : t("aiImage.assistantFailed");
    toast.error(message);
  } finally {
    loading.value = false;
  }
}

function fillPrompt() {
  const prompt = editableFinalPrompt.value.trim();
  if (!prompt) return;
  emit("fill", {
    prompt,
    recommendedSize: latest.value?.recommendedSize ?? "1024x1024"
  });
  toast.success(t("aiImage.promptFilled"));
}

function copyFinalPrompt() {
  const prompt = editableFinalPrompt.value.trim();
  if (!prompt) return;
  void navigator.clipboard.writeText(prompt);
  toast.success(t("promptCases.promptCopied"));
}

function reset() {
  messages.value = [];
  input.value = "";
  latest.value = null;
  editableFinalPrompt.value = "";
}
</script>

<template>
  <div class="rounded-lg border border-border">
    <div class="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div>
        <h3 class="text-sm font-semibold">{{ t("aiImage.assistantTitle") }}</h3>
        <p class="text-xs text-muted-foreground">
          {{ t("aiImage.assistantSubtitle") }}
        </p>
      </div>
      <button class="ui-button ui-button-secondary h-8 text-xs" type="button" @click="reset">
        <RotateCcw class="h-3.5 w-3.5" />
        {{ t("common.retry") }}
      </button>
    </div>

    <PromptAssistantMessages :loading="loading" :messages="messages" />

    <form class="border-t border-border p-3" @submit.prevent="sendTurn">
      <p v-if="limitReached" class="mb-2 text-xs leading-5 text-muted-foreground">
        {{ t("aiImage.assistantLimitReached") }}
      </p>
      <textarea
        v-model="input"
        class="ui-field min-h-20 resize-none p-3 text-sm leading-6"
        :placeholder="t('aiImage.assistantInputPlaceholder')"
        :disabled="loading || completedAssistantReplies >= MAX_ASSISTANT_TURNS"
      />
      <div class="mt-2 flex justify-end">
        <button class="ui-button ui-button-primary" type="submit" :disabled="!canSend">
          <Send class="h-4 w-4" />
          {{ t("aiImage.sendAssistantMessage") }}
        </button>
      </div>
    </form>

    <div
      v-if="latest?.degraded || latest?.warnings.length"
      class="border-t border-border px-3 py-2 text-xs leading-5 text-muted-foreground"
    >
      <p class="font-medium text-foreground">
        {{ latest.degraded ? t("aiImage.assistantDegraded") : t("aiImage.assistantWarnings") }}
      </p>
      <ul v-if="latest.warnings.length" class="mt-1 list-disc space-y-1 pl-4">
        <li v-for="warning in latest.warnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>

    <PromptAssistantFinalPrompt
      v-model="editableFinalPrompt"
      :visible="Boolean(finalPrompt)"
      @copy="copyFinalPrompt"
      @fill="fillPrompt"
    />
  </div>
</template>
