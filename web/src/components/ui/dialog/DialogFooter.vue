<script setup lang="ts">
/**
 * 底部操作区：窄屏为反序纵排（常见「取消/确认」在上方），宽屏为右对齐横排；可选内建关闭按钮。
 */
import type { HTMLAttributes } from "vue";
import { DialogClose } from "reka-ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    showCloseButton?: boolean;
  }>(),
  {
    class: undefined,
    showCloseButton: false
  }
);
</script>

<template>
  <div
    data-slot="dialog-footer"
    :class="cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', props.class)"
  >
    <slot />
    <DialogClose v-if="showCloseButton" as-child>
      <Button variant="outline"> Close </Button>
    </DialogClose>
  </div>
</template>
