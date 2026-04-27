<script setup lang="ts">
/**
 * 水平条形对比图：三列网格（标签 | 条 | 数值），条宽 = value/max*100%，最小 4% 以免全 0 时不可见。
 */
import { computed } from "vue";

const props = defineProps<{
  title: string;
  items: Array<{ label: string; value: number }>;
}>();

/** 同组内最大值为 100% 宽；至少为 1 避免除零 */
const maxValue = computed(() => Math.max(1, ...props.items.map((item) => item.value)));
</script>

<template>
  <div class="rounded-lg border border-border bg-card p-4">
    <p class="text-sm font-semibold">{{ title }}</p>
    <div class="mt-4 space-y-3">
      <div
        v-for="item in items"
        :key="item.label"
        class="grid grid-cols-[6rem_minmax(0,1fr)_3rem] gap-3 text-xs"
      >
        <span class="truncate text-muted-foreground">{{ item.label }}</span>
        <span class="h-2 self-center overflow-hidden rounded-full bg-muted">
          <span
            class="block h-full rounded-full bg-primary"
            :style="{ width: `${Math.max(4, (item.value / maxValue) * 100)}%` }"
          ></span>
        </span>
        <span class="text-right font-mono">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>
