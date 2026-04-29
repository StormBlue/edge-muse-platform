<script setup lang="ts">
/**
 * 工作台底部输入：prompt、尺寸/张数（受角色限制）、图生图时本地上传参考图（最多 5）。
 * `variant=chat` 时可隐藏部分工具条；`readOnly` 用于仅展示历史参数。
 */
import { Loader2, Send, Upload, X } from "lucide-vue-next";
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
  isContinuousChat,
  isChatVariant,
  isBusy,
  maxCustomCount,
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
    class="panel min-h-0 overflow-hidden"
    :class="isChatVariant ? 'chat-input-panel flex flex-col' : 'task-input-panel'"
    @paste="onPaste"
    @submit.prevent="submit"
  >
    <div
      v-if="isChatVariant"
      class="thin-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
    >
      <label v-if="!isReadOnly" class="block shrink-0 order-1">
        <span class="mb-2 block text-xs font-medium text-muted-foreground">
          {{ t("workspace.prompt") }}
        </span>
        <textarea
          v-model="prompt"
          class="ui-field resize-none px-3 py-3 text-sm leading-6"
          :class="isChatVariant ? 'min-h-28' : 'min-h-36'"
          :placeholder="t('workspace.promptPlaceholder')"
          @keydown.meta.enter.prevent="submit"
          @keydown.ctrl.enter.prevent="submit"
        ></textarea>
      </label>

      <div class="shrink-0 order-2">
        <p class="mb-2 text-xs font-medium text-muted-foreground">
          {{ t("workspace.canvasSize") }}
        </p>
        <div
          class="grid gap-2"
          :class="isReadOnly ? 'grid-cols-1' : 'grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]'"
        >
          <button
            v-for="option in visibleSizeOptions"
            :key="option.value"
            class="min-h-16 rounded-lg border px-3 py-2 text-left transition"
            :class="[
              size === option.value
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-muted/45 text-muted-foreground hover:bg-muted',
              isReadOnly ? 'pointer-events-none cursor-default' : ''
            ]"
            type="button"
            :aria-pressed="size === option.value"
            :aria-disabled="isReadOnly"
            :tabindex="isReadOnly ? -1 : 0"
            @click="!isReadOnly && (size = option.value)"
          >
            <span class="block text-sm font-semibold">{{ option.ratio }}</span>
            <span class="mt-0.5 block text-xs">{{ option.label }}</span>
          </button>
        </div>
      </div>

      <div v-if="!isContinuousChat" class="shrink-0 order-3">
        <p class="mb-2 text-xs font-medium text-muted-foreground">
          {{ t("workspace.imageCount") }}
        </p>
        <input
          v-if="props.allowCustomCount && !isReadOnly"
          class="ui-field h-10 px-3 text-sm"
          type="number"
          min="1"
          :max="maxCustomCount"
          step="1"
          :value="n"
          @input="setCount"
          @blur="normalizeCount"
        />
        <div v-else class="grid grid-cols-1 gap-2">
          <button
            v-for="option in visibleCountOptions"
            :key="option"
            class="h-10 rounded-lg border text-sm font-semibold transition"
            :class="[
              n === option
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-muted/45 text-muted-foreground hover:bg-muted',
              countSelectionDisabled ? 'pointer-events-none cursor-default' : ''
            ]"
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

      <div v-if="isImageToImage" class="shrink-0 order-4">
        <label
          class="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-center text-sm font-semibold transition"
          :class="[
            dragging
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground',
            isReadOnly ? 'cursor-default' : 'cursor-pointer'
          ]"
          :tabindex="isReadOnly ? -1 : 0"
          @dragenter.prevent="!isReadOnly && (dragging = true)"
          @dragover.prevent="!isReadOnly && (dragging = true)"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <Upload class="h-4 w-4" />
          <span>{{ uploaderLabel }}</span>
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
          class="thin-scrollbar mt-3 grid max-h-36 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 overflow-y-auto"
        >
          <div
            v-for="(preview, index) in editablePreviews"
            :key="preview.url"
            class="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
          >
            <img class="h-full w-full object-contain" :src="preview.url" alt="" />
            <button
              v-if="!isReadOnly"
              class="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
              type="button"
              @click="removeFile(index)"
            >
              <X class="h-3.5 w-3.5" />
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
      </div>
    </div>

    <div v-else class="task-input-layout" :class="{ 'task-input-layout--readonly': isReadOnly }">
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
        <div class="flex shrink-0 items-center justify-between gap-3">
          <h2 class="text-sm font-semibold">{{ t("workspace.parameters") }}</h2>
          <span class="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
            {{ size }}
          </span>
        </div>

        <div class="shrink-0">
          <p class="mb-2 text-xs font-medium text-muted-foreground">
            {{ t("workspace.canvasSize") }}
          </p>
          <div
            class="grid gap-2"
            :class="isReadOnly ? 'grid-cols-1' : 'grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]'"
          >
            <button
              v-for="option in visibleSizeOptions"
              :key="option.value"
              class="min-h-16 rounded-lg border px-3 py-2 text-left transition"
              :class="[
                size === option.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-muted/45 text-muted-foreground hover:bg-muted',
                isReadOnly ? 'pointer-events-none cursor-default' : ''
              ]"
              type="button"
              :aria-pressed="size === option.value"
              :aria-disabled="isReadOnly"
              :tabindex="isReadOnly ? -1 : 0"
              @click="!isReadOnly && (size = option.value)"
            >
              <span class="block text-sm font-semibold">{{ option.ratio }}</span>
              <span class="mt-0.5 block text-xs">{{ option.label }}</span>
            </button>
          </div>
        </div>

        <div v-if="!isContinuousChat" class="shrink-0">
          <p class="mb-2 text-xs font-medium text-muted-foreground">
            {{ t("workspace.imageCount") }}
          </p>
          <input
            v-if="props.allowCustomCount && !isReadOnly"
            class="ui-field h-10 px-3 text-sm"
            type="number"
            min="1"
            :max="maxCustomCount"
            step="1"
            :value="n"
            @input="setCount"
            @blur="normalizeCount"
          />
          <div v-else class="grid grid-cols-1 gap-2">
            <button
              v-for="option in visibleCountOptions"
              :key="option"
              class="h-10 rounded-lg border text-sm font-semibold transition"
              :class="[
                n === option
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-muted/45 text-muted-foreground hover:bg-muted',
                countSelectionDisabled ? 'pointer-events-none cursor-default' : ''
              ]"
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

        <div v-if="isImageToImage" class="shrink-0">
          <label
            class="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-center text-sm font-semibold transition"
            :class="[
              dragging
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground',
              isReadOnly ? 'cursor-default' : 'cursor-pointer'
            ]"
            :tabindex="isReadOnly ? -1 : 0"
            @dragenter.prevent="!isReadOnly && (dragging = true)"
            @dragover.prevent="!isReadOnly && (dragging = true)"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <Upload class="h-4 w-4" />
            <span>{{ uploaderLabel }}</span>
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
            class="thin-scrollbar mt-3 grid max-h-40 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 overflow-y-auto"
          >
            <div
              v-for="(preview, index) in editablePreviews"
              :key="preview.url"
              class="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            >
              <img class="h-full w-full object-contain" :src="preview.url" alt="" />
              <button
                v-if="!isReadOnly"
                class="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
                type="button"
                @click="removeFile(index)"
              >
                <X class="h-3.5 w-3.5" />
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
.task-input-panel {
  container-type: inline-size;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}

.task-input-layout {
  display: grid;
  min-height: 0;
  grid-template-rows: minmax(10rem, 0.82fr) minmax(0, 1fr);
  gap: 1rem;
  overflow: hidden;
  padding: 1rem;
}

.task-prompt-column {
  display: flex;
  min-height: 0;
  min-width: 0;
}

.task-prompt-textarea {
  min-height: clamp(10rem, 24dvh, 14rem);
}

.task-settings-column {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}

@container (min-width: 38rem) {
  .task-input-layout:not(.task-input-layout--readonly) {
    grid-template-columns: minmax(18rem, 1fr) minmax(16rem, 0.8fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .task-prompt-column {
    min-height: 0;
  }

  .task-prompt-textarea {
    min-height: 0;
    flex: 1;
  }
}
</style>
