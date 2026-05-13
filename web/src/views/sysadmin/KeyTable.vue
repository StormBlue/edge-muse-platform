<script setup lang="ts">
import { Loader2, PlugZap } from "lucide-vue-next";
import type { KeyRow } from "./useSysadminKeysController";

defineProps<{
  keys: KeyRow[];
  testingKeyId: string | null;
  t: (key: string, params?: Record<string, unknown>) => string;
  providerLabel: (providerId: string) => string;
  tableRowNumber: (index: number) => number;
}>();

defineEmits<{
  testKey: [key: KeyRow];
  openEdit: [key: KeyRow];
  toggleKey: [key: KeyRow];
  deleteKey: [key: KeyRow];
}>();
</script>

<template>
  <section class="panel overflow-hidden">
    <div class="border-b border-border px-4 py-3">
      <h2 class="text-sm font-semibold">{{ t("sysadmin.keyList") }}</h2>
    </div>
    <div class="thin-scrollbar max-h-[calc(100vh-12rem)] overflow-auto">
      <table class="w-full min-w-[72rem] text-sm">
        <thead class="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
          <tr>
            <th class="w-16 p-3">{{ t("common.sequence") }}</th>
            <th class="p-3">{{ t("sysadmin.label") }}</th>
            <th class="p-3">{{ t("sysadmin.provider") }}</th>
            <th class="p-3">{{ t("sysadmin.keyModel") }}</th>
            <th class="p-3">{{ t("sysadmin.keyHint") }}</th>
            <th class="p-3">{{ t("sysadmin.maxConcurrency") }}</th>
            <th class="p-3">{{ t("common.quota") }}</th>
            <th class="p-3">{{ t("adminUsers.status") }}</th>
            <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!keys.length" class="border-t border-border">
            <td class="p-4 text-center text-muted-foreground" colspan="9">
              {{ t("sysadmin.noKeys") }}
            </td>
          </tr>
          <tr v-for="(key, index) in keys" :key="key.id" class="border-t border-border">
            <td class="p-3 font-mono text-muted-foreground">{{ tableRowNumber(index) }}</td>
            <td class="p-3">
              <p class="font-medium">{{ key.label }}</p>
              <p class="text-xs text-muted-foreground">{{ key.id }}</p>
            </td>
            <td class="p-3">{{ providerLabel(key.providerId) }}</td>
            <td class="p-3">{{ key.model || "-" }}</td>
            <td class="p-3 font-mono">{{ key.keyHint }}</td>
            <td class="p-3">{{ key.activeSlots }} / {{ key.maxConcurrency }}</td>
            <td class="p-3">{{ key.usedQuota }} / {{ key.allocatedQuota ?? "∞" }}</td>
            <td class="p-3">
              <span
                class="rounded-full px-2 py-1 text-xs"
                :class="
                  key.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                "
              >
                {{ key.enabled ? t("common.enabled") : t("common.disabled") }}
              </span>
            </td>
            <td class="space-x-2 p-3 text-right">
              <button
                class="ui-button ui-button-secondary h-8 text-xs"
                type="button"
                :disabled="testingKeyId === key.id"
                @click="$emit('testKey', key)"
              >
                <Loader2 v-if="testingKeyId === key.id" class="h-3.5 w-3.5 animate-spin" />
                <PlugZap v-else class="h-3.5 w-3.5" />
                {{ t("sysadmin.testKey") }}
              </button>
              <button
                class="ui-button ui-button-secondary h-8 text-xs"
                type="button"
                @click="$emit('openEdit', key)"
              >
                {{ t("sysadmin.edit") }}
              </button>
              <button
                class="ui-button ui-button-secondary h-8 text-xs"
                type="button"
                @click="$emit('toggleKey', key)"
              >
                {{ key.enabled ? t("common.disabled") : t("common.enabled") }}
              </button>
              <button
                class="ui-button ui-button-secondary h-8 text-xs text-destructive"
                type="button"
                @click="$emit('deleteKey', key)"
              >
                {{ t("common.delete") }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
