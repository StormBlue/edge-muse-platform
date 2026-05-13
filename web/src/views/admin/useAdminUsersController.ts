import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { isSameStringQuery, queryString } from "@/lib/routeQuery";
import { useAuthStore } from "@/stores/auth";
import {
  createDefaultAdminEditForm,
  createDefaultAdminPasswordForm,
  createDefaultAdminUserForm
} from "./adminUserHelpers";
import {
  buildAdminUsersListQuery,
  clampAdminUsersPageInput,
  readAdminUsersRoutePage,
  readAdminUsersRouteRole,
  readAdminUsersRouteStatus,
  sanitizeAdminUsersPage
} from "./adminUserRouteQuery";
import {
  fetchAdminUserQuota,
  fetchAdminUsers,
  fetchAdminUserUsage,
  fetchSysadminProviderKeyGroups
} from "./adminUserApi";
import { buildAdminUserEditPayload, createAdminEditFormForUser } from "./adminUserPayloads";
import type {
  AdminUser,
  ProviderKeyGroupRow,
  QuotaSnapshot,
  QuotaTransaction,
  UsageResponse
} from "./adminUserTypes";
import { useAdminUserLabels } from "./useAdminUserLabels";

export function useAdminUsersController() {
  const auth = useAuthStore();
  const route = useRoute();
  const router = useRouter();
  const { locale, t } = useI18n();

  const users = ref<AdminUser[]>([]);
  const groups = ref<ProviderKeyGroupRow[]>([]);
  const q = ref(queryString(route.query.q).trim());
  const status = ref<"" | "active" | "disabled">(readAdminUsersRouteStatus(route.query));
  const role = ref<"" | "admin" | "user">(readAdminUsersRouteRole(route.query));
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
  const page = ref(readAdminUsersRoutePage(route.query));
  const pageInput = ref(String(page.value));
  const pageSize = 20;
  const total = ref(0);
  const loading = ref(false);

  const actorRemaining = computed(() => auth.quota?.remainingQuota ?? null);
  const quotaPercent = computed(() => {
    if (!quota.value?.allocatedQuota) return 0;
    return Math.min(100, Math.round((quota.value.usedQuota / quota.value.allocatedQuota) * 100));
  });
  const userListOffset = computed(() => (page.value - 1) * pageSize);
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
  const {
    statusItems,
    modeItems,
    trendPoints,
    statusLabel,
    roleLabel,
    formatDateTime,
    groupLabel,
    tableRowNumber
  } = useAdminUserLabels({
    groups,
    locale,
    t,
    usage,
    userListOffset
  });
  let syncingListQuery = false;

  watch(page, (value) => {
    pageInput.value = String(value);
  });

  watch(
    () => [route.query.page, route.query.q, route.query.status, route.query.role],
    async () => {
      if (syncingListQuery) return;
      const nextPage = readAdminUsersRoutePage(route.query);
      const nextQ = queryString(route.query.q).trim();
      const nextStatus = readAdminUsersRouteStatus(route.query);
      const nextRole = readAdminUsersRouteRole(route.query);
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
    const targetPage = sanitizeAdminUsersPage(nextPage);
    if (options.syncRoute !== false) await replaceListQuery(targetPage);
    loading.value = true;
    try {
      const body = await fetchAdminUsers({
        isSysadmin: auth.isSysadmin,
        page: targetPage,
        pageSize,
        q: q.value,
        role: role.value,
        status: status.value
      });
      users.value = body.items;
      page.value = sanitizeAdminUsersPage(body.page);
      total.value = Math.max(Math.floor(body.total ?? body.items.length), 0);
    } finally {
      loading.value = false;
    }
  }

  async function jumpToPage() {
    const targetPage = clampAdminUsersPageInput(pageInput.value, page.value, totalPages.value);
    pageInput.value = String(targetPage);
    if (targetPage === page.value) return;
    await load(targetPage);
  }

  async function loadGroups() {
    if (!auth.isSysadmin) return;
    const body = await fetchSysadminProviderKeyGroups();
    groups.value = body.items.filter((group) => group.enabled);
    if (!form.value.providerKeyGroupId && groups.value.length) {
      form.value.providerKeyGroupId = groups.value[0].id;
    }
  }

  const setCreateOpen = (open: boolean) => !createSaving.value && (createOpen.value = open);
  const setEditOpen = (open: boolean) => !editSaving.value && (editOpen.value = open);
  const setQuotaOpen = (open: boolean) => !quotaSaving.value && (quotaOpen.value = open);
  const setPasswordOpen = (open: boolean) => !passwordSaving.value && (passwordOpen.value = open);

  function openCreateDialog() {
    createSaving.value = false;
    form.value = createDefaultAdminUserForm(groups.value, auth.isSysadmin);
    createOpen.value = true;
    if (auth.isSysadmin && !groups.value.length) void loadGroups();
  }

  async function createUser() {
    if (createSaving.value) return;
    createSaving.value = true;
    const createdRole = form.value.role;
    try {
      const payload = {
        ...form.value,
        providerKeyGroupId: auth.isSysadmin ? form.value.providerKeyGroupId || undefined : undefined
      };
      await apiFetch("/admin/users", { method: "POST", body: JSON.stringify(payload) });
      toast.success(
        createdRole === "admin" ? t("adminUsers.adminCreated") : t("adminUsers.userCreated")
      );
      createOpen.value = false;
      form.value = createDefaultAdminUserForm(groups.value, auth.isSysadmin);
      await load(1);
    } finally {
      createSaving.value = false;
    }
  }

  function openEditDialog(user: AdminUser) {
    editSaving.value = false;
    editingUser.value = user;
    editForm.value = createAdminEditFormForUser(user);
    editOpen.value = true;
    if (auth.isSysadmin && !groups.value.length) void loadGroups();
  }

  async function saveEdit() {
    if (!editingUser.value || editSaving.value) return;
    editSaving.value = true;
    const user = editingUser.value;
    const payload = buildAdminUserEditPayload(user, editForm.value);
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
    const body = await fetchAdminUserQuota(userId, transactionsNextCursor.value);
    quota.value = body.quota;
    transactions.value = [...transactions.value, ...body.transactions];
    transactionsNextCursor.value = body.nextCursor;
  }

  async function loadUsage(userId = selectedUser.value?.id) {
    if (!userId) return;
    usage.value = await fetchAdminUserUsage(userId);
  }

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
      toast.success(t("adminUsers.quotaAdded"));
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

  async function replaceListQuery(nextPage = page.value) {
    const query = buildAdminUsersListQuery({
      isSysadmin: auth.isSysadmin,
      page: nextPage,
      q: q.value,
      role: role.value,
      status: status.value
    });
    if (isSameStringQuery(query, route.query)) return;
    syncingListQuery = true;
    try {
      await router.replace({ path: "/admin/users", query });
    } finally {
      syncingListQuery = false;
    }
  }

  onMounted(() => {
    void load(page.value, { syncRoute: false });
    void loadGroups();
  });

  return {
    auth,
    t,
    users,
    groups,
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
    groupLabel,
    tableRowNumber
  };
}
