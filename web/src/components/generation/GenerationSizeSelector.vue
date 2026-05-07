<script setup lang="ts">
/**
 * 三段式画布尺寸选择：Auto、推荐 3:2、更多尺寸下拉。
 */
import { computed } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { generationSizeChoices } from "@/views/ai-image/generationSizeChoices";
import type { SizeOption } from "@/views/workspace/workspaceOptions";

const props = defineProps<{
  disabled?: boolean;
  modelValue: string;
  options: SizeOption[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const { t } = useI18n();

const choices = computed(() => generationSizeChoices(props.options, props.modelValue));
const primaryButtons = computed(() =>
  choices.value.primary.filter((choice) => choice.kind !== "custom")
);
const customValue = computed(() =>
  choices.value.customOptions.some((option) => option.value === props.modelValue)
    ? props.modelValue
    : ""
);

function selectSize(value: string) {
  if (props.disabled || !value) return;
  emit("update:modelValue", value);
}
</script>

<template>
  <div class="generation-size-selector">
    <button
      v-for="choice in primaryButtons"
      :key="choice.kind"
      class="generation-size-choice"
      :class="modelValue === choice.option.value ? 'generation-size-choice--active' : ''"
      type="button"
      :aria-pressed="modelValue === choice.option.value"
      :disabled="disabled || !choice.option.value"
      @click="selectSize(choice.option.value)"
    >
      <span class="generation-size-choice-ratio">{{ choice.option.ratio }}</span>
      <span class="generation-size-choice-label">
        {{ choice.option.label }}
      </span>
    </button>

    <label class="generation-size-more" :class="{ 'generation-size-more--active': customValue }">
      <select
        class="generation-size-more-select"
        :disabled="disabled || !choices.customOptions.length"
        :value="customValue"
        :aria-label="t('workspace.moreSizes')"
        @change="selectSize(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t("workspace.moreSizes") }}</option>
        <option v-for="option in choices.customOptions" :key="option.value" :value="option.value">
          {{ option.ratio }} · {{ option.label }}
        </option>
      </select>
      <ChevronDown class="generation-size-more-icon h-4 w-4" />
    </label>
  </div>
</template>

<style scoped>
.generation-size-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.generation-size-choice,
.generation-size-more {
  min-width: 0;
  min-height: 3.25rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 52%);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.generation-size-choice {
  display: grid;
  align-content: center;
  gap: 0.125rem;
  padding: 0.375rem 0.625rem;
  text-align: left;
}

.generation-size-choice:hover,
.generation-size-more:hover {
  background: var(--muted);
}

.generation-size-more--active,
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
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generation-size-more {
  position: relative;
  display: flex;
  align-items: stretch;
  overflow: hidden;
}

.generation-size-more-select {
  min-width: 0;
  width: 100%;
  appearance: none;
  background: transparent;
  padding: 0.375rem 2rem 0.375rem 0.625rem;
  color: var(--foreground);
  font-size: 0.75rem;
  font-weight: 700;
  outline: none;
}

.generation-size-more-icon {
  pointer-events: none;
  position: absolute;
  right: 0.625rem;
  top: 50%;
  color: var(--muted-foreground);
  transform: translateY(-50%);
}
</style>
