<script setup lang="ts">
/**
 * 生成入口开关页。
 *
 * 系统管理员只需要控制普通用户是否看到「图像生成」与「AI 图像生成」；
 * 用量统计保留最近 30 天的提交、成功和失败对比。
 */
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import AppShell from "@/components/layout/AppShell.vue";
import { useGenerationEntryAdmin } from "./useGenerationEntryAdmin";

const { t } = useI18n();
const {
  loading,
  saving,
  switchOptions,
  pageUsageRows,
  metricsWindowText,
  totalSubmitted,
  saveDisabled,
  load,
  save,
  setPageEnabled
} = useGenerationEntryAdmin();

onMounted(load);

function updatePageSwitch(key: (typeof switchOptions.value)[number]["key"], event: Event) {
  setPageEnabled(key, (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <AppShell>
    <div class="space-y-4">
      <section class="panel p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 class="text-xl font-semibold">{{ t("generationEntry.title") }}</h1>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              {{ t("generationEntry.subtitle") }}
            </p>
          </div>
          <button
            class="ui-button ui-button-primary"
            type="button"
            :disabled="saveDisabled"
            @click="save"
          >
            {{ saving ? t("common.loading") : t("common.save") }}
          </button>
        </div>

        <div class="mt-5 grid gap-3 md:grid-cols-2">
          <label
            v-for="option in switchOptions"
            :key="option.key"
            class="page-switch"
            :class="option.enabled ? 'page-switch--on' : ''"
          >
            <span class="min-w-0">
              <span class="block text-base font-semibold">{{ option.title }}</span>
              <span class="mt-1 block text-sm leading-6 text-muted-foreground">
                {{ option.description }}
              </span>
            </span>
            <input
              class="sr-only"
              type="checkbox"
              :checked="option.enabled"
              :disabled="loading || saving"
              @change="updatePageSwitch(option.key, $event)"
            />
            <span class="switch-track" aria-hidden="true">
              <span class="switch-thumb"></span>
            </span>
          </label>
        </div>
        <p class="mt-3 text-xs leading-5 text-muted-foreground">
          {{ t("generationEntry.atLeastOnePageHint") }}
        </p>
      </section>

      <section class="panel overflow-hidden">
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 class="font-semibold">{{ t("generationEntry.pageUsageTitle") }}</h2>
            <p v-if="metricsWindowText" class="mt-1 text-xs text-muted-foreground">
              {{ metricsWindowText }}
            </p>
          </div>
          <div class="rounded-lg border border-border px-3 py-2 text-right">
            <p class="text-xs text-muted-foreground">{{ t("generationEntry.submitted") }}</p>
            <p class="text-lg font-semibold tabular-nums">{{ totalSubmitted }}</p>
          </div>
        </div>

        <div v-if="loading" class="p-6 text-center text-sm text-muted-foreground">
          {{ t("common.loading") }}
        </div>
        <div v-else class="grid gap-4 p-4 md:grid-cols-2">
          <article v-for="row in pageUsageRows" :key="row.route" class="usage-card">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-semibold">{{ row.label }}</h3>
                <p class="mt-1 text-xs text-muted-foreground">{{ row.route }}</p>
              </div>
              <span class="rounded-full border border-border px-2.5 py-1 text-xs font-medium">
                {{ row.sharePercent }}
              </span>
            </div>
            <div class="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
              <div class="h-full rounded-full bg-primary" :style="{ width: row.barWidth }"></div>
            </div>
            <dl class="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt class="text-xs text-muted-foreground">{{ t("generationEntry.submitted") }}</dt>
                <dd class="mt-1 font-semibold tabular-nums">{{ row.submitted }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">{{ t("common.succeeded") }}</dt>
                <dd class="mt-1 font-semibold tabular-nums">{{ row.succeeded }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">
                  {{ t("generationEntry.successRate") }}
                </dt>
                <dd class="mt-1 font-semibold tabular-nums">{{ row.successRate }}</dd>
              </div>
            </dl>
            <p class="mt-3 text-xs text-muted-foreground">
              {{ t("generationEntry.failed") }}:
              <span class="font-medium text-foreground">{{ row.failed }}</span>
            </p>
          </article>
        </div>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.page-switch {
  display: flex;
  min-width: 0;
  cursor: pointer;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 72%);
  padding: 1rem;
  transition:
    background-color 160ms ease,
    border-color 160ms ease;
}

.page-switch--on {
  border-color: color-mix(in oklch, var(--primary), transparent 45%);
  background: color-mix(in oklch, var(--primary), transparent 91%);
}

.switch-track {
  display: inline-flex;
  width: 2.75rem;
  height: 1.5rem;
  flex-shrink: 0;
  align-items: center;
  border-radius: 999px;
  background: var(--muted);
  padding: 0.125rem;
  transition: background-color 160ms ease;
}

.switch-thumb {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  background: var(--background);
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.18);
  transition: transform 160ms ease;
}

.page-switch--on .switch-track {
  background: var(--primary);
}

.page-switch--on .switch-thumb {
  transform: translateX(1.25rem);
}

.usage-card {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--card);
  padding: 1rem;
}
</style>
