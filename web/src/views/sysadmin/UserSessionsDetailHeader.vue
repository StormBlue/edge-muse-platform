<script setup lang="ts">
import { ArrowLeft, ChevronLeft, ChevronRight } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import type { AuditSession } from "./userSessionsTypes";

defineProps<{
  selectedSession: AuditSession | null;
  activeMessageIndex: number;
  resultCount: number;
  updatedAtLabel: string;
}>();

defineEmits<{
  back: [];
  previous: [];
  next: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
    <div class="min-w-0">
      <button
        class="ui-button ui-button-secondary mb-3 h-9 px-3 text-sm"
        type="button"
        @click="$emit('back')"
      >
        <ArrowLeft class="h-4 w-4" />
        {{ t("sysadmin.backToSessionTable") }}
      </button>
      <h1 class="truncate text-xl font-semibold leading-8">
        {{ selectedSession?.title ?? t("history.detail") }}
      </h1>
      <span
        v-if="selectedSession?.deletedAt"
        class="mt-2 inline-flex rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
      >
        {{ t("sysadmin.deletedSession") }}
      </span>
      <p v-if="selectedSession" class="mt-1 text-sm text-muted-foreground">
        {{ t("history.updatedAt") }} {{ updatedAtLabel }}
      </p>
    </div>
    <div v-if="resultCount > 1" class="flex shrink-0 items-center gap-2 text-sm">
      <button
        class="ui-button ui-button-secondary h-9 px-3"
        type="button"
        :disabled="activeMessageIndex <= 0"
        @click="$emit('previous')"
      >
        <ChevronLeft class="h-4 w-4" />
        {{ t("common.previous") }}
      </button>
      <span class="min-w-16 text-center text-muted-foreground">
        {{ activeMessageIndex + 1 }} / {{ resultCount }}
      </span>
      <button
        class="ui-button ui-button-secondary h-9 px-3"
        type="button"
        :disabled="activeMessageIndex >= resultCount - 1"
        @click="$emit('next')"
      >
        {{ t("common.next") }}
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
