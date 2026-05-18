<script setup lang="ts">
/**
 * 对话框主体：Portal + 半透明遮罩 + 屏幕居中内容区，内置右上角关闭（可 `showCloseButton={false}` 关闭）。
 * 动效、定位与 reka-ui `DialogContent` 的 data-state 类名配合。
 */
import type { DialogContentEmits, DialogContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { X } from "@lucide/vue";
import { DialogClose, DialogContent, DialogPortal, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";
import DialogOverlay from "./DialogOverlay.vue";

defineOptions({
  inheritAttrs: false
});

const props = withDefaults(
  defineProps<
    DialogContentProps & {
      class?: HTMLAttributes["class"];
      showCloseButton?: boolean;
      preventOutsideClose?: boolean;
    }
  >(),
  {
    class: undefined,
    preventOutsideClose: false,
    showCloseButton: true
  }
);
const emits = defineEmits<DialogContentEmits>();

// 不把 `class` 透传给 reka，由下方 `cn` 合并进最终节点
const delegatedProps = reactiveOmit(props, "class", "preventOutsideClose", "showCloseButton");

const forwarded = useForwardPropsEmits(delegatedProps, emits);

function onOutsideInteraction(event: Event) {
  if (props.preventOutsideClose) event.preventDefault();
}
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      data-slot="dialog-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
          props.class
        )
      "
      @interact-outside="onOutsideInteraction"
      @pointer-down-outside="onOutsideInteraction"
    >
      <slot />

      <DialogClose
        v-if="showCloseButton"
        data-slot="dialog-close"
        class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
      >
        <X />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
