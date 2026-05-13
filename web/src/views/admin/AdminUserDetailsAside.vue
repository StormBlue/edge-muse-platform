<script setup lang="ts">
import { useI18n } from "vue-i18n";
import StatBarChart from "@/components/stats/StatBarChart.vue";
import StatKPICard from "@/components/stats/StatKPICard.vue";
import StatLineChart from "@/components/stats/StatLineChart.vue";
import StatPieChart from "@/components/stats/StatPieChart.vue";
import type { AdminUser, QuotaSnapshot, QuotaTransaction } from "./adminUserTypes";

type ChartItem = { label: string; value: number };
type TrendPoint = { label: string; value: number };

/** 用户详情侧栏只做展示和“加载更多”事件上抛，所有写操作仍留在父控制器中。 */
defineProps<{
  selectedUser: AdminUser;
  isSysadmin: boolean;
  quota: QuotaSnapshot | null;
  quotaPercent: number;
  usageTotal: number;
  statusItems: ChartItem[];
  modeItems: ChartItem[];
  trendPoints: TrendPoint[];
  transactions: QuotaTransaction[];
  transactionsNextCursor: number | null;
  roleLabel: (value: string) => string;
  formatDateTime: (value?: number | null) => string;
  groupLabel: (id?: string | null, name?: string | null) => string;
}>();

const emit = defineEmits<{
  (event: "load-more-quota"): void;
}>();

const { locale, t } = useI18n();
</script>

<template>
  <aside
    class="panel thin-scrollbar flex max-h-[calc(100vh-10rem)] flex-col gap-4 overflow-auto p-4 xl:sticky xl:top-20 xl:self-start"
  >
    <div>
      <p class="text-xs text-muted-foreground">{{ t("adminUsers.details") }}</p>
      <h2 class="mt-1 text-lg font-semibold">{{ selectedUser.nickname }}</h2>
      <p class="truncate text-sm text-muted-foreground">
        {{ selectedUser.username }} · {{ selectedUser.email }}
      </p>
      <div class="mt-3 grid gap-2 text-xs text-muted-foreground">
        <p>{{ t("adminUsers.role") }}: {{ roleLabel(selectedUser.role) }}</p>
        <p>{{ t("adminUsers.lastLoginAt") }}: {{ formatDateTime(selectedUser.lastLoginAt) }}</p>
        <p>
          {{ t("adminUsers.lastGenerationAt") }}:
          {{ formatDateTime(selectedUser.lastGenerationAt) }}
        </p>
        <p v-if="isSysadmin">
          {{ t("sysadmin.providerKeyGroup") }}:
          {{ groupLabel(selectedUser.providerKeyGroupId, selectedUser.providerKeyGroupName) }}
        </p>
        <p>
          {{ t("adminUsers.maxConcurrentTasks") }}:
          {{ selectedUser.maxConcurrentTasks ?? (selectedUser.role === "admin" ? 10 : 5) }}
        </p>
      </div>
    </div>

    <div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-muted-foreground">{{ t("adminUsers.quotaUsage") }}</span>
        <span>{{ quota?.usedQuota ?? 0 }} / {{ quota?.allocatedQuota ?? "∞" }}</span>
      </div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div class="h-full rounded-full bg-primary" :style="{ width: `${quotaPercent}%` }"></div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <StatKPICard :label="t('adminUsers.taskCount')" :value="usageTotal" />
      <StatKPICard :label="t('adminUsers.remainingQuota')" :value="quota?.remainingQuota ?? '∞'" />
    </div>

    <StatPieChart :title="t('adminUsers.statusShare')" :items="statusItems" />
    <StatBarChart :title="t('adminUsers.modeShare')" :items="modeItems" />
    <StatLineChart :title="t('adminUsers.thirtyDayTrend')" :points="trendPoints" />

    <div>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-semibold">{{ t("adminUsers.quotaLedger") }}</h3>
        <button
          v-if="transactionsNextCursor"
          class="ui-button ui-button-secondary h-8 text-xs"
          type="button"
          @click="emit('load-more-quota')"
        >
          {{ t("adminUsers.more") }}
        </button>
      </div>
      <div class="max-h-56 overflow-auto rounded-lg border border-border">
        <table class="w-full text-xs">
          <tbody>
            <tr v-for="tx in transactions" :key="tx.id" class="border-b border-border">
              <td class="p-2">{{ tx.reason }}</td>
              <td class="p-2 text-right font-mono">{{ tx.delta > 0 ? "+" : "" }}{{ tx.delta }}</td>
              <td class="p-2 text-right text-muted-foreground">
                {{ new Date(tx.createdAt).toLocaleDateString(locale) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </aside>
</template>
