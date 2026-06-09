<script setup lang="ts">
/**
 * Shadcn 风格 checkbox：基于 Reka CheckboxRoot，支持 v-model:checked。
 */
import type { CheckboxRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { Check } from "@lucide/vue";
import { computed } from "vue";
import { CheckboxIndicator, CheckboxRoot } from "reka-ui";
import { cn } from "@/lib/utils";

type CheckedState = boolean | "indeterminate";

const props = withDefaults(
  defineProps<
    Omit<CheckboxRootProps, "modelValue" | "defaultValue"> & {
      checked?: CheckedState;
      class?: HTMLAttributes["class"];
      defaultChecked?: CheckedState;
    }
  >(),
  {
    class: undefined,
    checked: undefined,
    defaultChecked: undefined
  }
);
const emits = defineEmits<{
  "update:checked": [value: CheckedState];
}>();

const delegatedProps = computed(() => {
  const { checked: _checked, class: _class, defaultChecked, ...delegated } = props;
  return {
    ...delegated,
    defaultValue: defaultChecked
  };
});
</script>

<template>
  <CheckboxRoot
    data-slot="checkbox"
    v-bind="delegatedProps"
    :model-value="checked"
    :class="
      cn(
        'peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:ring-ring h-4 w-4 shrink-0 rounded-sm border shadow-xs transition-shadow outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
    @update:model-value="emits('update:checked', $event as CheckedState)"
  >
    <CheckboxIndicator class="flex items-center justify-center text-current">
      <Check class="h-3.5 w-3.5" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
