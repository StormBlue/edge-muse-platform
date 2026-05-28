<script setup lang="ts">
import type { SizeOption } from "@/views/workspace/workspaceOptions";

const props = defineProps<{
  disabled?: boolean;
  modelValue: string;
  options: SizeOption[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function selectSize(value: string) {
  if (props.disabled || !value) return;
  emit("update:modelValue", value);
}
</script>

<template>
  <div class="generation-size-selector" role="radiogroup">
    <button
      v-for="option in options"
      :key="option.value"
      class="generation-size-choice"
      :class="modelValue === option.value ? 'generation-size-choice--active' : ''"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :title="`${option.ratio} · ${option.label}`"
      :disabled="disabled || !option.value"
      @click="selectSize(option.value)"
    >
      <span class="generation-size-choice-ratio">{{ option.ratio }}</span>
      <span class="generation-size-choice-label">
        {{ option.label }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.generation-size-selector {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6.75rem, 1fr));
  gap: 0.5rem;
}

.generation-size-choice {
  min-width: 0;
  min-height: 3.5rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 52%);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
  display: grid;
  align-content: center;
  gap: 0.125rem;
  padding: 0.375rem 0.625rem;
  text-align: left;
}

.generation-size-choice:hover {
  background: var(--muted);
}

.generation-size-choice--active {
  border-color: color-mix(in oklch, var(--primary), transparent 35%);
  background: color-mix(in oklch, var(--primary), transparent 88%);
  color: var(--foreground);
}

.generation-size-choice-ratio {
  overflow: hidden;
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.25rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generation-size-choice-label {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1rem;
  overflow-wrap: anywhere;
}
</style>
