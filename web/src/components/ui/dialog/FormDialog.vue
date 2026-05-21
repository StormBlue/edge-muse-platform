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
    <DialogContent :class="cn('sm:max-w-md', props.contentClass)" prevent-outside-close>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>
      <form class="flex flex-col gap-3" :aria-busy="saving" @submit.prevent="emit('submit')">
        <slot />
        <DialogFooter class="mt-1">
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
