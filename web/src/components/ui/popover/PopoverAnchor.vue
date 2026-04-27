<script setup lang="ts">
/**
 * 可选的额外参考节点：在 Trigger 与浮层解耦时，把定位基准绑到某容器上（如表单项外框）。
 */
import type { PopoverAnchorProps } from "reka-ui";
import { PopoverAnchor } from "reka-ui";

const props = defineProps<PopoverAnchorProps>();
</script>

<template>
  <PopoverAnchor data-slot="popover-anchor" v-bind="props">
    <slot />
  </PopoverAnchor>
</template>
