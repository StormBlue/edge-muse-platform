<script setup lang="ts">
import type { SelectTriggerProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { ChevronDown } from "@lucide/vue";
import { reactiveOmit } from "@vueuse/core";
import { SelectIcon, SelectTrigger, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<SelectTriggerProps & { class?: HTMLAttributes["class"] }>(),
  {
    class: undefined
  }
);
const delegatedProps = reactiveOmit(props, "class");
const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <SelectTrigger
    data-slot="select-trigger"
    v-bind="forwarded"
    :class="
      cn(
        'ui-field flex items-center justify-between gap-2 px-3 pr-2.5 text-left text-sm',
        'disabled:cursor-not-allowed disabled:opacity-55 [&>span]:min-w-0 [&>span]:truncate',
        props.class
      )
    "
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground" />
    </SelectIcon>
  </SelectTrigger>
</template>
