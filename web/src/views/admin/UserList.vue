<script setup lang="ts">
/**
 * 管理员下属用户：列表、创建、配额、用量图、禁用等；`?role=admin` 时与系统管理入口复用界面。
 */
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import StatBarChart from "@/components/stats/StatBarChart.vue";
import StatKPICard from "@/components/stats/StatKPICard.vue";
import StatLineChart from "@/components/stats/StatLineChart.vue";
import StatPieChart from "@/components/stats/StatPieChart.vue";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { apiFetch } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

/** 管理端用户列表/编辑表单使用的行数据（与 GET /admin/users 项对齐） */
type AdminUser = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  preferredProviderKeyId?: string | null;
  providerKeyId?: string | null;
  allocatedQuota: number | null;
  usedQuota: number | null;
  createdAt?: number;
  updatedAt?: number;
  lastLoginAt?: number | null;
  lastGenerationAt?: number | null;
  generationCount?: number;
};

/** 详情侧栏当前用户的配额概览，供环形进度等展示 */
type QuotaSnapshot = {
  allocatedQuota: number | null;
  usedQuota: number;
  remainingQuota: number | null;
};

/** 额度增减流水，支持游标翻页与表格 */
type QuotaTransaction = {
  id: string;
  delta: number;
  reason: string;
  taskId?: string | null;
  createdAt: number;
};

/** 用量页签：总数 + 分状态/分模式 + 日趋势，供统计图组件 */
type UsageResponse = {
  total: number;
  stats: Array<{ status: string; mode: string; count: number }>;
  trend: Array<{ day: number; count: number }>;
};

/** 本租户 Provider 密钥下拉（创建用户默认绑定、编辑更换） */
type ProviderKeyRow = {
  id: string;
  label: string;
  keyHint: string;
  enabled: boolean;
};

const auth = useAuthStore();
const route = useRoute();
const { locale, t } = useI18n();

/** 当前页用户表与 Provider 密钥（创建/编辑用） */
const users = ref<AdminUser[]>([]);
const keys = ref<ProviderKeyRow[]>([]);
/** 邮箱关键词与账号状态；`role` 仅 sysadmin 在 URL/表单中筛选 admin|user */
const q = ref("");
const status = ref("");
const routeRole =
  route.query.role === "admin" || route.query.role === "user" ? route.query.role : "";
const role = ref<"" | "admin" | "user">(routeRole);
/** 各弹层开关与当前行指针 */
const createOpen = ref(false);
const editOpen = ref(false);
const quotaOpen = ref(false);
const passwordOpen = ref(false);
const selectedUser = ref<AdminUser | null>(null);
const editingUser = ref<AdminUser | null>(null);
const passwordUser = ref<AdminUser | null>(null);
const quota = ref<QuotaSnapshot | null>(null);
const transactions = ref<QuotaTransaction[]>([]);
const transactionsNextCursor = ref<number | null>(null);
const usage = ref<UsageResponse | null>(null);
const quotaAmount = ref(10);
const form = ref(defaultCreateForm());
const editForm = ref(defaultEditForm());
const passwordForm = ref({ password: "", confirmPassword: "" });

/** 当前操作人（多为自己）剩余可划拨额度，用于 `grantQuota` 上限提示 */
const actorRemaining = computed(() => auth.quota?.remainingQuota ?? null);
/** 已用/分配 的百分比，仅在 allocatedQuota 有值时有效 */
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

/** 按当前筛选拉取用户表 */
async function load() {
  const params = new URLSearchParams();
  if (q.value) params.set("q", q.value);
  if (status.value) params.set("status", status.value);
  if (auth.isSysadmin && role.value) params.set("role", role.value);
  const body = await apiFetch<{ items: AdminUser[] }>(
    `/admin/users${params.size ? `?${params.toString()}` : ""}`
  );
  users.value = body.items;
}

/** 拉取 Provider 密钥；创建表单的默认 `providerKeyId` 取首条 */
async function loadKeys() {
  const body = await apiFetch<{ items: ProviderKeyRow[] }>("/admin/provider-keys");
  keys.value = body.items;
  if (!form.value.providerKeyId && keys.value.length) {
    form.value.providerKeyId = keys.value[0].id;
  }
}

/** 新建用户初始值；`quota` 为初始分配、username/email 在表单填写 */
function defaultCreateForm() {
  return {
    role: "user" as "admin" | "user",
    username: "",
    nickname: "",
    password: "",
    email: "",
    providerKeyId: keys.value[0]?.id ?? "",
    quota: 10
  };
}

/** 编辑用户：可改昵称/状态/绑定的 key/总配额/密码（密码非空才提交） */
function defaultEditForm() {
  return {
    nickname: "",
    status: "active" as "active" | "disabled",
    providerKeyId: "",
    quota: 0 as number | null,
    password: ""
  };
}

/** 打开创建弹层并确保 keys 已加载供下拉使用 */
function openCreateDialog() {
  form.value = defaultCreateForm();
  createOpen.value = true;
  if (!keys.value.length) void loadKeys();
}

/** POST 创建后 toast、关弹层、刷新表 */
async function createUser() {
  await apiFetch("/admin/users", { method: "POST", body: JSON.stringify(form.value) });
  toast.success(
    form.value.role === "admin" ? t("adminUsers.adminCreated") : t("adminUsers.userCreated")
  );
  createOpen.value = false;
  form.value = defaultCreateForm();
  await load();
}

/** 将行数据灌入 `editForm` 并拉 keys（若空） */
function openEditDialog(user: AdminUser) {
  editingUser.value = user;
  editForm.value = {
    nickname: user.nickname,
    status: user.status,
    providerKeyId: user.providerKeyId ?? user.preferredProviderKeyId ?? "",
    quota: user.allocatedQuota,
    password: ""
  };
  editOpen.value = true;
  if (!keys.value.length) void loadKeys();
}

/** 仅提交与初始行有差异的字段，空 diff 则直接关层 */
async function saveEdit() {
  if (!editingUser.value) return;
  const payload: {
    nickname?: string;
    status?: "active" | "disabled";
    providerKeyId?: string;
    quota?: number | null;
    password?: string;
  } = {};
  if (editForm.value.nickname !== editingUser.value.nickname) {
    payload.nickname = editForm.value.nickname;
  }
  if (editForm.value.status !== editingUser.value.status) payload.status = editForm.value.status;
  // API 上 preferred 与 providerKeyId 可能只回其一，比较时要归一成同一字段语义
  const currentProviderKeyId =
    editingUser.value.providerKeyId ?? editingUser.value.preferredProviderKeyId ?? "";
  if (editForm.value.providerKeyId && editForm.value.providerKeyId !== currentProviderKeyId) {
    payload.providerKeyId = editForm.value.providerKeyId;
  }
  if (editForm.value.quota !== editingUser.value.allocatedQuota) {
    payload.quota = editForm.value.quota;
  }
  if (editForm.value.password) payload.password = editForm.value.password;
  if (!Object.keys(payload).length) {
    editOpen.value = false;
    return;
  }
  await apiFetch(`/admin/users/${editingUser.value.id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  toast.success(t("adminUsers.userUpdated"));
  editOpen.value = false;
  editingUser.value = null;
  await load();
}

/** 选中详情用户并并行拉「配额+流水+用量图」；流水游标会重置 */
async function openDetails(user: AdminUser) {
  selectedUser.value = user;
  transactions.value = [];
  transactionsNextCursor.value = null;
  await Promise.all([loadQuota(user.id), loadUsage(user.id)]);
}

/** 分页加载额度交易；`transactionsNextCursor` 非空时追加分页 */
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

/** 生图/任务维度的统计供饼/柱/线三图 */
async function loadUsage(userId = selectedUser.value?.id) {
  if (!userId) return;
  usage.value = await apiFetch<UsageResponse>(`/admin/users/${userId}/usage`);
}

/**
 * 给选中用户**追加**一笔额度；扣减的是当前登录管理员剩余池（`actorRemaining`）
 * 成功后刷新本页列表与 auth 自身 quota
 */
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

/** 列表行内快速启停账号；若当前侧栏正在看该用户则同步本地 `selectedUser.status` */
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

/** 超管/管理员在列表行内重置子账号密码 */
function openPasswordDialog(user: AdminUser) {
  passwordUser.value = user;
  passwordForm.value = { password: "", confirmPassword: "" };
  passwordOpen.value = true;
}

/** 两次输入一致时 POST 专用改密端点 */
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

/** 打开「追加额度」弹层；若切到不同用户会触发 `openDetails` 以刷新 quota 区 */
function openQuotaDialog(user: AdminUser) {
  const previousUserId = selectedUser.value?.id;
  selectedUser.value = user;
  quotaAmount.value = 10;
  quotaOpen.value = true;
  if (!quota.value || previousUserId !== user.id) openDetails(user);
}

/** 将 usage.stats 按状态或生图模式聚合成 {label,value}[] 供饼/柱 */
function aggregateUsage(key: "status" | "mode") {
  const map = new Map<string, number>();
  for (const row of usage.value?.stats ?? []) {
    const label = key === "status" ? statusLabel(row[key]) : modeLabel(row[key]);
    map.set(label, (map.get(label) ?? 0) + row.count);
  }
  return Array.from(map, ([label, value]) => ({ label, value }));
}

/** 将后端状态枚举映射为 i18n 可读文案 */
function statusLabel(status: string) {
  if (status === "active") return t("common.enabled");
  if (status === "disabled") return t("common.disabled");
  if (status === "succeeded") return t("common.succeeded");
  if (status === "failed") return t("common.failed");
  if (status === "running") return t("common.running");
  if (status === "queued") return t("common.queued");
  return status;
}

/** 角色列展示用（与 `role` 筛选值对应） */
function roleLabel(value: string) {
  if (value === "admin") return t("adminUsers.roleAdmin");
  if (value === "user") return t("adminUsers.roleUser");
  return value;
}

/** 列表与详情中时间戳的本地化展示 */
function formatDateTime(value?: number | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale.value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

/** Provider 下拉里展示「标签 (hint)」，找不到时退回原始 id */
function keyLabel(id?: string | null) {
  if (!id) return t("sysadmin.unassigned");
  const key = keys.value.find((item) => item.id === id);
  return key ? `${key.label} (${key.keyHint})` : id;
}

/** 生图三模式在用量图里显示为工作台同款文案 */
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
        <select
          v-if="auth.isSysadmin"
          v-model="role"
          class="ui-field h-10 !w-full px-3 text-sm sm:!w-40"
          @change="load"
        >
          <option value="">{{ t("adminUsers.allRoles") }}</option>
          <option value="user">{{ t("adminUsers.roleUser") }}</option>
          <option value="admin">{{ t("adminUsers.roleAdmin") }}</option>
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
          <table class="w-full min-w-[78rem] border-collapse text-sm">
            <thead class="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
              <tr>
                <th class="p-3">{{ t("adminUsers.user") }}</th>
                <th class="p-3">{{ t("adminUsers.role") }}</th>
                <th class="p-3">{{ t("common.quota") }}</th>
                <th class="p-3">{{ t("adminUsers.lastLoginAt") }}</th>
                <th class="p-3">{{ t("adminUsers.lastGenerationAt") }}</th>
                <th class="p-3">{{ t("adminUsers.status") }}</th>
                <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!users.length" class="border-t border-border">
                <td class="p-6 text-center text-muted-foreground" colspan="7">
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
                    <p class="truncate text-xs text-muted-foreground">
                      {{ t("history.createdAt") }} {{ formatDateTime(user.createdAt) }}
                    </p>
                  </button>
                </td>
                <td class="p-3">{{ roleLabel(user.role) }}</td>
                <td class="p-3">{{ user.usedQuota ?? 0 }} / {{ user.allocatedQuota ?? "∞" }}</td>
                <td class="p-3 text-muted-foreground">{{ formatDateTime(user.lastLoginAt) }}</td>
                <td class="p-3">
                  <p class="text-muted-foreground">{{ formatDateTime(user.lastGenerationAt) }}</p>
                  <p class="font-mono text-xs text-muted-foreground">
                    {{ t("adminUsers.generationCount", { count: user.generationCount ?? 0 }) }}
                  </p>
                </td>
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
                      v-if="auth.isSysadmin"
                      class="ui-button ui-button-secondary h-8 text-xs"
                      type="button"
                      @click="openEditDialog(user)"
                    >
                      {{ t("sysadmin.edit") }}
                    </button>
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
          <div class="mt-3 grid gap-2 text-xs text-muted-foreground">
            <p>{{ t("adminUsers.role") }}: {{ roleLabel(selectedUser.role) }}</p>
            <p>{{ t("adminUsers.lastLoginAt") }}: {{ formatDateTime(selectedUser.lastLoginAt) }}</p>
            <p>
              {{ t("adminUsers.lastGenerationAt") }}:
              {{ formatDateTime(selectedUser.lastGenerationAt) }}
            </p>
            <p v-if="auth.isSysadmin">
              {{ t("sysadmin.providerKey") }}:
              {{ keyLabel(selectedUser.providerKeyId ?? selectedUser.preferredProviderKeyId) }}
            </p>
          </div>
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

    <Dialog v-model:open="createOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t("adminUsers.createUser") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" @submit.prevent="createUser">
          <label v-if="auth.isSysadmin" class="block text-sm font-medium">
            <span>{{ t("adminUsers.role") }}</span>
            <select v-model="form.role" class="ui-field mt-1.5 h-10 px-3">
              <option value="user">{{ t("adminUsers.roleUser") }}</option>
              <option value="admin">{{ t("adminUsers.roleAdmin") }}</option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("auth.usernameForLogin") }}</span>
            <input v-model="form.username" class="ui-field mt-1.5 h-10 px-3" required />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("auth.nicknameForDisplay") }}</span>
            <input v-model="form.nickname" class="ui-field mt-1.5 h-10 px-3" required />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("auth.password") }}</span>
            <input
              v-model="form.password"
              class="ui-field mt-1.5 h-10 px-3"
              minlength="8"
              required
              type="password"
            />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("auth.emailOptional") }}</span>
            <input v-model="form.email" class="ui-field mt-1.5 h-10 px-3" type="email" />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("sysadmin.providerKey") }}</span>
            <select
              v-model="form.providerKeyId"
              class="ui-field mt-1.5 h-10 px-3"
              :required="form.role === 'admin'"
            >
              <option value="">{{ t("sysadmin.selectKey") }}</option>
              <option v-for="key in keys" :key="key.id" :value="key.id">
                {{ key.label }} ({{ key.keyHint }})
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("adminUsers.initialQuota") }}</span>
            <input v-model.number="form.quota" class="ui-field mt-1.5 h-10 px-3" type="number" />
          </label>
          <DialogFooter class="mt-1">
            <DialogClose as-child>
              <button class="ui-button ui-button-secondary" type="button">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit">
              {{ t("common.create") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="editOpen">
      <DialogContent v-if="editingUser" class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t("adminUsers.editUser") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" @submit.prevent="saveEdit">
          <p class="text-sm text-muted-foreground">
            {{ editingUser.username }} · {{ roleLabel(editingUser.role) }}
          </p>
          <label class="block text-sm font-medium">
            <span>{{ t("auth.nicknameForDisplay") }}</span>
            <input v-model="editForm.nickname" class="ui-field mt-1.5 h-10 px-3" required />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("adminUsers.status") }}</span>
            <select v-model="editForm.status" class="ui-field mt-1.5 h-10 px-3">
              <option value="active">{{ t("common.enabled") }}</option>
              <option value="disabled">{{ t("common.disabled") }}</option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("sysadmin.providerKey") }}</span>
            <select v-model="editForm.providerKeyId" class="ui-field mt-1.5 h-10 px-3">
              <option value="">{{ t("sysadmin.keepUnassigned") }}</option>
              <option v-for="key in keys" :key="key.id" :value="key.id">
                {{ key.label }} ({{ key.keyHint }})
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("sysadmin.totalQuota") }}</span>
            <input
              v-model.number="editForm.quota"
              class="ui-field mt-1.5 h-10 px-3"
              min="0"
              type="number"
            />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("sysadmin.passwordOptional") }}</span>
            <input
              v-model="editForm.password"
              class="ui-field mt-1.5 h-10 px-3"
              minlength="8"
              type="password"
            />
          </label>
          <DialogFooter class="mt-1">
            <DialogClose as-child>
              <button class="ui-button ui-button-secondary" type="button">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit">
              {{ t("common.save") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="quotaOpen">
      <DialogContent v-if="selectedUser" class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{{ t("adminUsers.adjustQuota") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" @submit.prevent="grantQuota">
          <p class="text-sm text-muted-foreground">
            {{
              t("adminUsers.ownRemaining", {
                value: actorRemaining === null ? t("common.unlimited") : actorRemaining
              })
            }}
          </p>
          <label class="block text-sm font-medium">
            <span>{{ t("adminUsers.quotaAmount") }}</span>
            <input
              v-model.number="quotaAmount"
              class="ui-field mt-1.5 h-10 px-3"
              min="1"
              type="number"
            />
          </label>
          <DialogFooter class="mt-1">
            <DialogClose as-child>
              <button class="ui-button ui-button-secondary" type="button">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit">
              {{ t("adminUsers.confirm") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="passwordOpen">
      <DialogContent v-if="passwordUser" class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{{ t("adminUsers.resetPassword") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" @submit.prevent="resetPassword">
          <p class="text-sm text-muted-foreground">
            {{ passwordUser.nickname }} · {{ passwordUser.username }}
          </p>
          <label class="block text-sm font-medium">
            <span>{{ t("settings.newPassword") }}</span>
            <input
              v-model="passwordForm.password"
              class="ui-field mt-1.5 h-10 px-3"
              minlength="8"
              required
              type="password"
            />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("adminUsers.confirmNewPassword") }}</span>
            <input
              v-model="passwordForm.confirmPassword"
              class="ui-field mt-1.5 h-10 px-3"
              minlength="8"
              required
              type="password"
            />
          </label>
          <DialogFooter class="mt-1">
            <DialogClose as-child>
              <button class="ui-button ui-button-secondary" type="button">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit">
              {{ t("common.save") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AppShell>
</template>
