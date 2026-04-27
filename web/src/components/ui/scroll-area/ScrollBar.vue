<script setup lang="ts">
/**
 * 滚动条：纵向/横向 + Thumb，供 ScrollArea 内部使用。
 */
import type { ScrollAreaScrollbarProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { ScrollAreaScrollbar, ScrollAreaThumb } from "reka-ui";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<ScrollAreaScrollbarProps & { class?: HTMLAttributes["class"] }>(),
  {
    orientation: "vertical",
    class: undefined
  }
);

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <!-- 纵向为右侧细条+左边透明边距防裁切；横向为底部条，Thumb 为圆角填充 track -->
  <ScrollAreaScrollbar
    data-slot="scroll-area-scrollbar"
    v-bind="delegatedProps"
    :class="
      cn(
        'flex touch-none p-px transition-colors select-none',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
        props.class
      )
    "
  >
    <ScrollAreaThumb data-slot="scroll-area-thumb" class="bg-border relative flex-1 rounded-full" />
  </ScrollAreaScrollbar>
</template>
