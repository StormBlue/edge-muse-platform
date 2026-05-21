<script setup lang="ts">
/**
 * Shadcn 风格多行输入框。
 */
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const modelValue = defineModel<string | number | null>();

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <textarea
    v-model="modelValue"
    :class="
      cn(
        'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
  />
</template>
