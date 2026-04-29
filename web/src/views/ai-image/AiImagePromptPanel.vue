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
          v-if="assistantEnabled && (hasPrompt || workflowExpanded)"
          class="assistant-open-inline ui-button ui-button-secondary h-9 text-xs"
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

    <section class="ai-output-panel panel">
      <div class="ai-case-preview">
        <div class="flex min-w-0 items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted-foreground">
              {{ caseItem ? t("aiImage.selectedCase") : t("aiImage.creationMode") }}
            </p>
            <h2 class="mt-1 truncate text-sm font-semibold">{{ selectedCaseTitle }}</h2>
          </div>
        </div>
        <button
          v-if="caseItem?.thumbnailUrl"
          class="ai-case-preview-button group"
          type="button"
          :title="t('aiImage.openCasePreview')"
          :disabled="interactionLocked"
          @click="emit('openCasePreview')"
        >
          <PromptCaseThumbnail
            :src="caseItem.thumbnailUrl"
            :alt="selectedCaseTitle"
            icon-class="h-7 w-7"
          />
          <span
            class="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/85 text-foreground opacity-0 transition group-hover:opacity-100"
          >
            <Maximize2 class="h-4 w-4" />
          </span>
        </button>
        <div v-else class="ai-case-preview-empty">
          <WandSparkles class="h-7 w-7" />
        </div>
      </div>

      <div class="ai-generated-area">
        <div
          class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3"
        >
          <div class="min-w-0">
            <h2 class="text-sm font-semibold">{{ t("workspace.result") }}</h2>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              {{ generationPrompt || t("workspace.oneShotEmpty") }}
            </p>
          </div>
          <span
            v-if="hasRunningTask"
            class="inline-flex shrink-0 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold"
          >
            <Loader2 class="h-3.5 w-3.5 animate-spin text-primary" />
            {{ t("workspace.generationProgress", { percent: generationProgress }) }}
          </span>
        </div>

        <div class="ai-generated-body">
          <div v-if="hasRunningTask" class="ai-generation-progress">
            <div class="flex items-center gap-3">
              <span
                class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              >
                <Loader2 class="h-5 w-5 animate-spin" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold">{{ generationStatusLabel }}</p>
                <p class="mt-1 truncate text-xs text-muted-foreground">
                  {{ generationPrompt || t("workspace.generationHint") }}
                </p>
              </div>
            </div>
            <div class="mt-4 h-2.5 overflow-hidden rounded-full bg-primary/15">
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
            <span>{{ t("workspace.noResult") }}</span>
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
  gap: 1rem;
}

.assistant-shell,
.prompt-compose-panel,
.ai-output-panel {
  min-width: 0;
}

.assistant-shell {
  min-height: 0;
}

.assistant-dialog-card {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.ai-output-panel {
  display: grid;
  min-height: 28rem;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.ai-case-preview {
  display: grid;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  padding: 1rem;
}

.ai-case-preview-button,
.ai-case-preview-empty {
  position: relative;
  display: flex;
  height: clamp(7rem, 18dvh, 14rem);
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 45%);
}

.ai-case-preview-empty {
  border-style: dashed;
  color: var(--muted-foreground);
}

.ai-generated-area {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.ai-generated-body {
  min-height: 0;
  flex: 1;
  padding: 1rem;
}

.ai-result-grid {
  display: grid;
  min-height: 100%;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  grid-auto-rows: minmax(12rem, 1fr);
  gap: 0.75rem;
  overflow-y: auto;
}

.ai-result-grid--single {
  display: flex;
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
}

.ai-result-grid--single .ai-result-tile {
  width: 100%;
  height: 100%;
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
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  border: 1px dashed var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 70%);
  padding: 1rem;
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

.ai-prompt-workspace--expanded .prompt-compose-panel,
.ai-prompt-workspace--expanded .assistant-shell,
.ai-prompt-workspace--expanded .ai-output-panel {
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

@container (min-width: 58rem) {
  .ai-prompt-workspace {
    height: 100%;
  }

  .ai-prompt-workspace--expanded {
    grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
    grid-template-rows: minmax(0, 0.9fr) minmax(0, 1.1fr);
    min-height: 0;
  }

  .ai-prompt-workspace--expanded .assistant-shell {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  .ai-prompt-workspace--expanded .prompt-compose-panel {
    grid-column: 2;
    grid-row: 1;
    min-height: 0;
  }

  .ai-prompt-workspace--expanded .ai-output-panel {
    grid-column: 2;
    grid-row: 2;
    min-height: 0;
  }

  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant {
    grid-template-columns: minmax(18rem, 0.72fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant .prompt-compose-panel,
  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant .ai-output-panel {
    grid-row: 1;
  }

  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant .prompt-compose-panel {
    grid-column: 1;
  }

  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant .ai-output-panel {
    grid-column: 2;
  }
}

@container (min-width: 88rem) {
  .ai-prompt-workspace--expanded {
    grid-template-columns: minmax(20rem, 0.9fr) minmax(18rem, 0.62fr) minmax(0, 1.6fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .ai-prompt-workspace--expanded .assistant-shell {
    grid-column: 1;
    grid-row: 1;
  }

  .ai-prompt-workspace--expanded .prompt-compose-panel {
    grid-column: 2;
    grid-row: 1;
  }

  .ai-prompt-workspace--expanded .ai-output-panel {
    grid-column: 3;
    grid-row: 1;
  }

  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant {
    grid-template-columns: minmax(18rem, 0.62fr) minmax(0, 1.6fr);
  }

  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant .prompt-compose-panel {
    grid-column: 1;
  }

  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant .ai-output-panel {
    grid-column: 2;
  }
}

@container (min-width: 150rem) {
  .ai-prompt-workspace--expanded {
    grid-template-columns: minmax(24rem, 30rem) minmax(20rem, 26rem) minmax(0, 1fr);
  }

  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant {
    grid-template-columns: minmax(20rem, 26rem) minmax(0, 1fr);
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
