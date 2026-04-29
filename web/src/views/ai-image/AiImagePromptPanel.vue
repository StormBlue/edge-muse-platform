<script setup lang="ts">
/**
 * AI 图像生成页右侧生成面板。
 *
 * 这里集中处理 prompt 编辑、参考图上传、AI 助手回填和最终提交；
 * 外层页面只负责案例选择和实验事件，避免页面组件继续膨胀。
 */
import { computed, ref } from "vue";
import {
  Copy,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  WandSparkles,
  X
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import AiImageFailurePanel from "./AiImageFailurePanel.vue";
import AiImageReferenceInput from "./AiImageReferenceInput.vue";
import PromptAssistantPanel from "./PromptAssistantPanel.vue";
import { getAiImageSubmitBlockReason } from "./aiImageSubmitValidation";
import type { ProviderCapabilities } from "@/stores/auth";
import type { ImageAttachment } from "@/stores/session";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";
import { imageFilesFromDataTransfer } from "@/utils/referenceImageFiles";
import type { SizeOption } from "@/views/workspace/workspaceOptions";

type PreviewImage = {
  file: File;
  url: string;
};

const props = defineProps<{
  caseItem: PromptCase | null;
  assistantEnabled: boolean;
  canResetPrompt: boolean;
  selectedCaseTitle: string;
  prompt: string;
  mode: PromptCaseMode;
  supportedModes: PromptCaseMode[];
  size: string;
  sizeFallbackNotice: string;
  sizeOptions: SizeOption[];
  provider: ProviderCapabilities | null;
  referenceCount: number;
  previews: PreviewImage[];
  resultImages: ImageAttachment[];
  activeFailed: boolean;
  failedTitle: string;
  failedMessage: string;
  generationProgress: number;
  generationPrompt: string;
  generationStatusLabel: string;
  submitting: boolean;
  hasRunningTask: boolean;
  workflowExpanded: boolean;
}>();

const emit = defineEmits<{
  "update:prompt": [value: string];
  "update:mode": [value: PromptCaseMode];
  "update:size": [value: string];
  addFiles: [files: File[]];
  removeFile: [index: number];
  copyPrompt: [];
  clearPrompt: [];
  fillAssistant: [
    value: { prompt: string; recommendedSize: string; turnCount: number; auto?: boolean }
  ];
  openAssistant: [];
  resetPrompt: [];
  retryFailed: [];
  openImage: [image: ImageAttachment];
  submit: [];
}>();

const { t } = useI18n();
const assistantAnchor = ref<HTMLElement | null>(null);
const assistantPanelRef = ref<{ reset: () => void } | null>(null);
const assistantDialogOpen = ref(false);
const referenceDescription = ref("");
const assistantOpenTrackedKeys = new Set<string>();

const hasPrompt = computed(() => props.prompt.trim().length > 0);
const interactionLocked = computed(() => props.submitting || props.hasRunningTask);
const canAcceptReferenceFiles = computed(
  () => props.mode === "image2image" && !interactionLocked.value
);
const submitDisabled = computed(() =>
  Boolean(
    getAiImageSubmitBlockReason({
      prompt: props.prompt,
      submitting: props.submitting,
      hasRunningTask: props.hasRunningTask,
      mode: props.mode,
      supportedModes: props.supportedModes,
      size: props.size,
      sizeOptions: props.sizeOptions,
      referenceImageCount: props.referenceCount
    })
  )
);
const referenceContextKey = computed(() =>
  [
    props.previews
      .map(({ file }) => `${file.name}:${file.type}:${file.size}:${file.lastModified}`)
      .join("|"),
    referenceDescription.value.trim()
  ].join("::")
);
const assistantOpenKey = computed(() =>
  [props.caseItem?.id ?? "", props.mode, referenceContextKey.value].join("::")
);

function onPromptInput(event: Event) {
  emit("update:prompt", (event.target as HTMLTextAreaElement).value);
}

function onPaste(event: ClipboardEvent) {
  if (!canAcceptReferenceFiles.value) return;
  const pastedFiles = imageFilesFromDataTransfer(event.clipboardData);
  if (!pastedFiles.length) return;
  event.preventDefault();
  addReferenceFiles(pastedFiles);
}

function addReferenceFiles(files: File[]) {
  if (!canAcceptReferenceFiles.value || !files.length) return;
  emit("addFiles", files);
}

function openAssistantView() {
  if (!props.assistantEnabled || interactionLocked.value) return;
  trackAssistantOpen();
  if (!props.workflowExpanded || isMobileAssistantViewport()) {
    assistantDialogOpen.value = true;
    return;
  }
  assistantAnchor.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function trackAssistantOpen() {
  const key = assistantOpenKey.value;
  if (assistantOpenTrackedKeys.has(key)) return;
  assistantOpenTrackedKeys.add(key);
  emit("openAssistant");
}

function fillAssistantPrompt(value: {
  prompt: string;
  recommendedSize: string;
  turnCount: number;
  auto?: boolean;
}) {
  emit("fillAssistant", value);
  if (!value.auto) assistantDialogOpen.value = false;
}

function isMobileAssistantViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}
</script>

<template>
  <div
    class="ai-prompt-workspace"
    :class="{ 'ai-prompt-workspace--expanded': workflowExpanded }"
    @paste="onPaste"
  >
    <section class="prompt-compose-panel panel flex min-h-[32rem] flex-col overflow-hidden">
      <div class="border-b border-border px-4 py-3">
        <h2 class="truncate text-sm font-semibold">{{ selectedCaseTitle }}</h2>
        <p class="mt-1 truncate text-xs text-muted-foreground">
          {{ caseItem ? caseItem.category : t("aiImage.creationMode") }}
        </p>
      </div>
      <div class="thin-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div>
          <p class="mb-2 text-xs font-medium text-muted-foreground">
            {{ t("workspace.generationMode") }}
          </p>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
            <button
              v-for="item in supportedModes"
              :key="item"
              class="h-10 rounded-lg border text-sm font-semibold"
              :class="mode === item ? 'border-primary bg-primary/10' : 'border-border bg-muted/40'"
              type="button"
              :disabled="interactionLocked"
              @click="emit('update:mode', item)"
            >
              {{ t(`workspace.${item}`) }}
            </button>
          </div>
          <p
            v-if="sizeFallbackNotice"
            class="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100"
          >
            {{ sizeFallbackNotice }}
          </p>
        </div>

        <div>
          <p class="mb-2 text-xs font-medium text-muted-foreground">
            {{ t("workspace.canvasSize") }}
          </p>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
            <button
              v-for="option in sizeOptions"
              :key="option.value"
              class="rounded-lg border px-3 py-2 text-left"
              :class="
                size === option.value ? 'border-primary bg-primary/10' : 'border-border bg-muted/40'
              "
              type="button"
              :disabled="interactionLocked"
              @click="emit('update:size', option.value)"
            >
              <span class="block text-sm font-semibold">{{ option.ratio }}</span>
              <span class="text-xs text-muted-foreground">{{ option.label }}</span>
            </button>
          </div>
        </div>

        <label class="block">
          <span class="mb-2 block text-xs font-medium text-muted-foreground">
            {{ t("workspace.prompt") }}
          </span>
          <textarea
            class="ui-field min-h-44 resize-none p-3 text-sm leading-6"
            :placeholder="t('aiImage.promptPlaceholder')"
            :value="prompt"
            :disabled="interactionLocked"
            @input="onPromptInput"
          />
        </label>

        <button
          v-if="assistantEnabled && hasPrompt && !workflowExpanded"
          class="ui-button ui-button-secondary h-9 text-xs"
          type="button"
          :disabled="interactionLocked"
          @click="openAssistantView"
        >
          <WandSparkles class="h-3.5 w-3.5" />
          {{ t("aiImage.openAssistant") }}
        </button>

        <AiImageReferenceInput
          v-if="mode === 'image2image'"
          v-model:description="referenceDescription"
          :can-accept-files="canAcceptReferenceFiles"
          :previews="previews"
          @add-files="addReferenceFiles"
          @remove-file="(index) => emit('removeFile', index)"
        />

        <div v-if="hasRunningTask" class="rounded-lg border border-primary/30 bg-primary/10 p-4">
          <div class="flex items-center gap-3">
            <span
              class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <Loader2 class="h-5 w-5 animate-spin" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold">{{ generationStatusLabel }}</p>
              <p class="mt-1 truncate text-xs text-muted-foreground">
                {{ generationPrompt || t("workspace.generationHint") }}
              </p>
            </div>
            <span class="text-sm font-semibold tabular-nums">
              {{ t("workspace.generationProgress", { percent: generationProgress }) }}
            </span>
          </div>
          <div class="mt-3 h-2.5 overflow-hidden rounded-full bg-primary/15">
            <div
              class="h-full rounded-full bg-primary transition-all duration-500"
              :style="{ width: `${generationProgress}%` }"
            ></div>
          </div>
        </div>

        <div v-if="resultImages.length" class="ai-result-grid">
          <button
            v-for="image in resultImages"
            :key="image.id"
            class="ai-result-tile group"
            type="button"
            :disabled="interactionLocked"
            :title="t('workspace.openPreview')"
            @click="emit('openImage', image)"
          >
            <img class="h-full w-full object-contain" :src="image.url" :alt="image.prompt ?? ''" />
            <span
              class="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/85 text-foreground opacity-0 transition group-hover:opacity-100"
            >
              <ImageIcon class="h-4 w-4" />
            </span>
          </button>
        </div>

        <AiImageFailurePanel
          v-if="activeFailed && !hasRunningTask"
          :message="failedMessage"
          :title="failedTitle"
          @retry="emit('retryFailed')"
        />
      </div>

      <div class="flex flex-wrap justify-between gap-2 border-t border-border p-4">
        <div class="flex gap-2">
          <button
            v-if="canResetPrompt"
            class="ui-button ui-button-secondary"
            type="button"
            :disabled="interactionLocked"
            @click="emit('resetPrompt')"
          >
            <RotateCcw class="h-4 w-4" />
            {{ t("aiImage.resetPrompt") }}
          </button>
          <button
            class="ui-button ui-button-secondary"
            type="button"
            :disabled="interactionLocked || !hasPrompt"
            @click="emit('copyPrompt')"
          >
            <Copy class="h-4 w-4" />
            {{ t("promptCases.copyPrompt") }}
          </button>
          <button
            class="ui-button ui-button-secondary"
            type="button"
            :disabled="interactionLocked || !hasPrompt"
            @click="emit('clearPrompt')"
          >
            <Trash2 class="h-4 w-4" />
            {{ t("aiImage.clearPrompt") }}
          </button>
        </div>
        <button
          class="ui-button ui-button-primary"
          type="button"
          :disabled="submitDisabled"
          @click="emit('submit')"
        >
          <Sparkles class="h-4 w-4" />
          {{ hasRunningTask ? t("workspace.generationRunning") : t("aiImage.oneClickGenerate") }}
        </button>
      </div>
    </section>

    <div
      v-if="assistantEnabled"
      ref="assistantAnchor"
      class="assistant-shell"
      :class="{ 'assistant-shell--dialog': assistantDialogOpen }"
    >
      <div class="assistant-dialog-card">
        <div class="assistant-dialog-header">
          <div class="min-w-0">
            <h3 class="truncate text-sm font-semibold">{{ t("aiImage.assistantTitle") }}</h3>
            <p class="truncate text-xs text-muted-foreground">
              {{ t("aiImage.assistantSubtitle") }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              class="ui-button ui-button-secondary h-8 shrink-0 whitespace-nowrap text-xs"
              type="button"
              :disabled="interactionLocked"
              @click="assistantPanelRef?.reset()"
            >
              <RotateCcw class="h-3.5 w-3.5" />
              {{ t("aiImage.restartAssistant") }}
            </button>
            <button
              class="ui-button ui-button-secondary h-8 w-8 p-0"
              type="button"
              :aria-label="t('viewer.close')"
              :disabled="interactionLocked"
              @click="assistantDialogOpen = false"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>
        <PromptAssistantPanel
          ref="assistantPanelRef"
          :case-item="caseItem"
          :chrome="assistantDialogOpen ? 'embedded' : 'panel'"
          :mode="mode"
          :provider="provider"
          :reference-count="referenceCount"
          :reference-description="referenceDescription"
          :reference-context-key="referenceContextKey"
          :disabled="interactionLocked"
          @fill="fillAssistantPrompt"
          @open="trackAssistantOpen"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.assistant-dialog-header {
  display: none;
}

.ai-result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 0.75rem;
}

.ai-result-tile {
  position: relative;
  display: flex;
  aspect-ratio: 1 / 1;
  min-height: 12rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 55%);
}

.ai-prompt-workspace {
  display: grid;
  min-width: 0;
  gap: 1rem;
  min-height: 0;
}

.assistant-shell {
  min-width: 0;
}

.assistant-dialog-card {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.ai-prompt-workspace:not(.ai-prompt-workspace--expanded) .assistant-shell {
  display: none;
}

.ai-prompt-workspace--expanded {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  min-height: min(56rem, calc(100dvh - 7rem));
}

.ai-prompt-workspace--expanded .prompt-compose-panel,
.ai-prompt-workspace--expanded .assistant-shell {
  height: 100%;
  min-height: 0;
}

.ai-prompt-workspace--expanded .assistant-shell {
  display: flex;
  overflow: hidden;
}

.ai-prompt-workspace--expanded .assistant-shell :deep(.prompt-assistant-panel) {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.ai-prompt-workspace--expanded .assistant-shell :deep(.prompt-assistant-messages) {
  max-height: none;
  min-height: 0;
  flex: 1;
}

.assistant-shell--dialog {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid !important;
  min-width: 0;
  min-height: 0;
  place-items: center;
  padding: clamp(0.75rem, 3vw, 2rem);
  background: rgb(0 0 0 / 0.52);
}

.assistant-shell--dialog .assistant-dialog-card {
  height: min(42rem, calc(100dvh - 2rem));
  width: min(56rem, calc(100vw - 2rem));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--card);
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.34);
}

.assistant-shell--dialog .assistant-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  padding: 0.75rem;
}

.assistant-shell--dialog :deep(.prompt-assistant-panel) {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  border-radius: 0;
}

.assistant-shell--dialog :deep(.prompt-assistant-messages) {
  max-height: none;
  min-height: 0;
  flex: 1;
}

@media (min-width: 1280px) {
  .ai-prompt-workspace {
    height: 100%;
  }
}

@media (max-width: 767px) {
  .assistant-shell:not(.assistant-shell--dialog) {
    display: none;
  }
}
</style>
