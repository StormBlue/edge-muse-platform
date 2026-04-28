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
    class="panel thin-scrollbar flex min-h-0 flex-col overflow-y-auto"
    :class="isChatVariant ? 'gap-3 p-3' : 'min-h-[34rem] gap-4 p-4 xl:min-h-0'"
    @paste="onPaste"
    @submit.prevent="submit"
  >
    <div v-if="!isChatVariant" class="flex shrink-0 items-center justify-between gap-3">
      <h2 class="text-sm font-semibold">{{ t("workspace.parameters") }}</h2>
      <span class="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
        {{ size }}
      </span>
    </div>

    <label v-if="!isReadOnly" class="block shrink-0" :class="isChatVariant ? 'order-1' : ''">
      <span class="mb-2 block text-xs font-medium text-muted-foreground">
        {{ t("workspace.prompt") }}
      </span>
      <textarea
        v-model="prompt"
        class="ui-field resize-none px-3 py-3 text-sm leading-6"
        :class="isChatVariant ? 'min-h-32' : 'min-h-40'"
        :placeholder="t('workspace.promptPlaceholder')"
        @keydown.meta.enter.prevent="submit"
        @keydown.ctrl.enter.prevent="submit"
      ></textarea>
    </label>

    <div class="shrink-0" :class="isChatVariant ? 'order-2' : ''">
      <p class="mb-2 text-xs font-medium text-muted-foreground">
        {{ t("workspace.canvasSize") }}
      </p>
      <div class="grid gap-2" :class="isReadOnly ? 'grid-cols-1' : 'grid-cols-2'">
        <button
          v-for="option in visibleSizeOptions"
          :key="option.value"
          class="rounded-lg border px-3 py-2 text-left transition"
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

    <div v-if="!isContinuousChat" class="shrink-0" :class="isChatVariant ? 'order-3' : ''">
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

    <div v-if="isImageToImage" class="min-h-0 flex-1" :class="isChatVariant ? 'order-4' : ''">
      <label
        class="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-center text-sm font-semibold transition"
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
        class="thin-scrollbar mt-3 grid max-h-36 grid-cols-3 gap-2 overflow-y-auto"
      >
        <div
          v-for="(preview, index) in editablePreviews"
          :key="preview.url"
          class="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
        >
          <img class="h-full w-full object-cover" :src="preview.url" alt="" />
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
          <img class="h-full w-full object-cover" :src="image.url" alt="" loading="lazy" />
        </button>
      </div>
    </div>

    <button
      v-if="!isReadOnly"
      class="ui-button ui-button-primary sticky bottom-0 z-10 w-full shrink-0"
      :class="isChatVariant ? 'order-5' : 'mt-auto'"
      :aria-busy="isBusy"
      :disabled="submitDisabled"
      type="submit"
    >
      <Loader2 v-if="isBusy" class="h-4 w-4 animate-spin" />
      <Send v-else class="h-4 w-4" />
      {{ submitLabel }}
    </button>
  </form>
</template>
