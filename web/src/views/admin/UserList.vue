<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import PaginationControls from "@/components/admin/PaginationControls.vue";
import AppShell from "@/components/layout/AppShell.vue";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import AdminUserDetailsAside from "./AdminUserDetailsAside.vue";
import { useAdminUsersController } from "./useAdminUsersController";

const {
  auth,
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
  roleLabel,
  formatDateTime,
  keyLabel,
  tableRowNumber
} = useAdminUsersController();
</script>

<template>
  <AppShell>
    <div class="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <h1 class="text-xl font-semibold leading-8">{{ t("adminUsers.title") }}</h1>
      <form
        class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end"
        @submit.prevent="load(1)"
      >
        <select
          v-model="status"
          class="ui-field h-10 !w-full px-3 text-sm sm:!w-40"
          @change="load(1)"
        >
          <option value="">{{ t("adminUsers.allStatuses") }}</option>
          <option value="active">{{ t("common.enabled") }}</option>
          <option value="disabled">{{ t("common.disabled") }}</option>
        </select>
        <select
          v-if="auth.isSysadmin"
          v-model="role"
          class="ui-field h-10 !w-full px-3 text-sm sm:!w-40"
          @change="load(1)"
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
      <div class="min-w-0">
        <div class="panel overflow-hidden" :aria-busy="loading">
          <div class="thin-scrollbar max-h-[calc(100vh-10rem)] overflow-auto">
            <table class="w-full min-w-[82rem] border-collapse text-sm">
              <thead class="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
                <tr>
                  <th class="w-16 p-3">{{ t("common.sequence") }}</th>
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
                <tr v-if="loading && !users.length" class="border-t border-border">
                  <td class="p-6 text-center text-muted-foreground" colspan="8">
                    <span class="inline-flex items-center gap-2">
                      <Loader2 class="h-4 w-4 animate-spin" />
                      {{ t("common.loading") }}
                    </span>
                  </td>
                </tr>
                <tr v-else-if="!users.length" class="border-t border-border">
                  <td class="p-6 text-center text-muted-foreground" colspan="8">
                    {{ t("adminUsers.noUsers") }}
                  </td>
                </tr>
                <tr v-for="(user, index) in users" :key="user.id" class="border-t border-border">
                  <td class="p-3 font-mono text-muted-foreground">{{ tableRowNumber(index) }}</td>
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
        :key-label="keyLabel"
        @load-more-quota="loadQuota()"
      />
    </div>

    <Dialog :open="createOpen" @update:open="setCreateOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t("adminUsers.createUser") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" :aria-busy="createSaving" @submit.prevent="createUser">
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
              <button class="ui-button ui-button-secondary" type="button" :disabled="createSaving">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit" :disabled="createSaving">
              <Loader2 v-if="createSaving" class="h-4 w-4 animate-spin" />
              {{ t("common.create") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="editOpen" @update:open="setEditOpen">
      <DialogContent v-if="editingUser" class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t("adminUsers.editUser") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" :aria-busy="editSaving" @submit.prevent="saveEdit">
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
              <button class="ui-button ui-button-secondary" type="button" :disabled="editSaving">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit" :disabled="editSaving">
              <Loader2 v-if="editSaving" class="h-4 w-4 animate-spin" />
              {{ t("common.save") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="quotaOpen" @update:open="setQuotaOpen">
      <DialogContent v-if="selectedUser" class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{{ t("adminUsers.adjustQuota") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" :aria-busy="quotaSaving" @submit.prevent="grantQuota">
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
              <button class="ui-button ui-button-secondary" type="button" :disabled="quotaSaving">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit" :disabled="quotaSaving">
              <Loader2 v-if="quotaSaving" class="h-4 w-4 animate-spin" />
              {{ t("adminUsers.confirm") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="passwordOpen" @update:open="setPasswordOpen">
      <DialogContent v-if="passwordUser" class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{{ t("adminUsers.resetPassword") }}</DialogTitle>
        </DialogHeader>
        <form
          class="flex flex-col gap-3"
          :aria-busy="passwordSaving"
          @submit.prevent="resetPassword"
        >
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
              <button
                class="ui-button ui-button-secondary"
                type="button"
                :disabled="passwordSaving"
              >
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit" :disabled="passwordSaving">
              <Loader2 v-if="passwordSaving" class="h-4 w-4 animate-spin" />
              {{ t("common.save") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AppShell>
</template>
