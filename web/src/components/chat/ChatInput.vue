<script setup lang="ts">
/**
 * 工作台底部输入：prompt、尺寸/张数（受角色限制）、图生图时本地上传参考图（最多 5）。
 * `readOnly` 用于仅展示历史参数。
 */
import { ImagePlus, Loader2, Send, SlidersHorizontal, X } from "lucide-vue-next";
import type { ImageAttachment } from "@/stores/session";
import {
  useChatInputController,
  type ChatInputProps,
  type ChatInputSubmitValue
} from "./useChatInputController";

const props = defineProps<ChatInputProps>();

const emit = defineEmits<{
  submit: [value: ChatInputSubmitValue];
  "open-reference": [image: ImageAttachment];
}>();

const {
  t,
  prompt,
  size,
  n,
  dragging,
  isReadOnly,
  isImageToImage,
  isBusy,
  maxCustomCount,
  highResolutionCountLocked,
  submitDisabled,
  countSelectionDisabled,
  submitLabel,
  effectiveMaxReferenceFiles,
  visibleSizeOptions,
  visibleCountOptions,
  readonlyReferenceImages,
  editablePreviews,
  uploaderLabel,
  submit,
  onFiles,
  onDrop,
  onPaste,
  removeFile,
  setCount,
  normalizeCount
} = useChatInputController(props, emit);
</script>

<template>
  <form
    class="panel task-input-panel min-h-0 overflow-hidden"
    @paste="onPaste"
    @submit.prevent="submit"
  >
    <div
      class="task-input-layout"
      :class="{
        'task-input-layout--readonly': isReadOnly,
        'task-input-layout--image': isImageToImage
      }"
    >
      <section v-if="isImageToImage" class="task-reference-section">
        <p class="task-setting-inline-label">{{ t("workspace.referenceImage") }}</p>
        <label
          class="task-reference-dropzone"
          :class="[
            dragging ? 'task-reference-dropzone--dragging' : '',
            isReadOnly ? 'cursor-default' : 'cursor-pointer'
          ]"
          :tabindex="isReadOnly ? -1 : 0"
          @dragenter.prevent="!isReadOnly && (dragging = true)"
          @dragover.prevent="!isReadOnly && (dragging = true)"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <ImagePlus class="h-5 w-5" />
          <span>{{ isReadOnly ? uploaderLabel : t("workspace.addReferenceImage") }}</span>
          <span v-if="!isReadOnly" class="text-xs font-normal">
            {{ t("workspace.referenceImageInputHint") }}
          </span>
          <input
            v-if="!isReadOnly"
            class="hidden"
            :multiple="effectiveMaxReferenceFiles > 1"
            accept="image/png,image/jpeg,image/webp"
            type="file"
            @change="onFiles"
          />
        </label>

        <div
          v-if="editablePreviews.length || readonlyReferenceImages.length"
          class="mt-2 grid grid-cols-3 gap-2"
        >
          <div
            v-for="(preview, index) in editablePreviews"
            :key="preview.url"
            class="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
          >
            <img class="h-full w-full object-cover" :src="preview.url" alt="" />
            <button
              v-if="!isReadOnly"
              class="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white"
              type="button"
              @click="removeFile(index)"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
          <button
            v-for="image in readonlyReferenceImages"
            :key="image.id"
            class="aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            type="button"
            :title="t('workspace.openPreview')"
            @click="emit('open-reference', image)"
          >
            <img class="h-full w-full object-contain" :src="image.url" alt="" loading="lazy" />
          </button>
        </div>
      </section>

      <section v-if="!isReadOnly" class="task-prompt-column">
        <label class="flex min-h-0 flex-1 flex-col">
          <span class="mb-2 block text-xs font-medium text-muted-foreground">
            {{ t("workspace.prompt") }}
          </span>
          <textarea
            v-model="prompt"
            class="ui-field task-prompt-textarea resize-none px-3 py-3 text-sm leading-6"
            :placeholder="t('workspace.promptPlaceholder')"
            @keydown.meta.enter.prevent="submit"
            @keydown.ctrl.enter.prevent="submit"
          ></textarea>
        </label>
      </section>

      <section class="task-settings-column thin-scrollbar">
        <div class="task-settings-header">
          <h2 class="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal class="h-4 w-4 text-muted-foreground" />
            {{ t("workspace.parameters") }}
          </h2>
          <span class="task-current-size">{{ size }}</span>
        </div>

        <div class="task-setting-block">
          <div class="task-setting-title-row">
            <p>{{ t("workspace.canvasSize") }}</p>
          </div>
          <div class="task-size-grid">
            <button
              v-for="option in visibleSizeOptions"
              :key="option.value"
              class="task-size-chip"
              :class="size === option.value ? 'task-size-chip--active' : ''"
              type="button"
              :aria-pressed="size === option.value"
              :aria-disabled="isReadOnly"
              :tabindex="isReadOnly ? -1 : 0"
              :title="option.label"
              @click="!isReadOnly && (size = option.value)"
            >
              <span class="font-semibold">{{ option.ratio }}</span>
              <span class="truncate text-muted-foreground">{{ option.label }}</span>
            </button>
          </div>
        </div>

        <div class="task-setting-block task-count-block">
          <p class="task-setting-inline-label">{{ t("workspace.imageCount") }}</p>
          <input
            v-if="props.allowCustomCount && !isReadOnly && !highResolutionCountLocked"
            class="ui-field h-9 w-24 px-3 text-sm"
            type="number"
            min="1"
            :max="maxCustomCount"
            step="1"
            :value="n"
            @input="setCount"
            @blur="normalizeCount"
          />
          <div v-else class="flex flex-wrap gap-1.5">
            <button
              v-for="option in visibleCountOptions"
              :key="option"
              class="task-count-chip"
              :class="n === option ? 'task-count-chip--active' : ''"
              type="button"
              :aria-pressed="n === option"
              :aria-disabled="countSelectionDisabled"
              :tabindex="countSelectionDisabled ? -1 : 0"
              @click="!countSelectionDisabled && (n = option)"
            >
              {{ option }}
            </button>
          </div>
        </div>
      </section>
    </div>

    <div v-if="!isReadOnly" class="shrink-0 border-t border-border p-3">
      <button
        class="ui-button ui-button-primary w-full"
        :aria-busy="isBusy"
        :disabled="submitDisabled"
        type="submit"
      >
        <Loader2 v-if="isBusy" class="h-4 w-4 animate-spin" />
        <Send v-else class="h-4 w-4" />
        {{ submitLabel }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.task-count-chip {
  display: inline-flex;
  height: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in oklch, var(--muted), transparent 52%);
  padding: 0 0.625rem;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  font-weight: 700;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.task-count-chip:hover {
  background: var(--muted);
}

.task-count-chip--active {
  border-color: color-mix(in oklch, var(--primary), transparent 35%);
  background: color-mix(in oklch, var(--primary), transparent 88%);
  color: var(--foreground);
}

.task-input-panel {
  container-type: inline-size;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}

.task-input-layout {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 0.75rem;
  overflow-y: auto;
  padding: 0.75rem;
}

.task-prompt-column {
  display: flex;
  flex: none;
  min-height: 0;
  min-width: 0;
  margin: -0.25rem;
  overflow: visible;
  padding: 0.25rem;
}

.task-prompt-textarea {
  height: clamp(10rem, 24dvh, 14rem);
  min-height: 10rem;
  max-height: 14rem;
}

.task-settings-column {
  display: grid;
  flex: none;
  min-height: 0;
  min-width: 0;
  gap: 0.625rem;
  overflow: visible;
}

.task-reference-section {
  display: grid;
  min-width: 0;
  gap: 0.5rem;
}

.task-settings-header,
.task-count-block,
.task-reference-dropzone {
  display: flex;
  min-width: 0;
  align-items: center;
}

.task-settings-header {
  justify-content: space-between;
  gap: 0.75rem;
}

.task-current-size {
  display: inline-flex;
  max-width: 9.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.25rem 0.625rem;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-setting-block {
  display: grid;
  gap: 0.5rem;
}

.task-setting-title-row,
.task-setting-inline-label {
  color: var(--muted-foreground);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1rem;
}

.task-size-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 7.25rem), 1fr));
  gap: 0.5rem;
}

.task-size-chip {
  display: grid;
  min-width: 0;
  min-height: 2.75rem;
  align-content: center;
  gap: 0.125rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 52%);
  padding: 0.375rem 0.625rem;
  text-align: left;
  font-size: 0.75rem;
  line-height: 1rem;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.task-size-chip:hover {
  background: var(--muted);
}

.task-size-chip--active {
  border-color: color-mix(in oklch, var(--primary), transparent 35%);
  background: color-mix(in oklch, var(--primary), transparent 88%);
  color: var(--foreground);
}

.task-count-block {
  justify-content: space-between;
  gap: 0.75rem;
}

.task-reference-dropzone {
  min-height: 6rem;
  flex-direction: column;
  justify-content: center;
  gap: 0.5rem;
  border: 1px dashed var(--border);
  border-radius: 0.5rem;
  padding: 1rem 0.75rem;
  color: var(--muted-foreground);
  font-size: 0.875rem;
  font-weight: 700;
  text-align: center;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.task-reference-dropzone--dragging {
  border-color: var(--primary);
  background: color-mix(in oklch, var(--primary), transparent 90%);
  color: var(--foreground);
}
</style>
