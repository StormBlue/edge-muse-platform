<script setup lang="ts">
import { Loader2, Pencil, PlugZap, Power, PowerOff, Trash2 } from "@lucide/vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { KeyRow } from "./useSysadminKeysController";

defineProps<{
  keys: KeyRow[];
  testingKeyId: string | null;
  t: (key: string, params?: Record<string, unknown>) => string;
  providerLabel: (providerId: string) => string;
}>();

defineEmits<{
  testKey: [key: KeyRow];
  openEdit: [key: KeyRow];
  toggleKey: [key: KeyRow];
  deleteKey: [key: KeyRow];
}>();
</script>

<template>
  <section class="panel flex min-h-0 flex-col overflow-hidden">
    <div class="border-b border-border px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold">{{ t("sysadmin.keyList") }}</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ t("sysadmin.keyCount", { count: keys.length }) }}
          </p>
        </div>
      </div>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="space-y-3 p-3">
        <div
          v-if="!keys.length"
          class="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
        >
          {{ t("sysadmin.noKeys") }}
        </div>

        <article
          v-for="key in keys"
          :key="key.id"
          class="rounded border border-border bg-background p-3"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="truncate text-sm font-semibold">{{ key.label }}</h3>
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
                  :class="
                    key.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ key.enabled ? t("common.enabled") : t("common.disabled") }}
                </span>
              </div>
              <p class="mt-1 truncate font-mono text-xs text-muted-foreground">{{ key.id }}</p>
            </div>

            <div class="flex shrink-0 flex-wrap justify-end gap-2">
              <button
                class="ui-button ui-button-secondary h-8 px-2.5 text-xs"
                type="button"
                :disabled="testingKeyId === key.id"
                @click="$emit('testKey', key)"
              >
                <Loader2 v-if="testingKeyId === key.id" class="h-3.5 w-3.5 animate-spin" />
                <PlugZap v-else class="h-3.5 w-3.5" />
                {{ t("sysadmin.testKey") }}
              </button>
              <button
                class="ui-button ui-button-secondary h-8 px-2.5 text-xs"
                type="button"
                @click="$emit('openEdit', key)"
              >
                <Pencil class="h-3.5 w-3.5" />
                {{ t("sysadmin.edit") }}
              </button>
              <button
                class="ui-button ui-button-secondary h-8 px-2.5 text-xs"
                type="button"
                @click="$emit('toggleKey', key)"
              >
                <PowerOff v-if="key.enabled" class="h-3.5 w-3.5" />
                <Power v-else class="h-3.5 w-3.5" />
                {{ key.enabled ? t("common.disabled") : t("common.enabled") }}
              </button>
              <button
                class="ui-button ui-button-secondary h-8 px-2.5 text-xs text-destructive"
                type="button"
                @click="$emit('deleteKey', key)"
              >
                <Trash2 class="h-3.5 w-3.5" />
                {{ t("common.delete") }}
              </button>
            </div>
          </div>

          <dl class="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <dt>{{ t("sysadmin.provider") }}</dt>
              <dd class="mt-0.5 truncate font-medium text-foreground">
                {{ providerLabel(key.providerId) }}
              </dd>
            </div>
            <div>
              <dt>{{ t("sysadmin.keyModel") }}</dt>
              <dd class="mt-0.5 truncate font-medium text-foreground">{{ key.model || "-" }}</dd>
            </div>
            <div>
              <dt>{{ t("sysadmin.keyHint") }}</dt>
              <dd class="mt-0.5 font-mono font-medium text-foreground">{{ key.keyHint }}</dd>
            </div>
            <div>
              <dt>{{ t("sysadmin.maxConcurrency") }}</dt>
              <dd class="mt-0.5 font-medium text-foreground">
                {{ key.activeSlots }} / {{ key.maxConcurrency }}
              </dd>
            </div>
            <div>
              <dt>{{ t("common.quota") }}</dt>
              <dd class="mt-0.5 font-medium text-foreground">
                {{ key.usedQuota }} / {{ key.allocatedQuota ?? t("common.unlimited") }}
              </dd>
            </div>
          </dl>
        </article>
      </div>
    </ScrollArea>
  </section>
</template>
