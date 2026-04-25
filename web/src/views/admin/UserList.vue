<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import StatBarChart from "@/components/stats/StatBarChart.vue";
import StatKPICard from "@/components/stats/StatKPICard.vue";
import StatLineChart from "@/components/stats/StatLineChart.vue";
import StatPieChart from "@/components/stats/StatPieChart.vue";
import { apiFetch } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

type AdminUser = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  status: "active" | "disabled";
  allocatedQuota: number | null;
  usedQuota: number | null;
  createdAt?: number;
};

type QuotaSnapshot = {
  allocatedQuota: number | null;
  usedQuota: number;
  remainingQuota: number | null;
};

type QuotaTransaction = {
  id: string;
  delta: number;
  reason: string;
  taskId?: string | null;
  createdAt: number;
};

type UsageResponse = {
  total: number;
  stats: Array<{ status: string; mode: string; count: number }>;
  trend: Array<{ day: number; count: number }>;
};

const auth = useAuthStore();
const users = ref<AdminUser[]>([]);
const q = ref("");
const status = ref("");
const createOpen = ref(false);
const quotaOpen = ref(false);
const selectedUser = ref<AdminUser | null>(null);
const quota = ref<QuotaSnapshot | null>(null);
const transactions = ref<QuotaTransaction[]>([]);
const transactionsNextCursor = ref<number | null>(null);
const usage = ref<UsageResponse | null>(null);
const quotaAmount = ref(10);
const form = ref({ email: "", password: "password123", nickname: "", quota: 10 });

const actorRemaining = computed(() => auth.quota?.remainingQuota ?? null);
const quotaPercent = computed(() => {
  if (!quota.value?.allocatedQuota) return 0;
  return Math.min(100, Math.round((quota.value.usedQuota / quota.value.allocatedQuota) * 100));
});
const statusItems = computed(() => aggregateUsage("status"));
const modeItems = computed(() => aggregateUsage("mode"));
const trendPoints = computed(
  () =>
    usage.value?.trend.map((point) => ({
      label: String(point.day),
      value: point.count
    })) ?? []
);

async function load() {
  const params = new URLSearchParams();
  if (q.value) params.set("q", q.value);
  if (status.value) params.set("status", status.value);
  const body = await apiFetch<{ items: AdminUser[] }>(
    `/admin/users${params.size ? `?${params.toString()}` : ""}`
  );
  users.value = body.items;
}

async function createUser() {
  await apiFetch("/admin/users", { method: "POST", body: JSON.stringify(form.value) });
  toast.success("用户已创建");
  createOpen.value = false;
  form.value = { email: "", password: "password123", nickname: "", quota: 10 };
  await load();
}

async function openDetails(user: AdminUser) {
  selectedUser.value = user;
  transactions.value = [];
  transactionsNextCursor.value = null;
  await Promise.all([loadQuota(user.id), loadUsage(user.id)]);
}

async function loadQuota(userId = selectedUser.value?.id) {
  if (!userId) return;
  const params = new URLSearchParams({ limit: "10" });
  if (transactionsNextCursor.value) params.set("cursor", String(transactionsNextCursor.value));
  const body = await apiFetch<{
    quota: QuotaSnapshot;
    transactions: QuotaTransaction[];
    nextCursor: number | null;
  }>(`/admin/users/${userId}/quota?${params.toString()}`);
  quota.value = body.quota;
  transactions.value = [...transactions.value, ...body.transactions];
  transactionsNextCursor.value = body.nextCursor;
}

async function loadUsage(userId = selectedUser.value?.id) {
  if (!userId) return;
  usage.value = await apiFetch<UsageResponse>(`/admin/users/${userId}/usage`);
}

async function grantQuota() {
  if (!selectedUser.value) return;
  if (actorRemaining.value !== null && quotaAmount.value > actorRemaining.value) {
    toast.error("不能超过自身剩余配额");
    return;
  }
  await apiFetch(`/admin/users/${selectedUser.value.id}/quota`, {
    method: "POST",
    body: JSON.stringify({ amount: quotaAmount.value })
  });
  toast.success("配额已调整");
  quotaOpen.value = false;
  transactions.value = [];
  transactionsNextCursor.value = null;
  await Promise.all([load(), loadQuota(), auth.bootstrap()]);
}

async function toggleStatus(user: AdminUser) {
  const nextStatus = user.status === "active" ? "disabled" : "active";
  await apiFetch(`/admin/users/${user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: nextStatus })
  });
  toast.success(nextStatus === "active" ? "用户已启用" : "用户已禁用");
  await load();
  if (selectedUser.value?.id === user.id) selectedUser.value.status = nextStatus;
}

async function resendInvite(user: AdminUser) {
  await apiFetch(`/admin/users/${user.id}/invite`, { method: "POST" });
  toast.success("邀请邮件已发送");
}

function openQuotaDialog(user: AdminUser) {
  selectedUser.value = user;
  quotaAmount.value = 10;
  quotaOpen.value = true;
  if (!quota.value || selectedUser.value.id !== user.id) openDetails(user);
}

function aggregateUsage(key: "status" | "mode") {
  const map = new Map<string, number>();
  for (const row of usage.value?.stats ?? []) {
    map.set(row[key], (map.get(row[key]) ?? 0) + row.count);
  }
  return Array.from(map, ([label, value]) => ({ label, value }));
}

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">用户管理</h1>
      <div class="flex flex-wrap gap-2">
        <select v-model="status" class="ui-field h-10 w-32 px-3 text-sm" @change="load">
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="disabled">禁用</option>
        </select>
        <input
          v-model="q"
          class="ui-field h-10 w-64 px-3"
          placeholder="搜索邮箱"
          @keyup.enter="load"
        />
        <button class="ui-button ui-button-secondary" type="button" @click="load">搜索</button>
        <button class="ui-button ui-button-primary" type="button" @click="createOpen = true">
          创建用户
        </button>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div class="panel overflow-hidden">
        <table class="w-full border-collapse text-sm">
          <thead class="bg-muted text-left text-muted-foreground">
            <tr>
              <th class="p-3">用户</th>
              <th class="p-3">角色</th>
              <th class="p-3">配额</th>
              <th class="p-3">状态</th>
              <th class="p-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-t border-border">
              <td class="p-3">
                <button class="text-left" type="button" @click="openDetails(user)">
                  <p class="font-medium">{{ user.nickname }}</p>
                  <p class="text-xs text-muted-foreground">{{ user.email }}</p>
                </button>
              </td>
              <td class="p-3">{{ user.role }}</td>
              <td class="p-3">{{ user.usedQuota ?? 0 }} / {{ user.allocatedQuota ?? "∞" }}</td>
              <td class="p-3">
                <span
                  class="rounded-full px-2 py-1 text-xs"
                  :class="
                    user.status === 'active'
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ user.status === "active" ? "启用" : "禁用" }}
                </span>
              </td>
              <td class="space-x-2 p-3 text-right">
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="openQuotaDialog(user)"
                >
                  改配额
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="toggleStatus(user)"
                >
                  {{ user.status === "active" ? "禁用" : "启用" }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="resendInvite(user)"
                >
                  重发邀请
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <aside v-if="selectedUser" class="panel space-y-4 p-4">
        <div>
          <p class="text-xs text-muted-foreground">用户详情</p>
          <h2 class="mt-1 text-lg font-semibold">{{ selectedUser.nickname }}</h2>
          <p class="truncate text-sm text-muted-foreground">{{ selectedUser.email }}</p>
        </div>
        <div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-muted-foreground">配额使用</span>
            <span>{{ quota?.usedQuota ?? 0 }} / {{ quota?.allocatedQuota ?? "∞" }}</span>
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary"
              :style="{ width: `${quotaPercent}%` }"
            ></div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <StatKPICard label="任务数" :value="usage?.total ?? 0" />
          <StatKPICard label="剩余配额" :value="quota?.remainingQuota ?? '∞'" />
        </div>
        <StatPieChart title="状态占比" :items="statusItems" />
        <StatBarChart title="模式占比" :items="modeItems" />
        <StatLineChart title="30 日趋势" :points="trendPoints" />
        <div>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold">配额流水</h3>
            <button
              v-if="transactionsNextCursor"
              class="ui-button ui-button-secondary h-8 text-xs"
              type="button"
              @click="loadQuota()"
            >
              更多
            </button>
          </div>
          <div class="max-h-56 overflow-auto rounded-lg border border-border">
            <table class="w-full text-xs">
              <tbody>
                <tr v-for="tx in transactions" :key="tx.id" class="border-b border-border">
                  <td class="p-2">{{ tx.reason }}</td>
                  <td class="p-2 text-right font-mono">
                    {{ tx.delta > 0 ? "+" : "" }}{{ tx.delta }}
                  </td>
                  <td class="p-2 text-right text-muted-foreground">
                    {{ new Date(tx.createdAt).toLocaleDateString() }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </aside>
    </div>

    <div
      v-if="createOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="createOpen = false"
    >
      <form class="panel w-full max-w-md space-y-3 p-5" @submit.prevent="createUser">
        <h2 class="font-semibold">创建用户</h2>
        <input v-model="form.email" class="ui-field h-10 px-3" placeholder="邮箱" />
        <input v-model="form.nickname" class="ui-field h-10 px-3" placeholder="昵称" />
        <input
          v-model="form.password"
          class="ui-field h-10 px-3"
          placeholder="密码"
          type="password"
        />
        <input
          v-model.number="form.quota"
          class="ui-field h-10 px-3"
          placeholder="初始配额"
          type="number"
        />
        <button class="ui-button ui-button-primary w-full" type="submit">创建</button>
      </form>
    </div>

    <div
      v-if="quotaOpen && selectedUser"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="quotaOpen = false"
    >
      <form class="panel w-full max-w-sm space-y-3 p-5" @submit.prevent="grantQuota">
        <h2 class="font-semibold">调整配额</h2>
        <p class="text-sm text-muted-foreground">
          自身剩余: {{ actorRemaining === null ? "无限" : actorRemaining }}
        </p>
        <input v-model.number="quotaAmount" class="ui-field h-10 px-3" min="1" type="number" />
        <button class="ui-button ui-button-primary w-full" type="submit">确认</button>
      </form>
    </div>
  </AppShell>
</template>
