<script setup lang="ts">
/**
 * AI 图像生成页右侧生成面板。
 *
 * 这里集中处理 prompt 编辑、参考图上传、AI 助手回填和最终提交；
 * 外层页面只负责案例选择和实验事件，避免页面组件继续膨胀。
 */
import { computed, ref } from "vue";
import AiImageAssistantShell from "./AiImageAssistantShell.vue";
import AiImagePromptComposer from "./AiImagePromptComposer.vue";
import AiImageResultPanel from "./AiImageResultPanel.vue";
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

const assistantShellRef = ref<{ openAssistantView: () => void } | null>(null);
const referenceDescription = ref("");

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

function fillAssistantPrompt(value: {
  prompt: string;
  recommendedSize: string;
  turnCount: number;
  auto?: boolean;
}) {
  emit("fillAssistant", value);
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
    <AiImageAssistantShell
      v-if="assistantEnabled"
      ref="assistantShellRef"
      :case-item="caseItem"
      :disabled="interactionLocked"
      :mode="mode"
      :previews="previews"
      :provider="provider"
      :reference-count="referenceCount"
      :reference-description="referenceDescription"
      :workflow-expanded="workflowExpanded"
      @fill="fillAssistantPrompt"
      @open="emit('openAssistant')"
    />

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
      @open-assistant="assistantShellRef?.openAssistantView()"
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

:deep(.prompt-compose-panel),
:deep(.ai-output-panel) {
  min-width: 0;
}

.ai-prompt-workspace--expanded {
  min-height: min(56rem, calc(100dvh - 7rem));
}

.ai-prompt-workspace--expanded :deep(.ai-output-panel) {
  height: 100%;
  min-height: 0;
}

.ai-prompt-workspace--expanded :deep(.prompt-compose-panel) {
  min-height: 0;
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
</style>
