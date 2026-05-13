import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
  type Ref
} from "vue";
import type { ImageAttachment } from "@/stores/session";

type Point = { x: number; y: number };
const ZOOM_STEP = 0.05;

export function useImageViewerZoom(image: Ref<ImageAttachment | null>) {
  const scale = ref(1);
  const offset = ref<Point>({ x: 0, y: 0 });
  const stageRef = ref<HTMLElement | null>(null);
  const imageRef = ref<HTMLImageElement | null>(null);
  const dragState = ref<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const ignoreNextBackdropClick = ref(false);
  let stageResizeObserver: ResizeObserver | null = null;

  const canDrag = computed(() => scale.value > 1);
  const imageStyle = computed<CSSProperties>(() => ({
    transform: `translate3d(${formatCssPx(offset.value.x)}, ${formatCssPx(
      offset.value.y
    )}, 0) scale(${formatCssNumber(scale.value)})`
  }));

  watch(
    () => (image.value ? `${image.value.id}:${image.value.url}` : ""),
    async () => {
      resetView();
      await nextTick();
      observeStage();
    }
  );

  onMounted(() => {
    void nextTick(() => observeStage());
  });
  onBeforeUnmount(() => {
    stageResizeObserver?.disconnect();
  });

  function setScale(nextScale: number, anchor?: Point) {
    const currentScale = scale.value;
    const normalizedScale = normalizeScale(nextScale);
    if (normalizedScale === currentScale) return;
    if (normalizedScale === 1) {
      scale.value = 1;
      offset.value = { x: 0, y: 0 };
      return;
    }

    const zoomAnchor = anchor ?? centerAnchor();
    const imageCenter = currentImageCenter();
    const ratio = normalizedScale / currentScale;
    const nextOffset = {
      x: offset.value.x + (zoomAnchor.x - imageCenter.x) * (1 - ratio),
      y: offset.value.y + (zoomAnchor.y - imageCenter.y) * (1 - ratio)
    };

    offset.value = clampOffsetValue(nextOffset, normalizedScale);
    scale.value = normalizedScale;
  }

  function resetView() {
    scale.value = 1;
    offset.value = { x: 0, y: 0 };
    dragState.value = null;
  }

  function onStagePointerDown(event: PointerEvent) {
    if (!canDrag.value || event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    event.preventDefault();
    dragState.value = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.value.x,
      originY: offset.value.y,
      moved: false
    };
    stageRef.value?.setPointerCapture(event.pointerId);
  }

  function onStagePointerMove(event: PointerEvent) {
    const drag = dragState.value;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) {
      drag.moved = true;
    }
    offset.value = clampOffsetValue({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    });
  }

  function onStagePointerEnd(event: PointerEvent) {
    const drag = dragState.value;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (stageRef.value?.hasPointerCapture(event.pointerId)) {
      stageRef.value.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      ignoreNextBackdropClick.value = true;
      window.setTimeout(() => {
        ignoreNextBackdropClick.value = false;
      }, 200);
    }
    dragState.value = null;
    clampOffset();
  }

  function onStageWheel(event: WheelEvent) {
    if (!image.value) return;
    event.preventDefault();
    setScale(
      scale.value + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
      stageAnchorFromEvent(event)
    );
  }

  function onImageLoad() {
    void nextTick(() => clampOffset());
  }

  function consumeBackdropClickIgnore() {
    if (!ignoreNextBackdropClick.value) return false;
    ignoreNextBackdropClick.value = false;
    return true;
  }

  function observeStage() {
    stageResizeObserver?.disconnect();
    stageResizeObserver = null;
    clampOffset();
    if (typeof ResizeObserver === "undefined") return;
    if (!stageRef.value) return;
    stageResizeObserver = new ResizeObserver(() => {
      void nextTick(() => clampOffset());
    });
    stageResizeObserver.observe(stageRef.value);
  }

  function clampOffset() {
    offset.value = clampOffsetValue(offset.value);
  }

  function clampOffsetValue(nextOffset: Point, targetScale = scale.value) {
    const stageRect = stageRef.value?.getBoundingClientRect();
    const imageRect = imageRef.value?.getBoundingClientRect();
    if (!stageRect || !imageRect || targetScale <= 1) return { x: 0, y: 0 };
    if (stageRect.width <= 0 || stageRect.height <= 0) return { x: 0, y: 0 };
    if (imageRect.width <= 0 || imageRect.height <= 0 || scale.value <= 0) {
      return { x: 0, y: 0 };
    }

    const baseWidth = imageRect.width / scale.value;
    const baseHeight = imageRect.height / scale.value;
    const maxX = Math.abs(baseWidth * targetScale - stageRect.width) / 2;
    const maxY = Math.abs(baseHeight * targetScale - stageRect.height) / 2;
    return {
      x: Math.min(maxX, Math.max(-maxX, nextOffset.x)),
      y: Math.min(maxY, Math.max(-maxY, nextOffset.y))
    };
  }

  function centerAnchor() {
    const rect = stageRef.value?.getBoundingClientRect();
    return { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
  }

  function currentImageCenter() {
    const stageRect = stageRef.value?.getBoundingClientRect();
    const imageRect = imageRef.value?.getBoundingClientRect();
    if (!stageRect || !imageRect || imageRect.width <= 0 || imageRect.height <= 0) {
      return centerAnchor();
    }
    return {
      x: imageRect.left - stageRect.left + imageRect.width / 2,
      y: imageRect.top - stageRect.top + imageRect.height / 2
    };
  }

  function stageAnchorFromEvent(event: MouseEvent | PointerEvent | WheelEvent) {
    const stage = stageRef.value;
    if (!stage) return centerAnchor();
    const rect = stage.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  return {
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
    zoomStep: ZOOM_STEP
  };
}

function normalizeScale(nextScale: number) {
  return Math.min(4, Math.max(1, nextScale));
}

function formatCssNumber(value: number) {
  return String(Number(value.toFixed(3)));
}

function formatCssPx(value: number) {
  return `${formatCssNumber(value)}px`;
}
