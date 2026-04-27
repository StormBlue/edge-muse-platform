<script setup lang="ts">
/**
 * 锚定气泡的点击/悬停（依 Popover 配置）控制元素。
 */
import type { PopoverTriggerProps } from "reka-ui";
import { PopoverTrigger } from "reka-ui";

const props = defineProps<PopoverTriggerProps>();
</script>

<template>
  <PopoverTrigger data-slot="popover-trigger" v-bind="props">
    <slot />
  </PopoverTrigger>
</template>
