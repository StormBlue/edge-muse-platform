<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Send, Upload, X } from "lucide-vue-next";
import type { SessionMode } from "@/stores/session";

const props = defineProps<{
  loading?: boolean;
}>();

const emit = defineEmits<{
  submit: [value: { prompt: string; mode: SessionMode; size: string; n: number; files: File[] }];
}>();

const prompt = ref("");
const mode = ref<SessionMode>("text2image");
const size = ref("1024x1024");
const n = ref(1);
const files = ref<File[]>([]);
const dragging = ref(false);
const previews = ref<Array<{ file: File; url: string }>>([]);
const maxReferenceFiles = 5;

const uploaderLabel = computed(() => {
  if (files.value.length) return `${files.value.length} 张参考图`;
  return mode.value === "image2image" ? "添加参考图" : "参考图";
});

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
  if (!prompt.value.trim()) return;
  emit("submit", {
    prompt: prompt.value.trim(),
    mode: mode.value,
    size: size.value,
    n: n.value,
    files: files.value
  });
  prompt.value = "";
  clearFiles();
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  await addFiles(Array.from(input.files ?? []));
  input.value = "";
}

async function onDrop(event: DragEvent) {
  dragging.value = false;
  await addFiles(Array.from(event.dataTransfer?.files ?? []));
}

async function onPaste(event: ClipboardEvent) {
  const pastedFiles = Array.from(event.clipboardData?.files ?? []);
  if (pastedFiles.length > 0) await addFiles(pastedFiles);
}

async function addFiles(inputFiles: File[]) {
  const imageFiles = inputFiles.filter((file) => file.type.startsWith("image/"));
  const compressed = await Promise.all(imageFiles.map(compressImage));
  files.value = [...files.value, ...compressed].slice(0, maxReferenceFiles);
  if (files.value.length > 0 && mode.value === "text2image") mode.value = "image2image";
}

function removeFile(index: number) {
  files.value = files.value.filter((_, currentIndex) => currentIndex !== index);
}

function clearFiles() {
  files.value = [];
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
  <form class="panel p-3" @submit.prevent="submit">
    <textarea
      v-model="prompt"
      class="ui-field min-h-24 resize-none px-3 py-3 text-sm"
      placeholder="描述你想生成的图片..."
      @paste="onPaste"
      @keydown.meta.enter.prevent="submit"
      @keydown.ctrl.enter.prevent="submit"
    ></textarea>
    <div v-if="previews.length" class="mt-3 grid grid-cols-5 gap-2">
      <div
        v-for="(preview, index) in previews"
        :key="preview.url"
        class="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
      >
        <img class="h-full w-full object-cover" :src="preview.url" alt="" />
        <button
          class="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
          type="button"
          @click="removeFile(index)"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <select v-model="mode" class="ui-field h-9 w-32 px-2 text-sm">
        <option value="text2image">文生图</option>
        <option value="image2image">图生图</option>
        <option value="chat">对话</option>
      </select>
      <select v-model="size" class="ui-field h-9 w-36 px-2 text-sm">
        <option value="1024x1024">1024 x 1024</option>
        <option value="1024x1536">1024 x 1536</option>
        <option value="1536x1024">1536 x 1024</option>
        <option value="auto">Auto</option>
      </select>
      <input
        v-model.number="n"
        class="ui-field h-9 w-20 px-2 text-sm"
        min="1"
        max="4"
        type="number"
      />
      <label
        class="ui-button ui-button-secondary"
        :class="dragging ? 'border-primary bg-muted' : ''"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <Upload class="h-4 w-4" />
        <span>{{ uploaderLabel }}</span>
        <input
          class="hidden"
          multiple
          accept="image/png,image/jpeg,image/webp"
          type="file"
          @change="onFiles"
        />
      </label>
      <button class="ui-button ui-button-primary ml-auto" :disabled="props.loading" type="submit">
        <Send class="h-4 w-4" />
        生成
      </button>
    </div>
  </form>
</template>
