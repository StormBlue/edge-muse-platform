<script setup lang="ts">
/**
 * Shadcn 风格输入框：统一普通文本、数字、密码等 input 外观。
 */
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const modelValue = defineModel<string | number | null>();

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <input
    v-model="modelValue"
    :class="
      cn(
        'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
  />
</template>
