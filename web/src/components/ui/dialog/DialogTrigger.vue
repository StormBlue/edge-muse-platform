<script setup lang="ts">
/**
 * 打开/切换对话框的触发器：通常包在按钮或链路上，与 `Dialog` 同树。
 */
import type { DialogTriggerProps } from "reka-ui";
import { DialogTrigger } from "reka-ui";

const props = defineProps<DialogTriggerProps>();
</script>

<template>
  <DialogTrigger data-slot="dialog-trigger" v-bind="props">
    <slot />
  </DialogTrigger>
</template>
