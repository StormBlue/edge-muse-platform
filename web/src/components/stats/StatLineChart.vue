<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  title: string;
  points: Array<{ label: string; value: number }>;
}>();

const maxValue = computed(() => Math.max(1, ...props.points.map((point) => point.value)));
const polyline = computed(() => {
  const width = 320;
  const height = 120;
  const lastIndex = Math.max(props.points.length - 1, 1);
  return props.points
    .map((point, index) => {
      const x = (index / lastIndex) * width;
      const y = height - (point.value / maxValue.value) * (height - 12) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
});
</script>

<template>
  <div class="rounded-lg border border-border bg-card p-4">
    <p class="text-sm font-semibold">{{ title }}</p>
    <svg class="mt-4 h-32 w-full overflow-visible" viewBox="0 0 320 120" preserveAspectRatio="none">
      <polyline fill="none" points="0,114 320,114" stroke="var(--border)" stroke-width="1" />
      <polyline
        :points="polyline"
        fill="none"
        stroke="var(--primary)"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="3"
      />
    </svg>
  </div>
</template>
