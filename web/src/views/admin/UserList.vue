<script setup lang="ts">
import { computed } from "vue";
import PaginationControls from "@/components/admin/PaginationControls.vue";
import AppShell from "@/components/layout/AppShell.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import AdminUserCreateDialog from "./AdminUserCreateDialog.vue";
import AdminUserDetailsAside from "./AdminUserDetailsAside.vue";
import AdminUserEditDialog from "./AdminUserEditDialog.vue";
import AdminUserPasswordDialog from "./AdminUserPasswordDialog.vue";
import AdminUserQuotaDialog from "./AdminUserQuotaDialog.vue";
import AdminUserTable from "./AdminUserTable.vue";
import { useAdminUsersController } from "./useAdminUsersController";

const {
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
  roleLabel,
  formatDateTime,
  groupLabel,
  tableRowNumber
} = useAdminUsersController();

const ALL_STATUS_VALUE = "__all_status__";
const ALL_ROLE_VALUE = "__all_role__";
const statusSelectValue = computed({
  get: () => status.value || ALL_STATUS_VALUE,
  set: (value: string) => {
    status.value = value === ALL_STATUS_VALUE ? "" : (value as "active" | "disabled");
  }
});
const roleSelectValue = computed({
  get: () => role.value || ALL_ROLE_VALUE,
  set: (value: string) => {
    role.value = value === ALL_ROLE_VALUE ? "" : (value as "admin" | "user");
  }
});
</script>

<template>
  <AppShell>
    <div class="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <h1 class="text-xl font-semibold leading-8">{{ t("adminUsers.title") }}</h1>
      <form
        class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end"
        @submit.prevent="load(1)"
      >
        <Select v-model="statusSelectValue" @update:model-value="load(1)">
          <SelectTrigger class="h-10 !w-full sm:!w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_STATUS_VALUE">{{ t("adminUsers.allStatuses") }}</SelectItem>
            <SelectItem value="active">{{ t("common.enabled") }}</SelectItem>
            <SelectItem value="disabled">{{ t("common.disabled") }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-if="auth.isSysadmin" v-model="roleSelectValue" @update:model-value="load(1)">
          <SelectTrigger class="h-10 !w-full sm:!w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_ROLE_VALUE">{{ t("adminUsers.allRoles") }}</SelectItem>
            <SelectItem value="user">{{ t("adminUsers.roleUser") }}</SelectItem>
            <SelectItem value="admin">{{ t("adminUsers.roleAdmin") }}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-model="q"
          class="col-span-2 h-10 !w-full sm:col-span-1 sm:!w-72"
          :placeholder="t('adminUsers.searchEmail')"
        />
        <Button class="h-10" variant="secondary" type="submit">
          {{ t("common.search") }}
        </Button>
        <Button class="h-10" type="button" @click="openCreateDialog">
          {{ t("adminUsers.createUser") }}
        </Button>
      </form>
    </div>

    <div
      class="grid gap-4"
      :class="selectedUser ? 'xl:grid-cols-[minmax(0,1fr)_24rem]' : 'xl:grid-cols-1'"
    >
      <div class="min-w-0">
        <AdminUserTable
          :auth-is-sysadmin="auth.isSysadmin"
          :format-date-time="formatDateTime"
          :loading="loading"
          :role-label="roleLabel"
          :table-row-number="tableRowNumber"
          :t="t"
          :users="users"
          @open-details="openDetails"
          @open-edit="openEditDialog"
          @open-password="openPasswordDialog"
          @open-quota="openQuotaDialog"
          @toggle-status="toggleStatus"
        />

        <PaginationControls
          v-model:page-input="pageInput"
          input-id="admin-users-page-jump"
          :page="page"
          :total-pages="totalPages"
          :total="total"
          :loading="loading"
          @previous="load(page - 1)"
          @next="load(page + 1)"
          @jump="jumpToPage"
        />
      </div>

      <AdminUserDetailsAside
        v-if="selectedUser"
        :selected-user="selectedUser"
        :is-sysadmin="auth.isSysadmin"
        :quota="quota"
        :quota-percent="quotaPercent"
        :usage-total="usage?.total ?? 0"
        :status-items="statusItems"
        :mode-items="modeItems"
        :trend-points="trendPoints"
        :transactions="transactions"
        :transactions-next-cursor="transactionsNextCursor"
        :role-label="roleLabel"
        :format-date-time="formatDateTime"
        :group-label="groupLabel"
        @load-more-quota="loadQuota()"
      />
    </div>

    <AdminUserCreateDialog
      v-model:form="form"
      :open="createOpen"
      :groups="groups"
      :is-sysadmin="auth.isSysadmin"
      :saving="createSaving"
      :t="t"
      @submit="createUser"
      @update:open="setCreateOpen"
    />

    <AdminUserEditDialog
      v-model:edit-form="editForm"
      :open="editOpen"
      :editing-user="editingUser"
      :groups="groups"
      :is-sysadmin="auth.isSysadmin"
      :role-label="roleLabel"
      :saving="editSaving"
      :t="t"
      @submit="saveEdit"
      @update:open="setEditOpen"
    />

    <AdminUserQuotaDialog
      v-model:quota-amount="quotaAmount"
      :open="quotaOpen"
      :actor-remaining="actorRemaining"
      :saving="quotaSaving"
      :selected-user="selectedUser"
      :t="t"
      @submit="grantQuota"
      @update:open="setQuotaOpen"
    />

    <AdminUserPasswordDialog
      v-model:password-form="passwordForm"
      :open="passwordOpen"
      :password-user="passwordUser"
      :saving="passwordSaving"
      :t="t"
      @submit="resetPassword"
      @update:open="setPasswordOpen"
    />
  </AppShell>
</template>
