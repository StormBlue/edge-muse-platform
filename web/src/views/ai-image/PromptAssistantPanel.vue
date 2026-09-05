<script setup lang="ts">
/**
 * 自然对话式 Prompt 助手面板。
 *
 * 助手只负责生成最终 prompt；回填后仍需要用户点击“生成”，不会直接消耗生图配额。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { RotateCcw, Send, WandSparkles } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import PromptAssistantFinalPrompt from "./PromptAssistantFinalPrompt.vue";
import PromptAssistantMessages from "./PromptAssistantMessages.vue";
import { promptAssistantLocaleFromUiLocale } from "./promptAssistantLocale";
import { useUiStore } from "@/stores/ui";
import type { ProviderCapabilities } from "@/stores/auth";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";
import type { AssistantMessage, AssistantResponse } from "./promptAssistantTypes";
import { assistantReviewMessages } from "./promptAssistantMessages";

const props = withDefaults(
  defineProps<{
    mode: PromptCaseMode;
    caseItem: PromptCase | null;
    provider: ProviderCapabilities | null;
    referenceCount: number;
    referenceDescription: string;
    referenceContextKey: string;
    disabled?: boolean;
    currentPrompt?: string;
    creativeBrief?: string;
    accountContextKey?: string;
    chrome?: "panel" | "embedded";
  }>(),
  { chrome: "panel", disabled: false, currentPrompt: "", creativeBrief: "", accountContextKey: "" }
);

const emit = defineEmits<{
  fill: [value: { prompt: string; recommendedSize: string; turnCount: number; auto?: boolean }];
  open: [];
}>();

const { t } = useI18n({
  useScope: "local",
  messages: assistantReviewMessages,
  missingWarn: false,
  fallbackWarn: false
});
const ui = useUiStore();
const MAX_ASSISTANT_TURNS = 8;
const messages = ref<AssistantMessage[]>([]);
const input = ref("");
const loading = ref(false);
const latest = ref<AssistantResponse | null>(null);
const editableFinalPrompt = ref("");
let requestSeq = 0;
let requestController: AbortController | null = null;
const originalPrompt = ref("");
const errorMessage = ref("");
const retryFinalize = ref(false);

const completedAssistantReplies = computed(
  () => messages.value.filter((message) => message.role === "assistant").length
);
const canSend = computed(
  () =>
    input.value.trim().length > 0 &&
    input.value.trim().length <= 1500 &&
    !loading.value &&
    !props.disabled &&
    completedAssistantReplies.value < MAX_ASSISTANT_TURNS
);
const finalPrompt = computed(() => latest.value?.finalPrompt ?? "");
const assistantDegraded = computed(() => latest.value?.degraded ?? false);
const assistantWarnings = computed(() => latest.value?.warnings ?? []);
const showAssistantStatus = computed(
  () => !finalPrompt.value && (assistantDegraded.value || assistantWarnings.value.length > 0)
);
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
    props.accountContextKey,
    props.provider?.providerId ?? "",
    props.provider?.providerKeyId ?? "",
    props.provider?.providerKeyGroupId ?? "",
    props.provider?.requestFormat ?? "",
    props.provider?.model ?? "",
    props.provider?.supportedSizes?.join("|") ?? "",
    props.provider?.maxReferenceImages ?? "",
    // 图生图参考图会影响追问策略；同数量替换图片也必须重开上下文。
    props.referenceContextKey,
    props.referenceCount,
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

watch(
  contextKey,
  () => {
    reset();
  },
  { flush: "sync" }
);
onBeforeUnmount(reset);

async function sendTurn() {
  await submitAssistantTurn({ forceFinalize: false });
}

async function finalizePrompt() {
  await submitAssistantTurn({ forceFinalize: true });
}

async function submitAssistantTurn(options: { forceFinalize: boolean }) {
  const userInput = input.value.trim();
  if (userInput.length > 1500) return;
  if (options.forceFinalize ? !canFinalize.value : !canSend.value) return;
  const currentSeq = ++requestSeq;
  const currentContextKey = contextKey.value;
  const promptSnapshot = props.currentPrompt;
  requestController?.abort();
  requestController = new AbortController();
  const nextMessages: AssistantMessage[] = userInput
    ? [...messages.value, { role: "user", content: userInput }]
    : [...messages.value];
  const turnIndex = Math.min(completedAssistantReplies.value, MAX_ASSISTANT_TURNS - 1);
  // 上下文仅随本轮发送，不重复写入对话历史。消息条数及长度遵循服务端 schema。
  const context = [
    promptSnapshot.trim() && `Current prompt:\n${promptSnapshot.trim()}`,
    props.creativeBrief.trim() && `Creative brief:\n${props.creativeBrief.trim()}`
  ]
    .filter(Boolean)
    .join("\n\n");
  const contextMessages: AssistantMessage[] = [];
  // 长提示词分消息发送，避免静默截断；最多保留八条上下文，为本轮及最近对话留出空间。
  if (context.length > 12000) {
    errorMessage.value = t("review.contextTooLong");
    return;
  }
  for (let offset = 0; offset < context.length; offset += 1500) {
    const content = context.slice(offset, offset + 1500).trim();
    if (content) contextMessages.push({ role: "user", content });
  }
  loading.value = true;
  errorMessage.value = "";
  retryFinalize.value = options.forceFinalize;
  try {
    const result = await apiFetch<AssistantResponse>("/prompt-assistant/turn", {
      method: "POST",
      signal: requestController.signal,
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
        referenceBrief: referenceBrief.value?.slice(0, 1000),
        messages: [...contextMessages, ...nextMessages.slice(-(16 - contextMessages.length))]
      })
    });
    if (currentSeq !== requestSeq || currentContextKey !== contextKey.value) return;
    latest.value = result;
    editableFinalPrompt.value = result.finalPrompt ?? "";
    originalPrompt.value = promptSnapshot;
    input.value = "";
    messages.value = [...nextMessages, { role: "assistant", content: result.assistantMessage }];
  } catch (error) {
    if (currentSeq !== requestSeq || currentContextKey !== contextKey.value) return;
    const message =
      error && typeof error === "object" && "error" in error
        ? (error as { error: { message: string } }).error.message
        : t("aiImage.assistantFailed");
    errorMessage.value = message;
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

async function copyFinalPrompt() {
  const prompt = editableFinalPrompt.value.trim();
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    toast.success(t("promptCases.promptCopied"));
  } catch {
    toast.error(t("review.copiedFailed"));
  }
}

function applyPrompt(paragraphs?: string[]) {
  if (props.disabled || loading.value) return;
  const prompt = paragraphs
    ? [props.currentPrompt.trim(), ...paragraphs].filter(Boolean).join("\n\n")
    : editableFinalPrompt.value.trim();
  if (!prompt) return;
  emit("fill", {
    prompt,
    // 采纳动作只影响已审阅的文本；画幅由创作器中的显式参数控件决定。
    recommendedSize: "",
    turnCount: completedAssistantReplies.value,
    auto: false
  });
}

function reset() {
  // 即使面板因账户或能力变化被禁用，旧请求也必须失效。
  requestSeq += 1;
  requestController?.abort();
  requestController = null;
  messages.value = [];
  input.value = "";
  latest.value = null;
  editableFinalPrompt.value = "";
  loading.value = false;
  errorMessage.value = "";
  originalPrompt.value = "";
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
      </div>
      <Button
        class="h-8 shrink-0 whitespace-nowrap text-xs"
        variant="secondary"
        type="button"
        :disabled="disabled"
        @click="reset"
      >
        <RotateCcw class="h-3.5 w-3.5" />
        {{ t("aiImage.restartAssistant") }}
      </Button>
    </div>

    <PromptAssistantMessages :loading="loading" :messages="messages" />

    <form class="border-t border-border p-3" @submit.prevent="sendTurn">
      <p v-if="limitReached" class="mb-2 text-xs leading-5 text-muted-foreground">
        {{ t("aiImage.assistantLimitReached") }}
      </p>
      <Textarea
        v-model="input"
        maxlength="1500"
        class="min-h-20 resize-none p-3 text-sm leading-6"
        :placeholder="t('aiImage.assistantInputPlaceholder')"
        :disabled="disabled || loading || completedAssistantReplies >= MAX_ASSISTANT_TURNS"
        @keydown.enter="onInputEnter"
      />
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p v-if="input.length > 1500" class="text-xs text-destructive">{{ t("review.tooLong") }}</p>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            type="button"
            :disabled="!canFinalize"
            data-testid="finalize-assistant-prompt"
            @click="finalizePrompt"
          >
            <WandSparkles class="h-4 w-4" />
            {{ t("aiImage.finalizeAssistantPrompt") }}
          </Button>
          <Button type="submit" :disabled="!canSend">
            <Send class="h-4 w-4" />
            {{ t("aiImage.sendAssistantMessage") }}
          </Button>
        </div>
      </div>
      <div
        v-if="errorMessage"
        class="mt-2 flex items-center justify-between gap-2 text-xs text-destructive"
        role="alert"
      >
        <p>{{ errorMessage }}</p>
        <Button
          type="button"
          variant="secondary"
          :disabled="disabled || loading"
          data-testid="retry-assistant"
          @click="submitAssistantTurn({ forceFinalize: retryFinalize })"
        >
          {{ t("review.retry") }}
        </Button>
      </div>
    </form>

    <div
      v-if="showAssistantStatus"
      class="border-t border-border px-3 py-2 text-xs leading-5 text-muted-foreground"
    >
      <p class="font-medium text-foreground">
        {{ assistantDegraded ? t("aiImage.assistantDegraded") : t("aiImage.assistantWarnings") }}
      </p>
      <ul v-if="assistantWarnings.length" class="mt-1 list-disc space-y-1 pl-4">
        <li v-for="warning in assistantWarnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>

    <PromptAssistantFinalPrompt
      v-model="editableFinalPrompt"
      :disabled="disabled || loading"
      :visible="Boolean(finalPrompt)"
      :warnings="assistantWarnings"
      :original-prompt="originalPrompt"
      :current-prompt="currentPrompt"
      @copy="copyFinalPrompt"
      @apply="applyPrompt()"
      @append="applyPrompt"
    />
  </div>
</template>

<style scoped>
.prompt-assistant-panel {
  background: color-mix(in oklch, var(--card), transparent 10%);
  box-shadow: var(--shadow-panel);
}

.prompt-assistant-panel :deep(.prompt-assistant-messages) {
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--accent), transparent 95%), transparent 10rem),
    color-mix(in oklch, var(--muted), transparent 72%);
}
</style>
