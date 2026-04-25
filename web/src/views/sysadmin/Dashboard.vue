<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
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
const { t } = useI18n();
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
    stats.value?.taskCounts.map((row) => ({ label: statusLabel(row.status), value: row.count })) ??
    []
);
const providerItems = computed(
  () =>
    stats.value?.providerCounts.map((row) => ({
      label: row.name ?? t("sysadmin.unbound"),
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

function statusLabel(status?: string) {
  if (status === "succeeded") return t("common.succeeded");
  if (status === "failed") return t("common.failed");
  if (status === "running") return t("common.running");
  if (status === "queued") return t("common.queued");
  return status ?? "unknown";
}

onMounted(async () => {
  stats.value = await apiFetch<DashboardStats>("/sysadmin/dashboard/stats");
});
</script>

<template>
  <AppShell>
    <h1 class="mb-4 text-xl font-semibold">{{ t("sysadmin.dashboardTitle") }}</h1>
    <div class="grid gap-3 md:grid-cols-4">
      <StatKPICard :label="t('sysadmin.usersCount')" :value="userTotal" />
      <StatKPICard :label="t('sysadmin.tasksCount')" :value="taskTotal" />
      <StatKPICard :label="t('sysadmin.successRate')" :value="successRate" />
      <StatKPICard :label="t('sysadmin.providersCount')" :value="providerItems.length" />
    </div>
    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      <StatPieChart :title="t('sysadmin.userDistribution')" :items="userItems" />
      <StatPieChart :title="t('sysadmin.providerShare')" :items="providerItems" />
      <StatBarChart :title="t('sysadmin.taskStatus')" :items="taskItems" />
      <StatLineChart :title="t('sysadmin.taskTrend')" :points="trendPoints" />
    </div>
    <div class="panel mt-4 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted text-left text-muted-foreground">
          <tr>
            <th class="p-3">{{ t("sysadmin.topUsers") }}</th>
            <th class="p-3">{{ t("sysadmin.tasksCount") }}</th>
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
                {{ t("sysadmin.viewSessions") }}
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </AppShell>
</template>
