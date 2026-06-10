<script setup lang="ts">
/**
 * 表单弹窗外壳：统一使用 shadcn-vue Dialog primitives，业务组件只提供标题、内容和操作按钮文本。
 */
import type { HTMLAttributes } from "vue";
import { Loader2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Dialog from "./Dialog.vue";
import DialogClose from "./DialogClose.vue";
import DialogContent from "./DialogContent.vue";
import DialogFooter from "./DialogFooter.vue";
import DialogHeader from "./DialogHeader.vue";
import DialogTitle from "./DialogTitle.vue";

const props = withDefaults(
  defineProps<{
    cancelLabel: string;
    contentClass?: HTMLAttributes["class"];
    disabled?: boolean;
    open: boolean;
    saving?: boolean;
    submitLabel: string;
    title: string;
  }>(),
  {
    contentClass: undefined,
    disabled: false,
    saving: false
  }
);

const emit = defineEmits<{
  submit: [];
  "update:open": [open: boolean];
}>();
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      :class="cn('form-dialog-content sm:max-w-md', props.contentClass)"
      prevent-outside-close
    >
      <DialogHeader class="shrink-0 px-6 pb-4 pt-6">
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>
      <form
        class="flex min-h-0 flex-1 flex-col overflow-hidden"
        :aria-busy="saving"
        @submit.prevent="emit('submit')"
      >
        <div
          class="form-dialog-body thin-scrollbar grid min-h-0 flex-1 auto-rows-min gap-3 overflow-y-auto overscroll-contain px-6 pb-4"
        >
          <slot />
        </div>
        <DialogFooter class="shrink-0 border-t border-border px-6 py-4">
          <DialogClose as-child>
            <Button variant="secondary" type="button" :disabled="saving">
              {{ cancelLabel }}
            </Button>
          </DialogClose>
          <Button type="submit" :disabled="disabled || saving">
            <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
            {{ submitLabel }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
:global(.form-dialog-content) {
  display: flex !important;
  flex-direction: column;
  gap: 0 !important;
  max-height: calc(100dvh - 2rem);
  overflow: hidden;
  padding: 0 !important;
}

:global(.form-dialog-body) {
  min-height: 0;
  max-height: calc(100dvh - 13rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}

@media (min-width: 640px) {
  :global(.form-dialog-body) {
    max-height: calc(100dvh - 12rem);
  }
}
</style>
