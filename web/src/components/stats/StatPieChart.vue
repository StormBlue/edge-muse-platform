<script setup lang="ts">
/**
 * 饼图（圆锥渐变）：`conic-gradient` 从 0° 起按 value/total 累加扇区角度；
 * 图例与圆点颜色用同一 `colors` 下标取模。`total` 至少为 1，全 0 时仍占满但视觉上退化为空数据可用 `--muted`。
 */
import { computed } from "vue";

const props = defineProps<{
  title: string;
  items: Array<{ label: string; value: number }>;
}>();

const colors = ["#f5b942", "#3dd6c6", "#d65cff", "#64748b", "#ef4444"];
const total = computed(() =>
  Math.max(
    1,
    props.items.reduce((sum, item) => sum + item.value, 0)
  )
);
/** 将每项占比转为 `色 start% end%` 多段，拼进 conic-gradient */
const background = computed(() => {
  if (props.items.length === 0) return "var(--muted)";
  let cursor = 0;
  const segments = props.items.map((item, index) => {
    const start = cursor;
    cursor += (item.value / total.value) * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
});
</script>

<template>
  <div class="rounded-lg border border-border bg-card p-4">
    <p class="text-sm font-semibold">{{ title }}</p>
    <div class="mt-4 flex items-center gap-4">
      <div class="h-24 w-24 shrink-0 rounded-full" :style="{ background }"></div>
      <div class="min-w-0 flex-1 space-y-2">
        <div
          v-for="(item, index) in items"
          :key="item.label"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span
              class="h-2.5 w-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: colors[index % colors.length] }"
            ></span>
            <span class="truncate text-muted-foreground">{{ item.label }}</span>
          </span>
          <span class="font-mono">{{ item.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
