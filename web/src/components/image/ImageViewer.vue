<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  RotateCcw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-vue-next";
import { toast } from "vue-sonner";
import type { ImageAttachment } from "@/stores/session";

const props = defineProps<{ image: ImageAttachment | null; images?: ImageAttachment[] }>();
const emit = defineEmits<{
  close: [];
  select: [image: ImageAttachment];
  delete: [image: ImageAttachment];
}>();

const scale = ref(1);
const currentIndex = computed(() =>
  props.image && props.images?.length
    ? props.images.findIndex((image) => image.id === props.image?.id)
    : -1
);
const hasPrevious = computed(() => currentIndex.value > 0);
const hasNext = computed(
  () => currentIndex.value >= 0 && currentIndex.value < (props.images?.length ?? 0) - 1
);
const fileName = computed(() => `${props.image?.id ?? "edge-muse-image"}.${extension.value}`);
const extension = computed(() => {
  const mime = props.image?.mime ?? "image/png";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  return "png";
});
const metadata = computed(() => {
  if (!props.image) return "";
  const size =
    props.image.width && props.image.height
      ? `${props.image.width} x ${props.image.height}`
      : "size n/a";
  const bytes = formatBytes(props.image.byteSize);
  return [size, bytes, props.image.taskId ? `task ${props.image.taskId}` : null]
    .filter(Boolean)
    .join(" / ");
});

watch(
  () => props.image?.id,
  () => {
    scale.value = 1;
  }
);

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

async function copyPrompt() {
  const prompt = props.image?.prompt;
  if (!prompt) return;
  await navigator.clipboard.writeText(prompt);
  toast.success("Prompt 已复制");
}

function move(delta: -1 | 1) {
  const images = props.images ?? [];
  const next = images[currentIndex.value + delta];
  if (next) emit("select", next);
}

function onKeydown(event: KeyboardEvent) {
  if (!props.image) return;
  if (event.key === "Escape") emit("close");
  if (event.key === "ArrowLeft") move(-1);
  if (event.key === "ArrowRight") move(1);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
</script>

<template>
  <div
    v-if="image"
    class="fixed inset-0 z-50 grid grid-rows-[auto_minmax(0,1fr)_auto] bg-black/90 text-white"
    @click.self="emit('close')"
  >
    <header class="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold">{{ image.id }}</p>
        <p class="truncate text-xs text-white/65">{{ metadata }}</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="viewer-button"
          type="button"
          title="Zoom out"
          @click="scale = Math.max(0.5, scale - 0.25)"
        >
          <ZoomOut class="h-4 w-4" />
        </button>
        <button class="viewer-button" type="button" title="Reset zoom" @click="scale = 1">
          <RotateCcw class="h-4 w-4" />
        </button>
        <button
          class="viewer-button"
          type="button"
          title="Zoom in"
          @click="scale = Math.min(4, scale + 0.25)"
        >
          <ZoomIn class="h-4 w-4" />
        </button>
        <button
          class="viewer-button"
          type="button"
          title="Copy prompt"
          :disabled="!image.prompt"
          @click="copyPrompt"
        >
          <Copy class="h-4 w-4" />
        </button>
        <a class="viewer-button" :href="image.url" :download="fileName" title="Download">
          <Download class="h-4 w-4" />
        </a>
        <button
          class="viewer-button"
          type="button"
          title="Delete message"
          :disabled="!image.messageId"
          @click="emit('delete', image)"
        >
          <Trash2 class="h-4 w-4" />
        </button>
        <button class="viewer-button" type="button" title="Close" @click="emit('close')">
          <X class="h-4 w-4" />
        </button>
      </div>
    </header>

    <main class="relative min-h-0 overflow-auto p-4" @click.self="emit('close')">
      <button
        v-if="hasPrevious"
        class="viewer-nav left-4"
        type="button"
        title="Previous image"
        @click="move(-1)"
      >
        <ChevronLeft class="h-6 w-6" />
      </button>
      <div class="flex min-h-full items-center justify-center">
        <img
          class="max-h-[78vh] max-w-[92vw] rounded-lg object-contain shadow-2xl shadow-black/50 transition-transform"
          :src="image.url"
          alt=""
          :style="{ transform: `scale(${scale})` }"
        />
      </div>
      <button
        v-if="hasNext"
        class="viewer-nav right-4"
        type="button"
        title="Next image"
        @click="move(1)"
      >
        <ChevronRight class="h-6 w-6" />
      </button>
    </main>

    <footer class="border-t border-white/10 px-4 py-3">
      <p class="line-clamp-2 text-xs text-white/70">{{ image.prompt }}</p>
    </footer>
  </div>
</template>

<style scoped>
.viewer-button {
  display: inline-flex;
  height: 2.25rem;
  width: 2.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.1);
  color: white;
}

.viewer-button:hover {
  background: rgb(255 255 255 / 0.18);
}

.viewer-nav {
  position: absolute;
  top: 50%;
  z-index: 1;
  display: inline-flex;
  height: 3rem;
  width: 3rem;
  transform: translateY(-50%);
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.12);
  color: white;
}
</style>
