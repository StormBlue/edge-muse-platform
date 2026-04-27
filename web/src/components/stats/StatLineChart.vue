<script setup lang="ts">
/**
 * 简易折线图：纯 SVG `<polyline>`，无坐标轴文字（仅标题）。
 * - x：在 [0,width] 上等分点；y：按 `maxValue` 线性映射到 viewBox，上下各留 6px 边距；
 * - `preserveAspectRatio="none"` 随容器拉伸，适合响应式卡片宽。
 */
import { computed } from "vue";

const props = defineProps<{
  title: string;
  /** 时间序列点；`label` 当前未绘在轴上，可由父组件另做图例 */
  points: Array<{ label: string; value: number }>;
}>();

const maxValue = computed(() => Math.max(1, ...props.points.map((point) => point.value)));
/** SVG `points` 属性：逗号分隔 x,y 对，空格连接多顶点 */
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
      <!-- 底部基线，非数据 -->
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
