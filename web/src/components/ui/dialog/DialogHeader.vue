<script setup lang="ts">
/**
 * 标题区布局：小屏居中、宽屏左对齐的纵向 flex 容器，放 `DialogTitle` / `DialogDescription`。
 */
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <div
    data-slot="dialog-header"
    :class="cn('flex flex-col gap-2 text-center sm:text-left', props.class)"
  >
    <slot />
  </div>
</template>
