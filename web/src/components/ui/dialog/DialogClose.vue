<script setup lang="ts">
/**
 * 关闭控制：可包自定义按钮/图标，或与 `as-child` 等 reka 行为配合。
 */
import type { DialogCloseProps } from "reka-ui";
import { DialogClose } from "reka-ui";

const props = defineProps<DialogCloseProps>();
</script>

<template>
  <DialogClose data-slot="dialog-close" v-bind="props">
    <slot />
  </DialogClose>
</template>
