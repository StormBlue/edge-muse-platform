<script setup lang="ts">
/**
 * 看板 KPI 卡片：无图表库依赖，用于 Dashboard 顶行数字。
 * - `label`：指标名（如用户数）；`value` 已格式化的字符串或数字；
 * - `hint`：可选次要说明（本模板未在父组件传入时可留空）。
 */
defineProps<{
  /** 指标标题，小号浅色 */
  label: string;
  /** 主展示值，大号加粗 */
  value: string | number;
  hint?: string;
}>();
</script>

<template>
  <div class="rounded-lg border border-border bg-card p-4">
    <p class="text-xs text-muted-foreground">{{ label }}</p>
    <p class="mt-2 text-2xl font-semibold">{{ value }}</p>
    <p v-if="hint" class="mt-1 text-xs text-muted-foreground">{{ hint }}</p>
  </div>
</template>
