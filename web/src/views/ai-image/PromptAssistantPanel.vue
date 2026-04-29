<script setup lang="ts">
/**
 * 自然对话式 Prompt 助手面板。
 *
 * 助手只负责生成最终 prompt；回填后仍需要用户点击“生成”，不会直接消耗生图配额。
 */
import { computed, ref, watch } from "vue";
import { RotateCcw, Send, WandSparkles } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import PromptAssistantFinalPrompt from "./PromptAssistantFinalPrompt.vue";
import PromptAssistantMessages from "./PromptAssistantMessages.vue";
import { promptAssistantLocaleFromUiLocale } from "./promptAssistantLocale";
import { useUiStore } from "@/stores/ui";
import type { ProviderCapabilities } from "@/stores/auth";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";
import type { AssistantMessage, AssistantResponse } from "./promptAssistantTypes";

const props = withDefaults(
  defineProps<{
    mode: PromptCaseMode;
    caseItem: PromptCase | null;
    provider: ProviderCapabilities | null;
    referenceCount: number;
    referenceDescription: string;
    referenceContextKey: string;
    disabled?: boolean;
    chrome?: "panel" | "embedded";
  }>(),
  { chrome: "panel", disabled: false }
);

const emit = defineEmits<{
  fill: [value: { prompt: string; recommendedSize: string; turnCount: number; auto?: boolean }];
  open: [];
}>();

const { t } = useI18n();
const ui = useUiStore();
const MAX_ASSISTANT_TURNS = 8;
const messages = ref<AssistantMessage[]>([]);
const input = ref("");
const loading = ref(false);
const latest = ref<AssistantResponse | null>(null);
const editableFinalPrompt = ref("");
let requestSeq = 0;

const completedAssistantReplies = computed(
  () => messages.value.filter((message) => message.role === "assistant").length
);
const canSend = computed(
  () =>
    input.value.trim().length > 0 &&
    !loading.value &&
    !props.disabled &&
    completedAssistantReplies.value < MAX_ASSISTANT_TURNS
);
const finalPrompt = computed(() => latest.value?.finalPrompt ?? "");
const canFinalize = computed(() => !loading.value && !props.disabled && !finalPrompt.value);
const limitReached = computed(
  () =>
    !loading.value && !finalPrompt.value && completedAssistantReplies.value >= MAX_ASSISTANT_TURNS
);
const caseContextKey = computed(() =>
  props.caseItem
    ? [
        props.caseItem.id,
        props.caseItem.title,
        props.caseItem.category,
        props.caseItem.recommendedSize,
        props.caseItem.tags.join("|"),
        props.caseItem.promptSummary,
        props.caseItem.promptTemplate
      ].join("::")
    : ""
);
const contextKey = computed(() =>
  [
    caseContextKey.value,
    props.mode,
    props.provider?.model ?? "",
    props.provider?.supportedSizes?.join("|") ?? "",
    props.provider?.maxReferenceImages ?? "",
    // 图生图参考图会影响追问策略；同数量替换图片也必须重开上下文。
    props.referenceContextKey,
    props.referenceDescription.trim()
  ].join("::")
);
const referenceBrief = computed(() => {
  if (props.mode !== "image2image") return undefined;
  const description = props.referenceDescription.trim();
  return description
    ? t("aiImage.referenceBriefWithDescription", {
        count: props.referenceCount,
        description
      })
    : t("aiImage.referenceBrief", { count: props.referenceCount });
});

watch(finalPrompt, (value) => {
  editableFinalPrompt.value = value;
});

watch(contextKey, () => {
  reset();
});

async function sendTurn() {
  await submitAssistantTurn({ forceFinalize: false });
}

async function finalizePrompt() {
  await submitAssistantTurn({ forceFinalize: true });
}

async function submitAssistantTurn(options: { forceFinalize: boolean }) {
  const userInput = input.value.trim();
  if (options.forceFinalize ? !canFinalize.value : !canSend.value) return;
  const currentSeq = ++requestSeq;
  const currentContextKey = contextKey.value;
  const nextMessages: AssistantMessage[] = userInput
    ? [...messages.value, { role: "user", content: userInput }]
    : [...messages.value];
  const turnIndex = Math.min(completedAssistantReplies.value, MAX_ASSISTANT_TURNS - 1);
  input.value = "";
  messages.value = nextMessages;
  loading.value = true;
  try {
    const result = await apiFetch<AssistantResponse>("/prompt-assistant/turn", {
      method: "POST",
      body: JSON.stringify({
        mode: props.mode,
        locale: promptAssistantLocaleFromUiLocale(ui.locale),
        turnIndex,
        forceFinalize: options.forceFinalize,
        caseId: props.caseItem?.id,
        caseTitle: props.caseItem?.title,
        casePromptSummary: props.caseItem?.promptSummary,
        casePromptTemplate: props.caseItem?.promptTemplate,
        caseCategory: props.caseItem?.category,
        caseTags: props.caseItem?.tags,
        caseRecommendedSize: props.caseItem?.recommendedSize,
        provider: props.provider
          ? {
              model: props.provider.model,
              supportedSizes: props.provider.supportedSizes,
              maxReferenceImages: props.provider.maxReferenceImages
            }
          : undefined,
        referenceBrief: referenceBrief.value,
        messages: nextMessages
      })
    });
    if (currentSeq !== requestSeq || currentContextKey !== contextKey.value) return;
    latest.value = result;
    messages.value = [...nextMessages, { role: "assistant", content: result.assistantMessage }];
    if (result.finalPrompt?.trim()) {
      emit("fill", {
        prompt: result.finalPrompt,
        recommendedSize: result.recommendedSize,
        turnCount: completedAssistantReplies.value,
        auto: true
      });
    }
  } catch (error) {
    if (currentSeq !== requestSeq || currentContextKey !== contextKey.value) return;
    const message =
      error && typeof error === "object" && "error" in error
        ? (error as { error: { message: string } }).error.message
        : t("aiImage.assistantFailed");
    toast.error(message);
  } finally {
    if (currentSeq === requestSeq) loading.value = false;
  }
}

function onInputEnter(event: KeyboardEvent) {
  if (event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  void sendTurn();
}

function notifyOpen() {
  if (props.disabled) return;
  emit("open");
}

function copyFinalPrompt() {
  const prompt = editableFinalPrompt.value.trim();
  if (!prompt) return;
  void navigator.clipboard.writeText(prompt);
  toast.success(t("promptCases.promptCopied"));
}

function reset() {
  if (props.disabled) return;
  requestSeq += 1;
  messages.value = [];
  input.value = "";
  latest.value = null;
  editableFinalPrompt.value = "";
  loading.value = false;
}

defineExpose({ reset });
</script>

<template>
  <div
    class="prompt-assistant-panel flex min-h-0 flex-col overflow-hidden"
    :class="chrome === 'panel' ? 'rounded-lg border border-border' : ''"
    @focusin="notifyOpen"
    @click="notifyOpen"
  >
    <div
      v-if="chrome === 'panel'"
      class="flex items-center justify-between gap-2 border-b border-border px-3 py-2"
    >
      <div class="min-w-0">
        <h3 class="text-sm font-semibold">{{ t("aiImage.assistantTitle") }}</h3>
        <p class="text-xs leading-5 text-muted-foreground">
          {{ t("aiImage.assistantSubtitle") }}
        </p>
      </div>
      <button
        class="ui-button ui-button-secondary h-8 shrink-0 whitespace-nowrap text-xs"
        type="button"
        :disabled="disabled"
        @click="reset"
      >
        <RotateCcw class="h-3.5 w-3.5" />
        {{ t("aiImage.restartAssistant") }}
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
        :disabled="disabled || loading || completedAssistantReplies >= MAX_ASSISTANT_TURNS"
        @keydown.enter="onInputEnter"
      />
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs leading-5 text-muted-foreground">
          {{ t("aiImage.assistantInputShortcutHint") }}
        </p>
        <div class="flex flex-wrap justify-end gap-2">
          <button
            class="ui-button ui-button-secondary"
            type="button"
            :disabled="!canFinalize"
            data-testid="finalize-assistant-prompt"
            @click="finalizePrompt"
          >
            <WandSparkles class="h-4 w-4" />
            {{ t("aiImage.finalizeAssistantPrompt") }}
          </button>
          <button class="ui-button ui-button-primary" type="submit" :disabled="!canSend">
            <Send class="h-4 w-4" />
            {{ t("aiImage.sendAssistantMessage") }}
          </button>
        </div>
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
      :disabled="disabled"
      :visible="Boolean(finalPrompt)"
      @copy="copyFinalPrompt"
    />
  </div>
</template>
