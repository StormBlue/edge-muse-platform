<script setup lang="ts">
/**
 * 气泡内容：经 Portal 挂到 body，相对 Trigger 侧移 `sideOffset`、对齐 `align`。
 * 默认定宽 w-72、圆角边线与阴影。
 */
import type { PopoverContentEmits, PopoverContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { PopoverContent, PopoverPortal, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";

defineOptions({
  inheritAttrs: false
});

const props = withDefaults(
  defineProps<PopoverContentProps & { class?: HTMLAttributes["class"] }>(),
  {
    align: "center",
    class: undefined,
    sideOffset: 4
  }
);
const emits = defineEmits<PopoverContentEmits>();

// `class` 在下方与预设样式 `cn` 合并
const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <PopoverPortal>
    <PopoverContent
      data-slot="popover-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'z-50 w-72 rounded-md border border-border bg-card p-4 text-foreground shadow-md outline-none',
          props.class
        )
      "
    >
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
