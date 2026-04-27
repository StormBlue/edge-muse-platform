import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import {
  isSameStringQuery,
  queryPositiveInt,
  queryString,
  type StringQuery
} from "@/lib/routeQuery";
import { useAuthStore } from "@/stores/auth";
import {
  aggregateAdminUsage,
  createDefaultAdminEditForm,
  createDefaultAdminPasswordForm,
  createDefaultAdminUserForm,
  formatAdminUserDateTime,
  providerKeyDisplayLabel
} from "./adminUserHelpers";
import type {
  AdminUser,
  ProviderKeyRow,
  QuotaSnapshot,
  QuotaTransaction,
  UsageResponse
} from "./adminUserTypes";

export function useAdminUsersController() {
  const auth = useAuthStore();
  const route = useRoute();
  const router = useRouter();
  const { locale, t } = useI18n();

  const users = ref<AdminUser[]>([]);
  const keys = ref<ProviderKeyRow[]>([]);
  const q = ref(queryString(route.query.q).trim());
  const status = ref<"" | "active" | "disabled">(readRouteStatus());
  const role = ref<"" | "admin" | "user">(readRouteRole());
  const createOpen = ref(false);
  const editOpen = ref(false);
  const quotaOpen = ref(false);
  const passwordOpen = ref(false);
  const selectedUser = ref<AdminUser | null>(null);
  const editingUser = ref<AdminUser | null>(null);
  const passwordUser = ref<AdminUser | null>(null);
  const createSaving = ref(false);
  const editSaving = ref(false);
  const quotaSaving = ref(false);
  const passwordSaving = ref(false);
  const quota = ref<QuotaSnapshot | null>(null);
  const transactions = ref<QuotaTransaction[]>([]);
  const transactionsNextCursor = ref<number | null>(null);
  const usage = ref<UsageResponse | null>(null);
  const quotaAmount = ref(10);
  const form = ref(createDefaultAdminUserForm());
  const editForm = ref(createDefaultAdminEditForm());
  const passwordForm = ref(createDefaultAdminPasswordForm());
  const page = ref(readRoutePage());
  const pageInput = ref(String(page.value));
  const pageSize = 20;
  const total = ref(0);
  const loading = ref(false);

  const actorRemaining = computed(() => auth.quota?.remainingQuota ?? null);
  const quotaPercent = computed(() => {
    if (!quota.value?.allocatedQuota) return 0;
    return Math.min(100, Math.round((quota.value.usedQuota / quota.value.allocatedQuota) * 100));
  });
  const statusItems = computed(() => aggregateUsage("status"));
  const modeItems = computed(() => aggregateUsage("mode"));
  const userListOffset = computed(() => (page.value - 1) * pageSize);
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
  const trendPoints = computed(
    () =>
      usage.value?.trend.map((point) => ({
        label: String(point.day),
        value: point.count
      })) ?? []
  );
  let syncingListQuery = false;

  watch(page, (value) => {
    pageInput.value = String(value);
  });

  watch(
    () => [route.query.page, route.query.q, route.query.status, route.query.role],
    async () => {
      if (syncingListQuery) return;
      const nextPage = readRoutePage();
      const nextQ = queryString(route.query.q).trim();
      const nextStatus = readRouteStatus();
      const nextRole = readRouteRole();
      if (
        page.value === nextPage &&
        q.value === nextQ &&
        status.value === nextStatus &&
        role.value === nextRole
      ) {
        return;
      }
      q.value = nextQ;
      status.value = nextStatus;
      role.value = nextRole;
      await load(nextPage, { syncRoute: false });
    }
  );

  async function load(nextPage = page.value, options: { syncRoute?: boolean } = {}) {
    const targetPage = sanitizePage(nextPage);
    if (options.syncRoute !== false) await replaceListQuery(targetPage);
    loading.value = true;
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(pageSize)
      });
      const trimmedQ = q.value.trim();
      if (trimmedQ) params.set("q", trimmedQ);
      if (status.value) params.set("status", status.value);
      if (auth.isSysadmin && role.value) params.set("role", role.value);
      const body = await apiFetch<{
        items: AdminUser[];
        page: number;
        pageSize: number;
        total: number;
      }>(`/admin/users${params.size ? `?${params.toString()}` : ""}`);
      users.value = body.items;
      page.value = sanitizePage(body.page);
      total.value = Math.max(Math.floor(body.total ?? body.items.length), 0);
    } finally {
      loading.value = false;
    }
  }

  async function jumpToPage() {
    const targetPage = clampPageInput(pageInput.value);
    pageInput.value = String(targetPage);
    if (targetPage === page.value) return;
    await load(targetPage);
  }

  async function loadKeys() {
    const body = await apiFetch<{ items: ProviderKeyRow[] }>("/admin/provider-keys");
    keys.value = body.items;
    if (!form.value.providerKeyId && keys.value.length) {
      form.value.providerKeyId = keys.value[0].id;
    }
  }

  function setCreateOpen(open: boolean) {
    if (!createSaving.value) createOpen.value = open;
  }

  function setEditOpen(open: boolean) {
    if (!editSaving.value) editOpen.value = open;
  }

  function setQuotaOpen(open: boolean) {
    if (!quotaSaving.value) quotaOpen.value = open;
  }

  function setPasswordOpen(open: boolean) {
    if (!passwordSaving.value) passwordOpen.value = open;
  }

  function openCreateDialog() {
    createSaving.value = false;
    form.value = createDefaultAdminUserForm(keys.value);
    createOpen.value = true;
    if (!keys.value.length) void loadKeys();
  }

  async function createUser() {
    if (createSaving.value) return;
    createSaving.value = true;
    const createdRole = form.value.role;
    try {
      await apiFetch("/admin/users", { method: "POST", body: JSON.stringify(form.value) });
      toast.success(
        createdRole === "admin" ? t("adminUsers.adminCreated") : t("adminUsers.userCreated")
      );
      createOpen.value = false;
      form.value = createDefaultAdminUserForm(keys.value);
      await load(1);
    } finally {
      createSaving.value = false;
    }
  }

  function openEditDialog(user: AdminUser) {
    editSaving.value = false;
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

  /** 仅提交差异字段；管理员权限边界由后端 `assertManagedUserAccess` 兜底。 */
  async function saveEdit() {
    if (!editingUser.value || editSaving.value) return;
    editSaving.value = true;
    const user = editingUser.value;
    const payload: {
      nickname?: string;
      status?: "active" | "disabled";
      providerKeyId?: string;
      quota?: number | null;
      password?: string;
    } = {};
    if (editForm.value.nickname !== user.nickname) payload.nickname = editForm.value.nickname;
    if (editForm.value.status !== user.status) payload.status = editForm.value.status;
    const currentProviderKeyId = user.providerKeyId ?? user.preferredProviderKeyId ?? "";
    if (editForm.value.providerKeyId && editForm.value.providerKeyId !== currentProviderKeyId) {
      payload.providerKeyId = editForm.value.providerKeyId;
    }
    if (editForm.value.quota !== user.allocatedQuota) payload.quota = editForm.value.quota;
    if (editForm.value.password) payload.password = editForm.value.password;
    if (!Object.keys(payload).length) {
      editOpen.value = false;
      editSaving.value = false;
      return;
    }
    try {
      await apiFetch(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      toast.success(t("adminUsers.userUpdated"));
      editOpen.value = false;
      editingUser.value = null;
      await load(page.value);
    } finally {
      editSaving.value = false;
    }
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

  /** 给选中用户追加额度；扣减的是当前登录管理员剩余池。 */
  async function grantQuota() {
    const user = selectedUser.value;
    if (!user || quotaSaving.value) return;
    if (actorRemaining.value !== null && quotaAmount.value > actorRemaining.value) {
      toast.error(t("adminUsers.quotaTooLarge"));
      return;
    }
    quotaSaving.value = true;
    try {
      await apiFetch(`/admin/users/${user.id}/quota`, {
        method: "POST",
        body: JSON.stringify({ amount: quotaAmount.value })
      });
      toast.success(t("adminUsers.quotaAdjusted"));
      quotaOpen.value = false;
      transactions.value = [];
      transactionsNextCursor.value = null;
      await Promise.all([load(page.value), loadQuota(), auth.bootstrap()]);
    } finally {
      quotaSaving.value = false;
    }
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
    await load(page.value);
    if (selectedUser.value?.id === user.id) selectedUser.value.status = nextStatus;
  }

  function openPasswordDialog(user: AdminUser) {
    passwordSaving.value = false;
    passwordUser.value = user;
    passwordForm.value = createDefaultAdminPasswordForm();
    passwordOpen.value = true;
  }

  async function resetPassword() {
    const user = passwordUser.value;
    if (!user || passwordSaving.value) return;
    if (passwordForm.value.password !== passwordForm.value.confirmPassword) {
      toast.error(t("adminUsers.passwordMismatch"));
      return;
    }
    passwordSaving.value = true;
    try {
      await apiFetch(`/admin/users/${user.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password: passwordForm.value.password })
      });
      toast.success(t("adminUsers.passwordResetSuccess"));
      passwordOpen.value = false;
      passwordUser.value = null;
      passwordForm.value = createDefaultAdminPasswordForm();
    } finally {
      passwordSaving.value = false;
    }
  }

  function openQuotaDialog(user: AdminUser) {
    quotaSaving.value = false;
    const previousUserId = selectedUser.value?.id;
    selectedUser.value = user;
    quotaAmount.value = 10;
    quotaOpen.value = true;
    if (!quota.value || previousUserId !== user.id) void openDetails(user);
  }

  function aggregateUsage(key: "status" | "mode") {
    return aggregateAdminUsage(usage.value, key, key === "status" ? statusLabel : modeLabel);
  }

  function statusLabel(value: string) {
    if (value === "active") return t("common.enabled");
    if (value === "disabled") return t("common.disabled");
    if (value === "succeeded") return t("common.succeeded");
    if (value === "failed") return t("common.failed");
    if (value === "running") return t("common.running");
    if (value === "queued") return t("common.queued");
    return value;
  }

  function roleLabel(value: string) {
    if (value === "admin") return t("adminUsers.roleAdmin");
    if (value === "user") return t("adminUsers.roleUser");
    return value;
  }

  function formatDateTime(value?: number | null) {
    return formatAdminUserDateTime(locale.value, value);
  }

  function keyLabel(id?: string | null) {
    return providerKeyDisplayLabel(keys.value, t("sysadmin.unassigned"), id);
  }

  function modeLabel(mode: string) {
    if (mode === "text2image") return t("workspace.text2image");
    if (mode === "image2image") return t("workspace.image2image");
    if (mode === "chat") return t("workspace.chat");
    return mode;
  }

  function tableRowNumber(index: number) {
    return userListOffset.value + index + 1;
  }

  function readRoutePage() {
    return queryPositiveInt(route.query.page, 1);
  }

  function readRouteStatus(): "" | "active" | "disabled" {
    const value = queryString(route.query.status);
    return value === "active" || value === "disabled" ? value : "";
  }

  function readRouteRole(): "" | "admin" | "user" {
    const value = queryString(route.query.role);
    return value === "admin" || value === "user" ? value : "";
  }

  function adminListQuery(nextPage = page.value) {
    const query: StringQuery = { page: String(sanitizePage(nextPage)) };
    const trimmedQ = q.value.trim();
    if (trimmedQ) query.q = trimmedQ;
    if (status.value) query.status = status.value;
    if (auth.isSysadmin && role.value) query.role = role.value;
    return query;
  }

  async function replaceListQuery(nextPage = page.value) {
    const query = adminListQuery(nextPage);
    if (isSameStringQuery(query, route.query)) return;
    syncingListQuery = true;
    try {
      await router.replace({ path: "/admin/users", query });
    } finally {
      syncingListQuery = false;
    }
  }

  function sanitizePage(value: number) {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.floor(value));
  }

  function clampPageInput(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return page.value;
    return Math.min(sanitizePage(parsed), totalPages.value);
  }

  onMounted(() => {
    void load(page.value, { syncRoute: false });
    void loadKeys();
  });

  return {
    auth,
    locale,
    t,
    users,
    keys,
    q,
    status,
    role,
    createOpen,
    editOpen,
    quotaOpen,
    passwordOpen,
    selectedUser,
    editingUser,
    passwordUser,
    createSaving,
    editSaving,
    quotaSaving,
    passwordSaving,
    quota,
    transactions,
    transactionsNextCursor,
    usage,
    quotaAmount,
    form,
    editForm,
    passwordForm,
    page,
    pageInput,
    total,
    loading,
    actorRemaining,
    quotaPercent,
    statusItems,
    modeItems,
    totalPages,
    trendPoints,
    load,
    jumpToPage,
    loadQuota,
    setCreateOpen,
    setEditOpen,
    setQuotaOpen,
    setPasswordOpen,
    openCreateDialog,
    createUser,
    openEditDialog,
    saveEdit,
    openDetails,
    grantQuota,
    toggleStatus,
    openPasswordDialog,
    resetPassword,
    openQuotaDialog,
    statusLabel,
    roleLabel,
    formatDateTime,
    keyLabel,
    tableRowNumber
  };
}
