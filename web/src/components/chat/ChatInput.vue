<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2, Send, Upload, X } from "lucide-vue-next";
import type { SessionMode } from "@/stores/session";

const props = defineProps<{
  loading?: boolean;
  generating?: boolean;
  mode: SessionMode;
  readOnly?: boolean;
  initialSize?: string;
  initialCount?: number;
  allowCustomCount?: boolean;
  referenceCount?: number;
  variant?: "task" | "chat";
}>();

const emit = defineEmits<{
  submit: [value: { prompt: string; mode: SessionMode; size: string; n: number; files: File[] }];
}>();

const { t } = useI18n();
const prompt = ref("");
const size = ref("1024x1024");
const n = ref(1);
const files = ref<File[]>([]);
const dragging = ref(false);
const previews = ref<Array<{ file: File; url: string }>>([]);
const maxReferenceFiles = 5;
const maxCustomCount = 100;
const isReadOnly = computed(() => Boolean(props.readOnly));
const isImageToImage = computed(() => props.mode === "image2image");
const isContinuousChat = computed(() => props.mode === "chat");
const isChatVariant = computed(() => props.variant === "chat");
const isBusy = computed(() => Boolean(props.loading || props.generating));
const hasPrompt = computed(() => prompt.value.trim().length > 0);
const submitDisabled = computed(
  () =>
    isReadOnly.value ||
    isBusy.value ||
    !hasPrompt.value ||
    (isImageToImage.value && files.value.length === 0)
);
const countSelectionDisabled = computed(() => isReadOnly.value || !props.allowCustomCount);
const submitLabel = computed(() => {
  if (props.loading) return t("workspace.submitting");
  if (props.generating) return t("workspace.generationRunning");
  return t("workspace.generate");
});

const sizeOptions = [
  { value: "1024x1024", ratio: "1:1", label: "1024 x 1024" },
  { value: "1024x1536", ratio: "2:3", label: "1024 x 1536" },
  { value: "1536x1024", ratio: "3:2", label: "1536 x 1024" },
  { value: "auto", ratio: "Auto", label: "Auto" }
];

const selectedSizeOption = computed(
  () =>
    sizeOptions.find((option) => option.value === size.value) ?? {
      value: size.value,
      ratio: size.value,
      label: size.value
    }
);
const visibleSizeOptions = computed(() =>
  isReadOnly.value ? [selectedSizeOption.value] : sizeOptions
);
const visibleCountOptions = computed(() => {
  if (isReadOnly.value) return [n.value];
  return [1];
});
const displayedReferenceCount = computed(() => props.referenceCount ?? files.value.length);
const uploaderLabel = computed(() => {
  if (isReadOnly.value && isImageToImage.value) {
    return t("workspace.referenceImages", { count: displayedReferenceCount.value });
  }
  if (files.value.length) return t("workspace.referenceImages", { count: files.value.length });
  return t("workspace.addReferenceImage");
});

watch(
  () => props.initialSize,
  (next) => {
    if (next) size.value = next;
  },
  { immediate: true }
);

watch(
  () => [props.initialCount, props.allowCustomCount] as const,
  ([next]) => {
    n.value = props.allowCustomCount && typeof next === "number" ? clampImageCount(next) : 1;
  },
  { immediate: true }
);

watch(
  () => props.mode,
  (next) => {
    if (next !== "image2image") clearFiles();
    if (next === "chat" || !props.allowCustomCount) n.value = 1;
  }
);

watch(
  files,
  (next) => {
    for (const preview of previews.value) URL.revokeObjectURL(preview.url);
    previews.value = next.map((file) => ({ file, url: URL.createObjectURL(file) }));
  },
  { deep: false }
);

onBeforeUnmount(() => {
  for (const preview of previews.value) URL.revokeObjectURL(preview.url);
});

async function submit() {
  if (submitDisabled.value) return;
  emit("submit", {
    prompt: prompt.value.trim(),
    mode: props.mode,
    size: size.value,
    n: isContinuousChat.value || !props.allowCustomCount ? 1 : clampImageCount(n.value),
    files: isImageToImage.value ? files.value : []
  });
  prompt.value = "";
  if (!isImageToImage.value) clearFiles();
}

async function onFiles(event: Event) {
  if (isReadOnly.value) return;
  const input = event.target as HTMLInputElement;
  await addFiles(Array.from(input.files ?? []));
  input.value = "";
}

async function onDrop(event: DragEvent) {
  if (isReadOnly.value) return;
  dragging.value = false;
  await addFiles(Array.from(event.dataTransfer?.files ?? []));
}

async function onPaste(event: ClipboardEvent) {
  if (isReadOnly.value) return;
  if (!isImageToImage.value) return;
  const pastedFiles = Array.from(event.clipboardData?.files ?? []);
  if (pastedFiles.some((file) => file.type.startsWith("image/"))) {
    event.preventDefault();
    await addFiles(pastedFiles);
  }
}

async function addFiles(inputFiles: File[]) {
  if (isReadOnly.value) return;
  if (!isImageToImage.value) return;
  const imageFiles = inputFiles.filter((file) => file.type.startsWith("image/"));
  const compressed = await Promise.all(imageFiles.map(compressImage));
  files.value = [...files.value, ...compressed].slice(0, maxReferenceFiles);
}

function removeFile(index: number) {
  if (isReadOnly.value) return;
  files.value = files.value.filter((_, currentIndex) => currentIndex !== index);
}

function clearFiles() {
  files.value = [];
}

function setCount(event: Event) {
  const input = event.target as HTMLInputElement;
  const value = Number(input.value);
  if (!Number.isFinite(value)) return;
  n.value = clampImageCount(value);
}

function normalizeCount(event: Event) {
  const input = event.target as HTMLInputElement;
  n.value = clampImageCount(n.value);
  input.value = String(n.value);
}

function clampImageCount(value: number) {
  return Math.min(maxCustomCount, Math.max(1, Math.floor(value)));
}

async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const maxEdge = Math.max(bitmap.width, bitmap.height);
  const needsCompression = file.size > 1.5 * 1024 * 1024 || maxEdge > 2048;
  if (!needsCompression) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, 2048 / maxEdge);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}
</script>

<template>
  <form
    class="panel thin-scrollbar flex min-h-0 flex-col overflow-y-auto"
    :class="isChatVariant ? 'gap-3 p-3' : 'min-h-[34rem] gap-4 p-4 xl:min-h-0'"
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
        @paste="onPaste"
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
        @dragenter.prevent="!isReadOnly && (dragging = true)"
        @dragover.prevent="!isReadOnly && (dragging = true)"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <Upload class="h-4 w-4" />
        <span>{{ uploaderLabel }}</span>
        <input
          v-if="!isReadOnly"
          class="hidden"
          multiple
          accept="image/png,image/jpeg,image/webp"
          type="file"
          @change="onFiles"
        />
      </label>

      <div
        v-if="previews.length"
        class="thin-scrollbar mt-3 grid max-h-36 grid-cols-3 gap-2 overflow-y-auto"
      >
        <div
          v-for="(preview, index) in previews"
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
