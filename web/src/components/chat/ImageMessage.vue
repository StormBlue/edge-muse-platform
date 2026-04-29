<script setup lang="ts">
/**
 * 消息内图片缩略图网格：纯展示 + 点击展开；**不**内置 Viewer，由父组件根据 `open` 传当前 `ImageAttachment`。
 * 单张时一列满宽，多张时 2/3 列响应式栅格，图片完整适配缩略框。
 */
import type { ImageAttachment } from "@/stores/session";

defineProps<{
  images: ImageAttachment[];
}>();
const emit = defineEmits<{ open: [image: ImageAttachment] }>();
</script>

<template>
  <div
    class="grid gap-2"
    :class="images.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'"
  >
    <button
      v-for="image in images"
      :key="image.id"
      class="aspect-square overflow-hidden rounded-lg border border-border bg-muted"
      type="button"
      @click="emit('open', image)"
    >
      <img class="h-full w-full object-contain" :src="image.url" alt="" loading="lazy" />
    </button>
  </div>
</template>
