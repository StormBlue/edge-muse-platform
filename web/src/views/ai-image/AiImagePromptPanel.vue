<script setup lang="ts">
/**
 * AI 图像生成页右侧生成面板。
 *
 * 这里集中处理 prompt 编辑、参考图上传、AI 助手回填和最终提交；
 * 外层页面只负责案例选择和实验事件，避免页面组件继续膨胀。
 */
import { computed, ref } from "vue";
import { RotateCcw, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import AiImagePromptComposer from "./AiImagePromptComposer.vue";
import AiImageResultPanel from "./AiImageResultPanel.vue";
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

    <AiImagePromptComposer
      v-model:reference-description="referenceDescription"
      :assistant-enabled="assistantEnabled"
      :can-accept-reference-files="canAcceptReferenceFiles"
      :can-reset-prompt="canResetPrompt"
      :has-prompt="hasPrompt"
      :has-running-task="hasRunningTask"
      :interaction-locked="interactionLocked"
      :mode="mode"
      :prompt="prompt"
      :previews="previews"
      :selected-case-title="selectedCaseTitle"
      :size="size"
      :size-fallback-notice="sizeFallbackNotice"
      :size-options="sizeOptions"
      :submit-disabled="submitDisabled"
      :supported-modes="supportedModes"
      :workflow-expanded="workflowExpanded"
      @add-files="addReferenceFiles"
      @clear-prompt="emit('clearPrompt')"
      @copy-prompt="emit('copyPrompt')"
      @open-assistant="openAssistantView"
      @remove-file="emit('removeFile', $event)"
      @reset-prompt="emit('resetPrompt')"
      @submit="emit('submit')"
      @update:mode="emit('update:mode', $event)"
      @update:prompt="emit('update:prompt', $event)"
      @update:size="emit('update:size', $event)"
    />
    <AiImageResultPanel
      :active-failed="activeFailed"
      :case-item="caseItem"
      :failed-message="failedMessage"
      :failed-title="failedTitle"
      :generation-progress="generationProgress"
      :generation-prompt="generationPrompt"
      :generation-status-label="generationStatusLabel"
      :has-running-task="hasRunningTask"
      :interaction-locked="interactionLocked"
      :result-images="resultImages"
      :selected-case-title="selectedCaseTitle"
      @open-case-preview="emit('openCasePreview')"
      @open-image="emit('openImage', $event)"
      @retry-failed="emit('retryFailed')"
    />
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
:deep(.prompt-compose-panel),
:deep(.ai-output-panel) {
  min-width: 0;
}

.assistant-shell {
  grid-area: assistant;
  min-height: 0;
}

.assistant-dialog-card {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.ai-prompt-workspace:not(.ai-prompt-workspace--expanded) .assistant-shell {
  display: none;
}

.ai-prompt-workspace--expanded {
  min-height: min(56rem, calc(100dvh - 7rem));
}

.ai-prompt-workspace--expanded .assistant-shell,
.ai-prompt-workspace--expanded :deep(.ai-output-panel) {
  height: 100%;
  min-height: 0;
}

.ai-prompt-workspace--expanded :deep(.prompt-compose-panel) {
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

  .ai-prompt-workspace--expanded :deep(.prompt-compose-panel) {
    min-height: 0;
  }

  .ai-prompt-workspace--expanded :deep(.ai-output-panel) {
    min-height: 0;
  }

  .ai-prompt-workspace--expanded.ai-prompt-workspace--without-assistant {
    grid-template-areas: "composer stage";
    grid-template-columns: minmax(20rem, 26rem) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  :deep(.ai-output-panel) {
    min-height: 0;
  }
}

@container (min-width: 78rem) {
  .ai-prompt-workspace--expanded {
    grid-template-areas: "assistant composer stage";
    grid-template-columns: minmax(18rem, 24rem) minmax(22rem, 28rem) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  :deep(.ai-output-panel) {
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
}
</style>
