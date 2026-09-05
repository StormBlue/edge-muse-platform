<script setup lang="ts">
import { Loader2, Ellipsis } from "@lucide/vue";
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem
} from "reka-ui";
import { Button } from "@/components/ui/button";
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
      <table class="admin-user-table w-full border-collapse text-sm">
        <thead class="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
          <tr>
            <th class="w-16 p-3">{{ t("common.sequence") }}</th>
            <th class="p-3">{{ t("adminUsers.user") }}</th>
            <th class="p-3">{{ t("adminUsers.role") }}</th>
            <th class="p-3">{{ t("sysadmin.providerKeyGroup") }}</th>
            <th class="p-3">{{ t("adminUsers.maxConcurrentTasks") }}</th>
            <th class="p-3">{{ t("adminUsers.maxImagesPerGeneration") }}</th>
            <th class="p-3">{{ t("common.quota") }}</th>
            <th class="p-3">{{ t("adminUsers.lastLoginAt") }}</th>
            <th class="p-3">{{ t("adminUsers.lastGenerationAt") }}</th>
            <th class="p-3">{{ t("adminUsers.status") }}</th>
            <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && !users.length" class="border-t border-border">
            <td class="p-6 text-center text-muted-foreground" colspan="11">
              <span class="inline-flex items-center gap-2">
                <Loader2 class="h-4 w-4 animate-spin" />
                {{ t("common.loading") }}
              </span>
            </td>
          </tr>
          <tr v-else-if="!users.length" class="border-t border-border">
            <td class="p-6 text-center text-muted-foreground" colspan="11">
              {{ t("adminUsers.noUsers") }}
            </td>
          </tr>
          <tr v-for="(user, index) in users" :key="user.id" class="border-t border-border">
            <td class="p-3 font-mono text-muted-foreground">{{ tableRowNumber(index) }}</td>
            <td class="p-3">
              <button
                class="user-identity max-w-full text-left"
                type="button"
                @click="emit('openDetails', user)"
              >
                <p class="truncate font-medium">{{ user.nickname }}</p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ user.username }} · {{ user.email }}
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ t("history.createdAt") }} {{ formatDateTime(user.createdAt) }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground sm:hidden">
                  {{ roleLabel(user.role) }} · {{ t("common.quota") }} {{ user.usedQuota ?? 0 }} /
                  {{ user.allocatedQuota ?? t("common.unlimited") }}
                </p>
              </button>
            </td>
            <td class="p-3">{{ roleLabel(user.role) }}</td>
            <td class="p-3">
              <p class="max-w-48 truncate">{{ user.providerKeyGroupName ?? "-" }}</p>
              <p class="max-w-48 truncate text-xs text-muted-foreground">
                {{ user.providerKeyGroupProviderId ?? user.providerKeyGroupId ?? "-" }}
              </p>
            </td>
            <td class="p-3">{{ user.maxConcurrentTasks ?? (user.role === "admin" ? 10 : 5) }}</td>
            <td class="p-3">{{ user.maxImagesPerGeneration ?? 1 }}</td>
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
              <DropdownMenuRoot>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="secondary"
                    size="icon"
                    :aria-label="`${t('sysadmin.actions')}: ${user.nickname}`"
                    :title="t('sysadmin.actions')"
                  >
                    <Ellipsis class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent
                    align="end"
                    :side-offset="4"
                    class="z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                  >
                    <DropdownMenuItem class="user-action" @select="emit('openDetails', user)">
                      {{ t("history.detail") }}
                    </DropdownMenuItem>
                    <DropdownMenuItem class="user-action" @select="emit('openEdit', user)">
                      {{ t("sysadmin.edit") }}
                    </DropdownMenuItem>
                    <DropdownMenuItem class="user-action" @select="emit('openQuota', user)">
                      {{ t("adminUsers.addQuota") }}
                    </DropdownMenuItem>
                    <DropdownMenuItem class="user-action" @select="emit('openPassword', user)">
                      {{ t("adminUsers.resetPassword") }}
                    </DropdownMenuItem>
                    <DropdownMenuItem class="user-action" @select="emit('toggleStatus', user)">
                      {{ user.status === "active" ? t("common.disabled") : t("common.enabled") }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.user-identity {
  max-width: 22rem;
}
.user-action {
  display: flex;
  min-height: 2.5rem;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  cursor: pointer;
  outline: none;
}
.user-action[data-highlighted] {
  background: var(--accent);
  color: var(--accent-foreground);
}
.admin-user-table th:last-child,
.admin-user-table td:last-child {
  text-align: right;
  width: 4rem;
}
@media (max-width: 1599px) {
  .admin-user-table
    :is(th, td):not([colspan]):is(
      :nth-child(1),
      :nth-child(4),
      :nth-child(5),
      :nth-child(6),
      :nth-child(8),
      :nth-child(9)
    ) {
    display: none;
  }
}
@media (max-width: 639px) {
  .admin-user-table :is(th, td):not([colspan]):is(:nth-child(3), :nth-child(7)) {
    display: none;
  }
  .user-identity {
    max-width: 48vw;
  }
  .admin-user-table :is(th, td) {
    padding: 0.75rem 0.5rem;
  }
}
</style>
