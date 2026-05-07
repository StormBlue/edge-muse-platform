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
  Maximize2,
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
import PromptCaseThumbnail from "./PromptCaseThumbnail.vue";
import { getAiImageSubmitBlockReason } from "./aiImageSubmitValidation";
import GenerationSizeSelector from "@/components/generation/GenerationSizeSelector.vue";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  openCasePreview: [];
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

function updateMode(value: string | number) {
  if (value === "image2image" || value === "text2image") emit("update:mode", value);
}
</script>

<template>
  <div
    class="ai-prompt-workspace"
    :class="{
      'ai-prompt-workspace--expanded': workflowExpanded,
      'ai-prompt-workspace--without-assistant': !assistantEnabled
    }"
    @paste="onPaste"
  >
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

    <section class="prompt-compose-panel panel">
      <div class="prompt-compose-header">
        <h2 class="truncate text-sm font-semibold">{{ selectedCaseTitle }}</h2>
        <Tabs :model-value="mode" @update:model-value="updateMode">
          <TabsList class="shrink-0">
            <TabsTrigger
              v-for="item in supportedModes"
              :key="item"
              :value="item"
              :disabled="interactionLocked"
            >
              {{ t(`workspace.${item}`) }}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div class="prompt-compose-body thin-scrollbar">
        <p
          v-if="sizeFallbackNotice"
          class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100"
        >
          {{ sizeFallbackNotice }}
        </p>

        <div>
          <p class="mb-2 text-xs font-medium text-muted-foreground">
            {{ t("workspace.canvasSize") }}
          </p>
          <GenerationSizeSelector
            :model-value="size"
            :options="sizeOptions"
            :disabled="interactionLocked"
            @update:model-value="emit('update:size', $event)"
          />
        </div>

        <AiImageReferenceInput
          v-if="mode === 'image2image'"
          v-model:description="referenceDescription"
          class="prompt-compose-reference"
          :can-accept-files="canAcceptReferenceFiles"
          :previews="previews"
          @add-files="addReferenceFiles"
          @remove-file="(index) => emit('removeFile', index)"
        />

        <label class="prompt-compose-field">
          <textarea
            class="ui-field prompt-compose-textarea resize-none p-3 text-sm leading-6"
            :aria-label="t('workspace.prompt')"
            :placeholder="t('aiImage.promptPlaceholder')"
            :value="prompt"
            :disabled="interactionLocked"
            @input="onPromptInput"
          />
        </label>

        <button
          v-if="assistantEnabled && (hasPrompt || workflowExpanded)"
          class="assistant-open-inline ui-button ui-button-secondary h-9 text-xs"
          type="button"
          :disabled="interactionLocked"
          @click="openAssistantView"
        >
          <WandSparkles class="h-3.5 w-3.5" />
          {{ t("aiImage.openAssistant") }}
        </button>
      </div>

      <div class="prompt-compose-footer">
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

    <section class="ai-output-panel panel">
      <div class="ai-generated-area">
        <button
          v-if="caseItem?.thumbnailUrl"
          class="ai-case-floating-preview group"
          type="button"
          :title="t('aiImage.openCasePreview')"
          :disabled="interactionLocked"
          @click="emit('openCasePreview')"
        >
          <span
            class="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/85 text-foreground opacity-0 transition group-hover:opacity-100"
          >
            <Maximize2 class="h-4 w-4" />
          </span>
          <PromptCaseThumbnail
            class="ai-case-floating-thumbnail"
            :src="caseItem.thumbnailUrl"
            :alt="selectedCaseTitle"
            fit="contain"
            icon-class="h-7 w-7"
          />
        </button>

        <div class="ai-generated-body">
          <div
            v-if="hasRunningTask"
            class="ai-generation-progress"
            role="status"
            aria-live="polite"
          >
            <div class="ai-generation-progress-header">
              <span
                class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              >
                <Loader2 class="h-5 w-5 animate-spin" />
              </span>
              <div class="ai-generation-progress-copy">
                <div class="ai-generation-progress-title">
                  <p class="text-sm font-semibold">{{ generationStatusLabel }}</p>
                  <span class="ai-generation-progress-percent">
                    {{ t("workspace.generationProgress", { percent: generationProgress }) }}
                  </span>
                </div>
                <p class="ai-generation-progress-prompt">
                  {{ generationPrompt || t("workspace.generationHint") }}
                </p>
              </div>
            </div>
            <div
              class="ai-generation-progress-track"
              role="progressbar"
              :aria-label="generationStatusLabel"
              :aria-valuenow="generationProgress"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="h-full rounded-full bg-primary transition-all duration-500"
                :style="{ width: `${generationProgress}%` }"
              ></div>
            </div>
          </div>

          <AiImageFailurePanel
            v-else-if="activeFailed"
            :message="failedMessage"
            :title="failedTitle"
            @retry="emit('retryFailed')"
          />

          <div
            v-else-if="resultImages.length"
            class="ai-result-grid"
            :class="{ 'ai-result-grid--single': resultImages.length === 1 }"
          >
            <button
              v-for="image in resultImages"
              :key="image.id"
              class="ai-result-tile group"
              type="button"
              :disabled="interactionLocked"
              :title="t('workspace.openPreview')"
              @click="emit('openImage', image)"
            >
              <img
                class="ai-result-image"
                :src="image.url"
                :alt="image.prompt ?? ''"
                loading="lazy"
              />
              <span
                class="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/85 text-foreground opacity-0 transition group-hover:opacity-100"
              >
                <ImageIcon class="h-4 w-4" />
              </span>
            </button>
          </div>

          <div v-else class="ai-result-empty">
            <ImageIcon class="h-10 w-10" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.assistant-dialog-header {
  display: none;
}

.ai-prompt-workspace {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-areas:
    "composer"
    "stage"
    "assistant";
  gap: 0.75rem;
}

.assistant-shell,
.prompt-compose-panel,
.ai-output-panel {
  min-width: 0;
}

.assistant-shell {
  grid-area: assistant;
  min-height: 0;
}

.prompt-compose-panel {
  grid-area: composer;
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.assistant-dialog-card {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.prompt-compose-header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  padding: 0.75rem 1rem;
}

.prompt-compose-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  padding: 1rem;
}

.prompt-compose-field {
  display: flex;
  min-height: 12rem;
  flex: 1;
  flex-direction: column;
}

.prompt-compose-reference {
  flex: 0 0 auto;
}

.prompt-compose-textarea {
  min-height: 0;
  flex: 1;
}

.prompt-compose-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  border-top: 1px solid var(--border);
  padding: 1rem;
}

.ai-output-panel {
  grid-area: stage;
  min-height: clamp(26rem, 58dvh, 44rem);
  overflow: hidden;
}

.ai-case-floating-preview {
  position: absolute;
  left: clamp(1rem, 2vw, 1.5rem);
  top: clamp(1rem, 2vw, 1.5rem);
  z-index: 2;
  width: clamp(5.5rem, 13vw, 10rem);
  min-width: 5.5rem;
  max-width: 10rem;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid color-mix(in oklch, var(--border), transparent 8%);
  border-radius: 0.5rem;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 0.42), rgb(226 232 240 / 0.18)),
    color-mix(in oklch, var(--primary), transparent 92%);
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 30px rgb(15 23 42 / 0.16);
}

.ai-case-floating-preview :deep(.ai-case-floating-thumbnail) {
  background: transparent !important;
}

.ai-generated-area {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.ai-generated-body {
  display: flex;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  padding: 0.875rem;
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--primary), transparent 96%), transparent 9rem),
    color-mix(in oklch, var(--muted), transparent 72%);
}

.ai-result-grid {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 100%;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  grid-auto-rows: minmax(12rem, 1fr);
  gap: 0.75rem;
  overflow-y: auto;
}

.ai-result-grid--single {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.ai-result-tile {
  position: relative;
  display: flex;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 55%);
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--card), transparent 55%);
}

.ai-result-grid--single .ai-result-tile {
  width: 100%;
  height: 100%;
  align-self: stretch;
}

.ai-result-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.ai-generation-progress,
.ai-result-empty {
  display: flex;
  width: 100%;
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  border: 1px dashed var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 70%);
  padding: 1rem;
}

.ai-generation-progress {
  min-width: 0;
  gap: 1rem;
}

.ai-generation-progress-header {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 0.875rem;
}

.ai-generation-progress-copy {
  display: grid;
  min-width: 0;
  gap: 0.375rem;
}

.ai-generation-progress-title {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.ai-generation-progress-percent {
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid color-mix(in oklch, var(--primary), transparent 70%);
  background: color-mix(in oklch, var(--primary), transparent 88%);
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--primary);
}

.ai-generation-progress-prompt {
  display: -webkit-box;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.75rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
}

.ai-generation-progress-track {
  height: 0.625rem;
  min-width: 0;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in oklch, var(--primary), transparent 86%);
}

.ai-result-empty {
  align-items: center;
  gap: 0.75rem;
  color: var(--muted-foreground);
  text-align: center;
}

.ai-prompt-workspace:not(.ai-prompt-workspace--expanded) .assistant-shell {
  display: none;
}

.ai-prompt-workspace--expanded .assistant-open-inline {
  display: none;
}

.ai-prompt-workspace--expanded {
  min-height: min(56rem, calc(100dvh - 7rem));
}

.ai-prompt-workspace--expanded .assistant-shell,
.ai-prompt-workspace--expanded .ai-output-panel {
  height: 100%;
  min-height: 0;
}

.ai-prompt-workspace--expanded .prompt-compose-panel {
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

@container (min-width: 50rem) {
  .ai-prompt-workspace {
    height: 100%;
  }

  .ai-prompt-workspace--expanded {
    grid-template-areas: "assistant composer stage";
    grid-template-columns: minmax(13rem, 0.78fr) minmax(18rem, 1fr) minmax(16rem, 1.15fr);
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
  }

  .ai-prompt-workspace--expanded .prompt-compose-panel {
    min-height: 0;
  }

  .ai-prompt-workspace--expanded .ai-output-panel {
    min-height: 0;
  }

  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant {
    grid-template-areas: "composer stage";
    grid-template-columns: minmax(20rem, 26rem) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .ai-output-panel {
    min-height: 0;
  }
}

@container (min-width: 78rem) {
  .ai-prompt-workspace--expanded {
    grid-template-areas: "assistant composer stage";
    grid-template-columns: minmax(18rem, 24rem) minmax(22rem, 28rem) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .ai-output-panel {
    min-height: 0;
  }
}

@container (min-width: 96rem) {
  .ai-prompt-workspace--expanded {
    grid-template-columns: minmax(20rem, 26rem) minmax(24rem, 30rem) minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .assistant-shell:not(.assistant-shell--dialog) {
    display: none;
  }

  .ai-prompt-workspace--expanded .assistant-open-inline {
    display: inline-flex;
  }
}
</style>
