<script setup lang="ts">
/**
 * 全屏大图查看器（固定层 z-50）：
 * - **单图**：仅传 `image`，无左右箭头；
 * - **多图**：传 `image`（当前张）+ `images`（全集），`currentIndex` 由 id 匹配，左右键/按钮 emit `select` 换张；
 * - **缩放**：`scale` 作用于 `<img>` 的 transform，换图时重置为 1；
 * - **删除**：需 `image.messageId` 有值（软删消息），无则禁用；
 * - **键盘**：Esc 关闭，左右箭头在有多图时切换（与 `move` 一致）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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
  /** 画廊内切换下一张/上一张 */
  select: [image: ImageAttachment];
  /** 删整条消息，由父级调 API */
  delete: [image: ImageAttachment];
}>();

const { t } = useI18n();
/** 仅影响当前展示图，切图时由 watch 重置 */
const scale = ref(1);
/** 在 `images` 里定位当前 `image.id`；无集合时为 -1，左右不可用 */
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
/** 顶栏辅文：尺寸、体积、可选 taskId */
const metadata = computed(() => {
  if (!props.image) return "";
  const size =
    props.image.width && props.image.height
      ? `${props.image.width} x ${props.image.height}`
      : t("viewer.sizeUnavailable");
  const bytes = formatBytes(props.image.byteSize);
  return [size, bytes, props.image.taskId ? `${t("viewer.task")} ${props.image.taskId}` : null]
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
  toast.success(t("viewer.promptCopied"));
}

/** 在 `images` 数组内按下标步进并通知父组件更新 `image` */
function move(delta: -1 | 1) {
  const images = props.images ?? [];
  const next = images[currentIndex.value + delta];
  if (next) emit("select", next);
}

/** 全局监听：仅在有当前图时响应，避免其它页面抢键 */
function onKeydown(event: KeyboardEvent) {
  if (!props.image) return;
  if (event.key === "Escape") emit("close");
  if (event.key === "ArrowLeft") move(-1);
  if (event.key === "ArrowRight") move(1);
}

/** 元数据行 human-readable 体积 */
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
    class="image-viewer fixed inset-0 z-50 grid bg-black/90 text-white"
    @click.self="emit('close')"
  >
    <header
      class="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-3 py-2 sm:px-4"
    >
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold">{{ image.id }}</p>
        <p class="truncate text-xs text-white/65">{{ metadata }}</p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <button
          class="viewer-button"
          type="button"
          :title="t('viewer.zoomOut')"
          @click="scale = Math.max(0.5, scale - 0.25)"
        >
          <ZoomOut class="h-4 w-4" />
        </button>
        <button
          class="viewer-button"
          type="button"
          :title="t('viewer.resetZoom')"
          @click="scale = 1"
        >
          <RotateCcw class="h-4 w-4" />
        </button>
        <button
          class="viewer-button"
          type="button"
          :title="t('viewer.zoomIn')"
          @click="scale = Math.min(4, scale + 0.25)"
        >
          <ZoomIn class="h-4 w-4" />
        </button>
        <button
          class="viewer-button"
          type="button"
          :title="t('viewer.copyPrompt')"
          :disabled="!image.prompt"
          @click="copyPrompt"
        >
          <Copy class="h-4 w-4" />
        </button>
        <a
          class="viewer-button"
          :href="image.url"
          :download="fileName"
          :title="t('viewer.download')"
        >
          <Download class="h-4 w-4" />
        </a>
        <button
          class="viewer-button"
          type="button"
          :title="t('viewer.deleteMessage')"
          :disabled="!image.messageId"
          @click="emit('delete', image)"
        >
          <Trash2 class="h-4 w-4" />
        </button>
        <button
          class="viewer-button"
          type="button"
          :title="t('viewer.close')"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </header>

    <main class="relative min-h-0 overflow-auto p-2 sm:p-4" @click.self="emit('close')">
      <button
        v-if="hasPrevious"
        class="viewer-nav left-4"
        type="button"
        :title="t('viewer.previousImage')"
        @click="move(-1)"
      >
        <ChevronLeft class="h-6 w-6" />
      </button>
      <div class="flex min-h-full items-center justify-center">
        <img
          class="viewer-image rounded-lg object-contain shadow-2xl shadow-black/50 transition-transform"
          :src="image.url"
          alt=""
          :style="{ transform: `scale(${scale})` }"
        />
      </div>
      <button
        v-if="hasNext"
        class="viewer-nav right-4"
        type="button"
        :title="t('viewer.nextImage')"
        @click="move(1)"
      >
        <ChevronRight class="h-6 w-6" />
      </button>
    </main>

    <footer class="border-t border-white/10 px-3 py-2 sm:px-4 sm:py-3">
      <p class="line-clamp-2 text-xs text-white/70">{{ image.prompt }}</p>
    </footer>
  </div>
</template>

<style scoped>
/* 三行：顶栏工具 / 可滚主图区 / 底栏 prompt；窄屏隐藏底栏省高 */
.image-viewer {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.viewer-image {
  max-width: min(100%, 92vw);
  max-height: min(100%, 78vh);
}

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

@media (max-width: 640px) {
  .image-viewer {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .viewer-image {
    max-width: calc(100vw - 1rem);
    max-height: calc(100dvh - 8.75rem);
  }

  .viewer-button {
    height: 2rem;
    width: 2rem;
  }

  .viewer-nav {
    height: 2.5rem;
    width: 2.5rem;
  }

  footer {
    display: none;
  }
}
</style>
