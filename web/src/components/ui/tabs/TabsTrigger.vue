<script setup lang="ts">
import type { TabsTriggerProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { TabsTrigger } from "reka-ui";
import { cn } from "@/lib/utils";

const props = withDefaults(defineProps<TabsTriggerProps & { class?: HTMLAttributes["class"] }>(), {
  class: undefined
});
</script>

<template>
  <TabsTrigger
    data-slot="tabs-trigger"
    :value="value"
    :disabled="disabled"
    :class="
      cn(
        'inline-flex h-7 min-w-20 items-center justify-center rounded-sm px-3 text-xs font-semibold whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm disabled:pointer-events-none disabled:opacity-50',
        props.class
      )
    "
  >
    <slot />
  </TabsTrigger>
</template>
