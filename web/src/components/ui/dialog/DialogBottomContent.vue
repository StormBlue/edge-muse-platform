<script setup lang="ts">
/**
 * 移动端底部弹层内容：仍基于 Reka Dialog，提供统一的 Portal/Overlay/Content 外壳。
 */
import type { DialogContentEmits, DialogContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { DialogContent, DialogPortal, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";
import DialogOverlay from "./DialogOverlay.vue";

defineOptions({
  inheritAttrs: false
});

const props = withDefaults(
  defineProps<
    DialogContentProps & {
      class?: HTMLAttributes["class"];
      preventOutsideClose?: boolean;
    }
  >(),
  {
    class: undefined,
    preventOutsideClose: false
  }
);
const emits = defineEmits<DialogContentEmits>();
const delegatedProps = reactiveOmit(props, "class", "preventOutsideClose");
const forwarded = useForwardPropsEmits(delegatedProps, emits);

function onOutsideInteraction(event: Event) {
  if (props.preventOutsideClose) event.preventDefault();
}
</script>

<template>
  <DialogPortal>
    <DialogOverlay class="bg-black/45 lg:hidden" />
    <DialogContent
      data-slot="dialog-bottom-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[86dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl outline-none lg:hidden',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          props.class
        )
      "
      @interact-outside="onOutsideInteraction"
      @pointer-down-outside="onOutsideInteraction"
    >
      <slot />
    </DialogContent>
  </DialogPortal>
</template>
