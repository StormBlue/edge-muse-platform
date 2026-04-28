<script setup lang="ts">
/**
 * AI 图像生成页右侧生成面板。
 *
 * 这里集中处理 prompt 编辑、参考图上传、AI 助手回填和最终提交；
 * 外层页面只负责案例选择和实验事件，避免页面组件继续膨胀。
 */
import { computed, ref } from "vue";
import { Copy, ImagePlus, Sparkles, Trash2, WandSparkles, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import PromptAssistantPanel from "./PromptAssistantPanel.vue";
import { getAiImageSubmitBlockReason } from "./aiImageSubmitValidation";
import type { ProviderCapabilities } from "@/stores/auth";
import type { ImageAttachment } from "@/stores/session";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";
import { imageFilesFromDataTransfer, imageFilesFromFileList } from "@/utils/referenceImageFiles";
import type { SizeOption } from "@/views/workspace/workspaceOptions";

type PreviewImage = {
  file: File;
  url: string;
};

const props = defineProps<{
  caseItem: PromptCase | null;
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
  submitting: boolean;
  hasRunningTask: boolean;
}>();

const emit = defineEmits<{
  "update:prompt": [value: string];
  "update:mode": [value: PromptCaseMode];
  "update:size": [value: string];
  addFiles: [files: File[]];
  removeFile: [index: number];
  copyPrompt: [];
  clearPrompt: [];
  fillAssistant: [value: { prompt: string; recommendedSize: string }];
  submit: [];
}>();

const { t } = useI18n();
const assistantAnchor = ref<HTMLElement | null>(null);
const dragging = ref(false);

const hasPrompt = computed(() => props.prompt.trim().length > 0);
const canAcceptReferenceFiles = computed(
  () => props.mode === "image2image" && !props.submitting && !props.hasRunningTask
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
  props.previews
    .map(({ file }) => `${file.name}:${file.type}:${file.size}:${file.lastModified}`)
    .join("|")
);

function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  addReferenceFiles(imageFilesFromFileList(input.files));
  input.value = "";
}

function onPromptInput(event: Event) {
  emit("update:prompt", (event.target as HTMLTextAreaElement).value);
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  addReferenceFiles(imageFilesFromDataTransfer(event.dataTransfer));
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

function scrollToAssistant() {
  assistantAnchor.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <section class="panel flex min-h-[32rem] flex-col overflow-hidden" @paste="onPaste">
    <div class="border-b border-border px-4 py-3">
      <h2 class="text-sm font-semibold">{{ t("aiImage.promptPanel") }}</h2>
      <p class="mt-1 truncate text-xs text-muted-foreground">{{ selectedCaseTitle }}</p>
    </div>
    <div class="thin-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div v-if="!hasPrompt" class="rounded-lg border border-dashed border-border bg-muted/25 p-3">
        <p class="text-sm font-semibold">{{ t("aiImage.emptyGuideTitle") }}</p>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">
          {{ t("aiImage.emptyGuideBody") }}
        </p>
        <button
          class="ui-button ui-button-secondary mt-3 h-8 text-xs"
          type="button"
          @click="scrollToAssistant"
        >
          <WandSparkles class="h-3.5 w-3.5" />
          {{ t("aiImage.openAssistant") }}
        </button>
      </div>

      <div>
        <p class="mb-2 text-xs font-medium text-muted-foreground">
          {{ t("workspace.generationMode") }}
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="item in supportedModes"
            :key="item"
            class="h-10 rounded-lg border text-sm font-semibold"
            :class="mode === item ? 'border-primary bg-primary/10' : 'border-border bg-muted/40'"
            type="button"
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
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="option in sizeOptions"
            :key="option.value"
            class="rounded-lg border px-3 py-2 text-left"
            :class="
              size === option.value ? 'border-primary bg-primary/10' : 'border-border bg-muted/40'
            "
            type="button"
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
          class="ui-field min-h-56 resize-none p-3 text-sm leading-6"
          :placeholder="t('aiImage.promptPlaceholder')"
          :value="prompt"
          @input="onPromptInput"
        />
      </label>

      <div ref="assistantAnchor">
        <PromptAssistantPanel
          :case-item="caseItem"
          :mode="mode"
          :provider="provider"
          :reference-count="referenceCount"
          :reference-context-key="referenceContextKey"
          @fill="(value) => emit('fillAssistant', value)"
        />
      </div>

      <div v-if="mode === 'image2image'" class="space-y-3">
        <label
          class="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-center text-sm font-semibold transition"
          :class="
            dragging
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground'
          "
          tabindex="0"
          @dragenter.prevent="canAcceptReferenceFiles && (dragging = true)"
          @dragover.prevent="canAcceptReferenceFiles && (dragging = true)"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <ImagePlus class="h-5 w-5" />
          <span>{{ t("workspace.addReferenceImage") }}</span>
          <span class="text-xs font-normal">{{ t("workspace.referenceImageInputHint") }}</span>
          <input
            class="hidden"
            accept="image/png,image/jpeg,image/webp"
            multiple
            type="file"
            @change="onFiles"
          />
        </label>
        <div v-if="previews.length" class="grid grid-cols-3 gap-2">
          <div
            v-for="(preview, index) in previews"
            :key="preview.url"
            class="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
          >
            <img class="h-full w-full object-cover" :src="preview.url" alt="" />
            <button
              class="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white"
              type="button"
              @click="emit('removeFile', index)"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="resultImages.length" class="grid grid-cols-2 gap-2">
        <img
          v-for="image in resultImages"
          :key="image.id"
          class="aspect-square rounded-lg border border-border object-cover"
          :src="image.url"
          :alt="image.prompt ?? ''"
        />
      </div>
    </div>

    <div class="flex flex-wrap justify-between gap-2 border-t border-border p-4">
      <div class="flex gap-2">
        <button class="ui-button ui-button-secondary" type="button" @click="emit('copyPrompt')">
          <Copy class="h-4 w-4" />
          {{ t("promptCases.copyPrompt") }}
        </button>
        <button class="ui-button ui-button-secondary" type="button" @click="emit('clearPrompt')">
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
        {{ hasRunningTask ? t("workspace.generationRunning") : t("workspace.generate") }}
      </button>
    </div>
  </section>
</template>
