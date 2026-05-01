<script setup lang="ts">
import type { AuditSession, UserOption } from "./userSessionsTypes";

type Translate = (key: string, named?: Record<string, unknown>) => string;

defineProps<{
  formatDateTime: (value?: number | null) => string;
  modeLabel: (mode?: AuditSession["mode"] | null) => string;
  sessions: AuditSession[];
  tableRowNumber: (index: number) => number;
  t: Translate;
  userLabel: (user?: AuditSession["user"] | UserOption | null) => string;
  userSubLabel: (user?: AuditSession["user"] | UserOption | null) => string;
}>();

const emit = defineEmits<{
  openDetail: [session: AuditSession];
}>();
</script>

<template>
  <div class="panel overflow-hidden">
    <div class="thin-scrollbar overflow-auto">
      <table class="w-full min-w-[76rem] border-collapse text-sm">
        <thead class="bg-muted text-left text-muted-foreground">
          <tr>
            <th class="w-20 p-3">#</th>
            <th class="p-3">{{ t("workspace.sessionTitle") }}</th>
            <th class="p-3">{{ t("sysadmin.userFilter") }}</th>
            <th class="p-3">{{ t("workspace.generationMode") }}</th>
            <th class="p-3">{{ t("sysadmin.successImageCount") }}</th>
            <th class="p-3">{{ t("history.createdAt") }}</th>
            <th class="p-3">{{ t("history.updatedAt") }}</th>
            <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!sessions.length" class="border-t border-border">
            <td class="p-8 text-center text-muted-foreground" colspan="8">
              {{ t("sysadmin.noSessions") }}
            </td>
          </tr>
          <tr
            v-for="(session, index) in sessions"
            :key="session.id"
            class="cursor-pointer border-t border-border transition hover:bg-muted/40"
            tabindex="0"
            @click="emit('openDetail', session)"
            @keyup.enter="emit('openDetail', session)"
          >
            <td class="p-3 font-mono text-muted-foreground">{{ tableRowNumber(index) }}</td>
            <td class="p-3">
              <p class="truncate font-medium">{{ session.title }}</p>
              <p class="truncate font-mono text-xs text-muted-foreground">{{ session.id }}</p>
            </td>
            <td class="p-3">
              <p class="truncate font-medium">{{ userLabel(session.user) }}</p>
              <p class="truncate text-xs text-muted-foreground">
                {{ userSubLabel(session.user) }}
              </p>
            </td>
            <td class="p-3">{{ modeLabel(session.mode) }}</td>
            <td class="p-3 font-mono">{{ session.imageCount ?? 0 }}</td>
            <td class="p-3 text-muted-foreground">{{ formatDateTime(session.createdAt) }}</td>
            <td class="p-3 text-muted-foreground">
              {{ formatDateTime(session.lastMessageAt) }}
            </td>
            <td class="p-3 text-right">
              <button
                class="ui-button ui-button-secondary h-8 text-xs"
                type="button"
                @click.stop="emit('openDetail', session)"
              >
                {{ t("sysadmin.viewDetail") }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
