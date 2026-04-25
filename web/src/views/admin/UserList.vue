<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
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
  username: string;
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

type ProviderKeyRow = {
  id: string;
  label: string;
  keyHint: string;
  enabled: boolean;
};

const auth = useAuthStore();
const { locale, t } = useI18n();
const users = ref<AdminUser[]>([]);
const keys = ref<ProviderKeyRow[]>([]);
const q = ref("");
const status = ref("");
const createOpen = ref(false);
const quotaOpen = ref(false);
const passwordOpen = ref(false);
const selectedUser = ref<AdminUser | null>(null);
const passwordUser = ref<AdminUser | null>(null);
const quota = ref<QuotaSnapshot | null>(null);
const transactions = ref<QuotaTransaction[]>([]);
const transactionsNextCursor = ref<number | null>(null);
const usage = ref<UsageResponse | null>(null);
const quotaAmount = ref(10);
const form = ref(defaultCreateForm());
const passwordForm = ref({ password: "", confirmPassword: "" });

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

async function loadKeys() {
  const body = await apiFetch<{ items: ProviderKeyRow[] }>("/admin/provider-keys");
  keys.value = body.items;
  if (!form.value.providerKeyId && keys.value.length) {
    form.value.providerKeyId = keys.value[0].id;
  }
}

function defaultCreateForm() {
  return {
    username: "",
    nickname: "",
    password: "",
    email: "",
    providerKeyId: keys.value[0]?.id ?? "",
    quota: 10
  };
}

function openCreateDialog() {
  form.value = defaultCreateForm();
  createOpen.value = true;
  if (!keys.value.length) void loadKeys();
}

async function createUser() {
  await apiFetch("/admin/users", { method: "POST", body: JSON.stringify(form.value) });
  toast.success(t("adminUsers.userCreated"));
  createOpen.value = false;
  form.value = defaultCreateForm();
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
    toast.error(t("adminUsers.quotaTooLarge"));
    return;
  }
  await apiFetch(`/admin/users/${selectedUser.value.id}/quota`, {
    method: "POST",
    body: JSON.stringify({ amount: quotaAmount.value })
  });
  toast.success(t("adminUsers.quotaAdjusted"));
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
  toast.success(
    nextStatus === "active" ? t("adminUsers.userEnabled") : t("adminUsers.userDisabled")
  );
  await load();
  if (selectedUser.value?.id === user.id) selectedUser.value.status = nextStatus;
}

function openPasswordDialog(user: AdminUser) {
  passwordUser.value = user;
  passwordForm.value = { password: "", confirmPassword: "" };
  passwordOpen.value = true;
}

async function resetPassword() {
  if (!passwordUser.value) return;
  if (passwordForm.value.password !== passwordForm.value.confirmPassword) {
    toast.error(t("adminUsers.passwordMismatch"));
    return;
  }
  await apiFetch(`/admin/users/${passwordUser.value.id}/password`, {
    method: "POST",
    body: JSON.stringify({ password: passwordForm.value.password })
  });
  toast.success(t("adminUsers.passwordResetSuccess"));
  passwordOpen.value = false;
  passwordUser.value = null;
  passwordForm.value = { password: "", confirmPassword: "" };
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
    const label = key === "status" ? statusLabel(row[key]) : modeLabel(row[key]);
    map.set(label, (map.get(label) ?? 0) + row.count);
  }
  return Array.from(map, ([label, value]) => ({ label, value }));
}

function statusLabel(status: string) {
  if (status === "active") return t("common.enabled");
  if (status === "disabled") return t("common.disabled");
  if (status === "succeeded") return t("common.succeeded");
  if (status === "failed") return t("common.failed");
  if (status === "running") return t("common.running");
  if (status === "queued") return t("common.queued");
  return status;
}

function modeLabel(mode: string) {
  if (mode === "text2image") return t("workspace.text2image");
  if (mode === "image2image") return t("workspace.image2image");
  if (mode === "chat") return t("workspace.chat");
  return mode;
}

onMounted(() => {
  void load();
  void loadKeys();
});
</script>

<template>
  <AppShell>
    <div class="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <h1 class="text-xl font-semibold leading-8">{{ t("adminUsers.title") }}</h1>
      <form
        class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end"
        @submit.prevent="load"
      >
        <select v-model="status" class="ui-field h-10 !w-full px-3 text-sm sm:!w-40" @change="load">
          <option value="">{{ t("adminUsers.allStatuses") }}</option>
          <option value="active">{{ t("common.enabled") }}</option>
          <option value="disabled">{{ t("common.disabled") }}</option>
        </select>
        <input
          v-model="q"
          class="ui-field col-span-2 h-10 !w-full px-3 sm:col-span-1 sm:!w-72"
          :placeholder="t('adminUsers.searchEmail')"
        />
        <button class="ui-button ui-button-secondary h-10" type="submit">
          {{ t("common.search") }}
        </button>
        <button class="ui-button ui-button-primary h-10" type="button" @click="openCreateDialog">
          {{ t("adminUsers.createUser") }}
        </button>
      </form>
    </div>

    <div
      class="grid gap-4"
      :class="selectedUser ? 'xl:grid-cols-[minmax(0,1fr)_24rem]' : 'xl:grid-cols-1'"
    >
      <div class="panel overflow-hidden">
        <div class="thin-scrollbar max-h-[calc(100vh-10rem)] overflow-auto">
          <table class="w-full min-w-[56rem] border-collapse text-sm">
            <thead class="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
              <tr>
                <th class="p-3">{{ t("adminUsers.user") }}</th>
                <th class="p-3">{{ t("adminUsers.role") }}</th>
                <th class="p-3">{{ t("common.quota") }}</th>
                <th class="p-3">{{ t("adminUsers.status") }}</th>
                <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!users.length" class="border-t border-border">
                <td class="p-6 text-center text-muted-foreground" colspan="5">
                  {{ t("adminUsers.noUsers") }}
                </td>
              </tr>
              <tr v-for="user in users" :key="user.id" class="border-t border-border">
                <td class="p-3">
                  <button class="max-w-full text-left" type="button" @click="openDetails(user)">
                    <p class="truncate font-medium">{{ user.nickname }}</p>
                    <p class="truncate text-xs text-muted-foreground">
                      {{ user.username }} · {{ user.email }}
                    </p>
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
                    {{ user.status === "active" ? t("common.enabled") : t("common.disabled") }}
                  </span>
                </td>
                <td class="p-3">
                  <div class="flex flex-wrap justify-end gap-2">
                    <button
                      class="ui-button ui-button-secondary h-8 text-xs"
                      type="button"
                      @click="openQuotaDialog(user)"
                    >
                      {{ t("adminUsers.changeQuota") }}
                    </button>
                    <button
                      class="ui-button ui-button-secondary h-8 text-xs"
                      type="button"
                      @click="toggleStatus(user)"
                    >
                      {{ user.status === "active" ? t("common.disabled") : t("common.enabled") }}
                    </button>
                    <button
                      class="ui-button ui-button-secondary h-8 text-xs"
                      type="button"
                      @click="openPasswordDialog(user)"
                    >
                      {{ t("adminUsers.resetPassword") }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside
        v-if="selectedUser"
        class="panel thin-scrollbar flex max-h-[calc(100vh-10rem)] flex-col gap-4 overflow-auto p-4 xl:sticky xl:top-20 xl:self-start"
      >
        <div>
          <p class="text-xs text-muted-foreground">{{ t("adminUsers.details") }}</p>
          <h2 class="mt-1 text-lg font-semibold">{{ selectedUser.nickname }}</h2>
          <p class="truncate text-sm text-muted-foreground">
            {{ selectedUser.username }} · {{ selectedUser.email }}
          </p>
        </div>
        <div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-muted-foreground">{{ t("adminUsers.quotaUsage") }}</span>
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
          <StatKPICard :label="t('adminUsers.taskCount')" :value="usage?.total ?? 0" />
          <StatKPICard
            :label="t('adminUsers.remainingQuota')"
            :value="quota?.remainingQuota ?? '∞'"
          />
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
              @click="loadQuota()"
            >
              {{ t("adminUsers.more") }}
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
                    {{ new Date(tx.createdAt).toLocaleDateString(locale) }}
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
      <form class="panel flex w-full max-w-md flex-col gap-3 p-5" @submit.prevent="createUser">
        <h2 class="font-semibold">{{ t("adminUsers.createUser") }}</h2>
        <input
          v-model="form.username"
          class="ui-field h-10 px-3"
          :placeholder="t('auth.username')"
          required
        />
        <input
          v-model="form.nickname"
          class="ui-field h-10 px-3"
          :placeholder="t('auth.nickname')"
          required
        />
        <input
          v-model="form.password"
          class="ui-field h-10 px-3"
          :placeholder="t('auth.password')"
          minlength="8"
          required
          type="password"
        />
        <input
          v-model="form.email"
          class="ui-field h-10 px-3"
          :placeholder="t('auth.emailOptional')"
          type="email"
        />
        <select v-model="form.providerKeyId" class="ui-field h-10 px-3" required>
          <option value="">{{ t("sysadmin.selectKey") }}</option>
          <option v-for="key in keys" :key="key.id" :value="key.id">
            {{ key.label }} ({{ key.keyHint }})
          </option>
        </select>
        <input
          v-model.number="form.quota"
          class="ui-field h-10 px-3"
          :placeholder="t('adminUsers.quotaAmount')"
          type="number"
        />
        <button class="ui-button ui-button-primary w-full" type="submit">
          {{ t("common.create") }}
        </button>
      </form>
    </div>

    <div
      v-if="quotaOpen && selectedUser"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="quotaOpen = false"
    >
      <form class="panel flex w-full max-w-sm flex-col gap-3 p-5" @submit.prevent="grantQuota">
        <h2 class="font-semibold">{{ t("adminUsers.adjustQuota") }}</h2>
        <p class="text-sm text-muted-foreground">
          {{
            t("adminUsers.ownRemaining", {
              value: actorRemaining === null ? t("common.unlimited") : actorRemaining
            })
          }}
        </p>
        <input v-model.number="quotaAmount" class="ui-field h-10 px-3" min="1" type="number" />
        <button class="ui-button ui-button-primary w-full" type="submit">
          {{ t("adminUsers.confirm") }}
        </button>
      </form>
    </div>

    <div
      v-if="passwordOpen && passwordUser"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="passwordOpen = false"
    >
      <form class="panel flex w-full max-w-sm flex-col gap-3 p-5" @submit.prevent="resetPassword">
        <h2 class="font-semibold">{{ t("adminUsers.resetPassword") }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ passwordUser.nickname }} · {{ passwordUser.username }}
        </p>
        <input
          v-model="passwordForm.password"
          class="ui-field h-10 px-3"
          minlength="8"
          :placeholder="t('settings.newPassword')"
          required
          type="password"
        />
        <input
          v-model="passwordForm.confirmPassword"
          class="ui-field h-10 px-3"
          minlength="8"
          :placeholder="t('adminUsers.confirmNewPassword')"
          required
          type="password"
        />
        <button class="ui-button ui-button-primary w-full" type="submit">
          {{ t("common.save") }}
        </button>
      </form>
    </div>
  </AppShell>
</template>
