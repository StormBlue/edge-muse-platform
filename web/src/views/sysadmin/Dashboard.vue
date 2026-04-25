<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppShell from "@/components/layout/AppShell.vue";
import StatBarChart from "@/components/stats/StatBarChart.vue";
import StatKPICard from "@/components/stats/StatKPICard.vue";
import StatLineChart from "@/components/stats/StatLineChart.vue";
import StatPieChart from "@/components/stats/StatPieChart.vue";
import { apiFetch } from "@/api/client";

type CountRow = { count: number; role?: string; status?: string; name?: string | null };
type TrendRow = { day: number; count: number };
type TopUser = { id: string; email: string; nickname: string; task_count: number };
type DashboardStats = {
  userCounts: CountRow[];
  taskCounts: CountRow[];
  providerCounts: CountRow[];
  trend: TrendRow[];
  topUsers: TopUser[];
};

const stats = ref<DashboardStats | null>(null);
const userTotal = computed(() => sum(stats.value?.userCounts));
const taskTotal = computed(() => sum(stats.value?.taskCounts));
const successCount = computed(
  () => stats.value?.taskCounts.find((row) => row.status === "succeeded")?.count ?? 0
);
const successRate = computed(() =>
  taskTotal.value ? `${Math.round((successCount.value / taskTotal.value) * 100)}%` : "0%"
);
const userItems = computed(
  () =>
    stats.value?.userCounts.map((row) => ({ label: row.role ?? "unknown", value: row.count })) ?? []
);
const taskItems = computed(
  () =>
    stats.value?.taskCounts.map((row) => ({ label: row.status ?? "unknown", value: row.count })) ??
    []
);
const providerItems = computed(
  () =>
    stats.value?.providerCounts.map((row) => ({
      label: row.name ?? "未绑定",
      value: row.count
    })) ?? []
);
const trendPoints = computed(
  () =>
    stats.value?.trend.map((row) => ({
      label: String(row.day),
      value: row.count
    })) ?? []
);

function sum(rows?: CountRow[]) {
  return rows?.reduce((total, row) => total + row.count, 0) ?? 0;
}

onMounted(async () => {
  stats.value = await apiFetch<DashboardStats>("/sysadmin/dashboard/stats");
});
</script>

<template>
  <AppShell>
    <h1 class="mb-4 text-xl font-semibold">系统看板</h1>
    <div class="grid gap-3 md:grid-cols-4">
      <StatKPICard label="用户数" :value="userTotal" />
      <StatKPICard label="任务数" :value="taskTotal" />
      <StatKPICard label="成功率" :value="successRate" />
      <StatKPICard label="服务商数" :value="providerItems.length" />
    </div>
    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      <StatPieChart title="用户分布" :items="userItems" />
      <StatPieChart title="服务商占比" :items="providerItems" />
      <StatBarChart title="任务状态" :items="taskItems" />
      <StatLineChart title="30 日任务趋势" :points="trendPoints" />
    </div>
    <div class="panel mt-4 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted text-left text-muted-foreground">
          <tr>
            <th class="p-3">Top 用户</th>
            <th class="p-3">任务数</th>
            <th class="p-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in stats?.topUsers ?? []" :key="user.id" class="border-t border-border">
            <td class="p-3">
              <p class="font-medium">{{ user.nickname }}</p>
              <p class="text-xs text-muted-foreground">{{ user.email }}</p>
            </td>
            <td class="p-3 font-mono">{{ user.task_count }}</td>
            <td class="p-3 text-right">
              <RouterLink
                class="ui-button ui-button-secondary h-8 text-xs"
                :to="`/sysadmin/users/${user.id}/sessions`"
              >
                查看会话
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </AppShell>
</template>
