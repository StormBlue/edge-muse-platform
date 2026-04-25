<script setup lang="ts">
defineProps<{
  label: string;
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
