<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import type { AdminUser } from "./adminUserTypes";

type Translate = (key: string, named?: Record<string, unknown>) => string;

defineProps<{
  authIsSysadmin: boolean;
  formatDateTime: (value?: number | null) => string;
  loading: boolean;
  roleLabel: (value: string) => string;
  tableRowNumber: (index: number) => number;
  t: Translate;
  users: AdminUser[];
}>();

const emit = defineEmits<{
  openDetails: [user: AdminUser];
  openEdit: [user: AdminUser];
  openQuota: [user: AdminUser];
  openPassword: [user: AdminUser];
  toggleStatus: [user: AdminUser];
}>();
</script>

<template>
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
              <button class="max-w-full text-left" type="button" @click="emit('openDetails', user)">
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
                  v-if="authIsSysadmin"
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="emit('openEdit', user)"
                >
                  {{ t("sysadmin.edit") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="emit('openQuota', user)"
                >
                  {{ t("adminUsers.addQuota") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="emit('toggleStatus', user)"
                >
                  {{ user.status === "active" ? t("common.disabled") : t("common.enabled") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="emit('openPassword', user)"
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
</template>
