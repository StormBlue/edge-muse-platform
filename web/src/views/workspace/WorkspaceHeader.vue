<script setup lang="ts">
import { Loader2, Plus, Sparkles, Wifi } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

defineProps<{
  hasRunningTask: boolean;
  isSysadmin: boolean;
  submitting: boolean;
  websocketStatus: string;
  generationStatusLabel: string;
  generationProgress: number;
  remainingQuota?: number | null;
}>();

defineEmits<{ newSession: [] }>();

const { t } = useI18n();
</script>

<template>
  <header
    class="workspace-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold">{{ t("workspace.title") }}</h1>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button
        class="ui-button ui-button-primary h-9 px-3 text-sm"
        type="button"
        :disabled="(!isSysadmin && hasRunningTask) || submitting"
        @click="$emit('newSession')"
      >
        <Plus class="h-4 w-4" />
        {{ t("workspace.newGeneration") }}
      </button>
      <div
        class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
      >
        <Wifi class="h-3.5 w-3.5" />
        {{ t("workspace.websocket") }}: {{ websocketStatus }}
      </div>
      <div
        v-if="hasRunningTask"
        class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-foreground"
      >
        <Loader2 class="h-3.5 w-3.5 animate-spin text-primary" />
        {{ generationStatusLabel }}
        <span class="tabular-nums text-muted-foreground">
          {{ t("workspace.generationProgress", { percent: generationProgress }) }}
        </span>
      </div>
      <div
        class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
      >
        <Sparkles class="h-3.5 w-3.5" />
        {{
          remainingQuota === null
            ? t("workspace.quotaUnlimited")
            : t("workspace.quotaRemaining", { count: remainingQuota ?? 0 })
        }}
      </div>
    </div>
  </header>
</template>

<style scoped>
.workspace-header {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  padding: 0.75rem;
  box-shadow: var(--shadow-panel);
  backdrop-filter: blur(18px);
}
</style>
