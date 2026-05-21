<script setup lang="ts">
/**
 * Shadcn 风格 checkbox：基于 Reka CheckboxRoot，支持 v-model:checked。
 */
import type { CheckboxRootEmits, CheckboxRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { Check } from "@lucide/vue";
import { CheckboxIndicator, CheckboxRoot, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";

const props = withDefaults(defineProps<CheckboxRootProps & { class?: HTMLAttributes["class"] }>(), {
  class: undefined
});
const emits = defineEmits<CheckboxRootEmits>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <CheckboxRoot
    data-slot="checkbox"
    v-bind="forwarded"
    :class="
      cn(
        'peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:ring-ring h-4 w-4 shrink-0 rounded-sm border shadow-xs transition-shadow outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
  >
    <CheckboxIndicator class="flex items-center justify-center text-current">
      <Check class="h-3.5 w-3.5" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
