<script setup lang="ts">
/**
 * 全屏大图查看器（Teleport 到 body，固定层 z-70）：
 * - **单图**：仅传 `image`，无左右箭头；
 * - **多图**：传 `image`（当前张）+ `images`（全集），`currentIndex` 由 id 匹配，左右键/按钮 emit `select` 换张；
 * - **缩放**：`scale` 作用于图片本体的 transform，换图时重置为 1；
 * - **删除**：需 `image.messageId` 有值（软删消息），无则禁用；
 * - **键盘**：Esc 关闭，左右箭头在有多图时切换（与 `move` 一致）。
 */
import { computed, onBeforeUnmount, onMounted, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import ImageViewerNavButton from "./ImageViewerNavButton.vue";
import ImageViewerToolbar from "./ImageViewerToolbar.vue";
import { useImageViewerZoom } from "./useImageViewerZoom";
import type { ImageAttachment } from "@/stores/session";

const props = withDefaults(
  defineProps<{ image: ImageAttachment | null; images?: ImageAttachment[]; canDelete?: boolean }>(),
  { images: () => [], canDelete: true }
);
const emit = defineEmits<{
  close: [];
  /** 画廊内切换下一张/上一张 */
  select: [image: ImageAttachment];
  /** 删整条消息，由父级调 API */
  delete: [image: ImageAttachment];
}>();

const { t } = useI18n();
const imageRefProp = toRef(props, "image");
const {
  canDrag,
  dragState,
  imageStyle,
  imageRef,
  scale,
  stageRef,
  consumeBackdropClickIgnore,
  onImageLoad,
  onStagePointerDown,
  onStagePointerEnd,
  onStagePointerMove,
  onStageWheel,
  resetView,
  setScale,
  zoomStep
} = useImageViewerZoom(imageRefProp);
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
const displayTitle = computed(() => props.image?.displayName || props.image?.id || "");
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
  const bytes = props.image.byteSize > 0 ? formatBytes(props.image.byteSize) : null;
  return [size, bytes, props.image.taskId ? `${t("viewer.task")} ${props.image.taskId}` : null]
    .filter(Boolean)
    .join(" / ");
});

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});

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

function closeFromBackdrop(event: MouseEvent) {
  if (consumeBackdropClickIgnore()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  emit("close");
}

function deleteCurrentImage() {
  if (props.image) emit("delete", props.image);
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
  <Teleport to="body">
    <div
      v-if="image"
      class="image-viewer w-full fixed flex flex-col inset-0 z-[70] bg-black/90 text-white"
      @click.self="closeFromBackdrop"
    >
      <header
        class="flex w-full min-h-14 items-center justify-between gap-3 border-b border-white/10 py-2"
      >
        <div class="min-w-0 px-3 sm:px-4">
          <p class="truncate text-sm font-semibold">{{ displayTitle }}</p>
          <p class="truncate text-xs text-white/65">{{ metadata }}</p>
        </div>
        <ImageViewerToolbar
          :can-copy-prompt="Boolean(image.prompt)"
          :can-delete="canDelete && Boolean(image.messageId)"
          :download-file-name="fileName"
          :download-url="image.url"
          @close="emit('close')"
          @copy-prompt="copyPrompt"
          @delete="deleteCurrentImage"
          @reset-zoom="resetView"
          @zoom-in="setScale(scale + zoomStep)"
          @zoom-out="setScale(scale - zoomStep)"
        />
      </header>

      <main
        class="viewer-main relative min-h-0 overflow-hidden p-2 sm:p-4 justify-center items-center flex-1"
        @click.self="closeFromBackdrop"
      >
        <div
          ref="stageRef"
          class="viewer-stage"
          :class="{ 'viewer-stage--draggable': canDrag, 'viewer-stage--dragging': dragState }"
          @pointerdown="onStagePointerDown"
          @pointermove="onStagePointerMove"
          @pointerup="onStagePointerEnd"
          @pointercancel="onStagePointerEnd"
          @wheel="onStageWheel"
          @click.self="closeFromBackdrop"
        >
          <img
            ref="imageRef"
            class="viewer-image rounded-lg object-contain shadow-2xl shadow-black/50"
            :style="imageStyle"
            :src="image.url"
            alt=""
            draggable="false"
            @load="onImageLoad"
          />

          <ImageViewerNavButton v-if="hasPrevious" direction="previous" @move="move(-1)" />
          <ImageViewerNavButton v-if="hasNext" direction="next" @move="move(1)" />
        </div>
      </main>

      <ImageViewerNavButton v-if="hasPrevious" direction="previous" mobile @move="move(-1)" />
      <ImageViewerNavButton v-if="hasNext" direction="next" mobile @move="move(1)" />

      <footer class="border-t border-white/10 px-3 py-2 sm:px-4 sm:py-3">
        <p class="line-clamp-2 text-xs text-white/70">{{ image.prompt }}</p>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
/* 三行：顶栏工具 / 可滚主图区 / 底栏 prompt；窄屏隐藏底栏省高 */
.image-viewer {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.viewer-image {
  display: block;
  width: auto;
  height: auto;
  max-width: min(100%, 92vw);
  max-height: min(100%, 78vh);
  transform-origin: center center;
  user-select: none;
  will-change: transform;
}

.viewer-main {
  display: block;
}

.viewer-stage {
  display: flex;
  position: absolute;
  inset: 0;
  width: auto;
  min-width: 0;
  height: auto;
  min-height: 0;
  padding: 0;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
}

.viewer-stage--draggable {
  cursor: grab;
}

.viewer-stage--dragging {
  cursor: grabbing;
}

@media (max-width: 640px) {
  header {
    align-items: flex-start;
  }

  .image-viewer {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .viewer-main {
    padding: 0;
  }

  .viewer-stage {
    min-height: 0;
  }

  .viewer-image {
    max-width: 100%;
    max-height: 100%;
  }

  footer {
    display: none;
  }
}
</style>
