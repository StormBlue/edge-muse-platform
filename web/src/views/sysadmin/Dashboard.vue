<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

const stats = ref<Record<string, unknown> | null>(null);
onMounted(async () => {
  stats.value = await apiFetch("/sysadmin/dashboard/stats");
});
</script>

<template>
  <AppShell>
    <h1 class="mb-4 text-xl font-semibold">系统看板</h1>
    <div class="grid gap-3 md:grid-cols-4">
      <div class="panel p-4">
        <p class="text-xs text-muted-foreground">用户分布</p>
        <pre class="mt-2 overflow-auto text-xs">{{ stats?.userCounts }}</pre>
      </div>
      <div class="panel p-4">
        <p class="text-xs text-muted-foreground">任务状态</p>
        <pre class="mt-2 overflow-auto text-xs">{{ stats?.taskCounts }}</pre>
      </div>
      <div class="panel p-4 md:col-span-2">
        <p class="text-xs text-muted-foreground">Top 用户</p>
        <pre class="mt-2 overflow-auto text-xs">{{ stats?.topUsers }}</pre>
      </div>
    </div>
  </AppShell>
</template>
