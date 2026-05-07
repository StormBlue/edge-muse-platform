<script setup lang="ts">
import type { TabsListProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { TabsList } from "reka-ui";
import { cn } from "@/lib/utils";

const props = withDefaults(defineProps<TabsListProps & { class?: HTMLAttributes["class"] }>(), {
  class: undefined
});
</script>

<template>
  <TabsList
    data-slot="tabs-list"
    :loop="loop"
    :class="
      cn(
        'inline-flex h-9 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
        props.class
      )
    "
  >
    <slot />
  </TabsList>
</template>
