<script setup lang="ts">
import { ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from "lucide-vue-next";
import type { HistorySession } from "./historyTypes";

defineProps<{
  activeResultIndex: number;
  canDeleteSelectedSession: boolean;
  displayResultCount: number;
  formatDateTime: (value?: number | null) => string;
  selectedSession: HistorySession | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  back: [];
  delete: [];
  nextResult: [];
  previousResult: [];
}>();
</script>

<template>
  <div class="mb-4 flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div class="min-w-0">
      <button
        class="ui-button ui-button-secondary mb-3 h-9 px-3 text-sm"
        type="button"
        @click="emit('back')"
      >
        <ArrowLeft class="h-4 w-4" />
        {{ t("history.backToGrid") }}
      </button>
      <h1 class="truncate text-xl font-semibold leading-8">
        {{ selectedSession?.title ?? t("history.detail") }}
      </h1>
      <p v-if="selectedSession" class="mt-1 text-sm text-muted-foreground">
        {{ t("history.updatedAt") }} {{ formatDateTime(selectedSession.lastMessageAt) }}
      </p>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2 text-sm">
      <template v-if="displayResultCount > 1">
        <button
          class="ui-button ui-button-secondary h-9 px-3"
          type="button"
          :disabled="activeResultIndex <= 0"
          @click="emit('previousResult')"
        >
          <ChevronLeft class="h-4 w-4" />
          {{ t("common.previous") }}
        </button>
        <span class="min-w-16 text-center text-muted-foreground">
          {{ activeResultIndex + 1 }} / {{ displayResultCount }}
        </span>
        <button
          class="ui-button ui-button-secondary h-9 px-3"
          type="button"
          :disabled="activeResultIndex >= displayResultCount - 1"
          @click="emit('nextResult')"
        >
          {{ t("common.next") }}
          <ChevronRight class="h-4 w-4" />
        </button>
      </template>
      <button
        v-if="selectedSession"
        class="ui-button h-9 border-destructive/25 bg-destructive/10 px-3 text-sm text-destructive"
        type="button"
        :disabled="!canDeleteSelectedSession"
        :title="
          canDeleteSelectedSession ? t('history.deleteSession') : t('history.deleteUnavailable')
        "
        @click="emit('delete')"
      >
        <Trash2 class="h-4 w-4" />
        {{ t("history.deleteSession") }}
      </button>
    </div>
  </div>
</template>
