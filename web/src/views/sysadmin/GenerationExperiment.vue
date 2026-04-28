<script setup lang="ts">
/**
 * 生成入口 A/B 测试管理页。
 *
 * 固定管理 `generation_experience`：旧版 `/workspace` 为 A，新版 `/ai-image` 为 B。
 */
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import {
  getGenerationExperiment,
  saveGenerationExperiment,
  type ExperimentMetric,
  type GenerationExperiment
} from "@/api/experiments";
import {
  applyGenerationExperimentPreset,
  generationExperimentScopeHasTargetRule,
  GENERATION_EXPERIMENT_PRESETS,
  type GenerationExperimentPresetKey
} from "./generationExperimentPresets";
import { generationExperimentRiskSummary } from "./generationExperimentRisk";

const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const metrics = ref<ExperimentMetric[]>([]);
const scopeText = ref("{}");
const form = ref({
  status: "draft" as GenerationExperiment["status"],
  strategy: "parallel" as GenerationExperiment["strategy"],
  trafficPercent: 50,
  scope: {}
});

const trafficOptions = [0, 25, 50, 75, 100];
const metricRows = computed(() =>
  [...metrics.value].sort((left, right) =>
    `${left.variant}:${left.eventName}`.localeCompare(`${right.variant}:${right.eventName}`)
  )
);
const presetButtons = computed(() =>
  GENERATION_EXPERIMENT_PRESETS.map((preset) => ({
    ...preset,
    disabled: preset.requiresTargetScope && !generationExperimentScopeHasTargetRule(scopeText.value)
  }))
);
const riskSummary = computed(() => generationExperimentRiskSummary(form.value, scopeText.value));
const riskClass = computed(() => {
  if (riskSummary.value.level === "danger") {
    return "border-destructive/45 bg-destructive/10 text-destructive";
  }
  if (riskSummary.value.level === "caution") {
    return "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-primary/35 bg-primary/10 text-primary";
});

async function load() {
  loading.value = true;
  try {
    const body = await getGenerationExperiment();
    form.value = {
      status: body.experiment.status,
      strategy: body.experiment.strategy,
      trafficPercent: body.experiment.trafficPercent,
      scope: body.experiment.scope
    };
    scopeText.value = JSON.stringify(body.experiment.scope, null, 2);
    metrics.value = body.metrics;
  } finally {
    loading.value = false;
  }
}

async function save() {
  let scope: Record<string, unknown>;
  try {
    scope = JSON.parse(scopeText.value || "{}") as Record<string, unknown>;
  } catch {
    toast.error(t("experiments.scopeInvalid"));
    return;
  }
  saving.value = true;
  try {
    form.value.scope = scope;
    await saveGenerationExperiment(form.value);
    toast.success(t("experiments.saved"));
    await load();
  } finally {
    saving.value = false;
  }
}

function applyPreset(key: GenerationExperimentPresetKey) {
  const preset = GENERATION_EXPERIMENT_PRESETS.find((item) => item.key === key);
  if (!preset) return;
  if (preset.requiresTargetScope && !generationExperimentScopeHasTargetRule(scopeText.value)) {
    toast.error(t("experiments.presetScopeRequired"));
    return;
  }
  form.value = applyGenerationExperimentPreset(form.value, key);
}

onMounted(load);
</script>

<template>
  <AppShell>
    <form class="grid gap-4 xl:grid-cols-[26rem_minmax(0,1fr)]" @submit.prevent="save">
      <section class="panel space-y-4 p-5">
        <div>
          <h1 class="text-xl font-semibold">{{ t("experiments.title") }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">{{ t("experiments.subtitle") }}</p>
        </div>

        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("adminUsers.status") }}
          </span>
          <select v-model="form.status" class="ui-field h-10 px-3">
            <option value="draft">{{ t("experiments.status.draft") }}</option>
            <option value="running">{{ t("experiments.status.running") }}</option>
            <option value="paused">{{ t("experiments.status.paused") }}</option>
            <option value="archived">{{ t("experiments.status.archived") }}</option>
          </select>
        </label>

        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("experiments.strategy") }}
          </span>
          <select v-model="form.strategy" class="ui-field h-10 px-3">
            <option value="parallel">{{ t("experiments.strategyParallel") }}</option>
            <option value="force_legacy">{{ t("experiments.strategyLegacy") }}</option>
            <option value="force_ai">{{ t("experiments.strategyAi") }}</option>
            <option value="ab_test">{{ t("experiments.strategyAb") }}</option>
          </select>
        </label>

        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("experiments.traffic") }}
          </span>
          <select v-model.number="form.trafficPercent" class="ui-field h-10 px-3">
            <option v-for="value in trafficOptions" :key="value" :value="value">
              B: {{ value }}% / A: {{ 100 - value }}%
            </option>
          </select>
        </label>

        <div>
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("experiments.presets") }}
          </span>
          <div class="grid gap-2">
            <button
              v-for="preset in presetButtons"
              :key="preset.key"
              class="rounded-lg border border-border bg-muted/30 p-3 text-left transition hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-55"
              type="button"
              :disabled="preset.disabled"
              :title="t(preset.descriptionKey)"
              @click="applyPreset(preset.key)"
            >
              <span class="block text-sm font-semibold">{{ t(preset.labelKey) }}</span>
              <span class="mt-1 block text-xs leading-5 text-muted-foreground">
                {{ t(preset.descriptionKey) }}
              </span>
            </button>
          </div>
        </div>

        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("experiments.scope") }}
          </span>
          <textarea v-model="scopeText" class="ui-field min-h-28 p-3 font-mono text-xs" />
          <span class="mt-1.5 block text-xs leading-5 text-muted-foreground">
            {{ t("experiments.scopeHint") }}
          </span>
        </label>

        <div class="rounded-lg border p-3" :class="riskClass">
          <p class="text-sm font-semibold">{{ t(riskSummary.titleKey) }}</p>
          <p class="mt-1 text-xs leading-5">{{ t(riskSummary.bodyKey) }}</p>
        </div>

        <button class="ui-button ui-button-primary" type="submit" :disabled="saving || loading">
          {{ t("common.save") }}
        </button>
      </section>

      <section class="panel overflow-hidden">
        <div class="border-b border-border p-4">
          <h2 class="font-semibold">{{ t("experiments.metrics") }}</h2>
        </div>
        <div class="thin-scrollbar max-h-[calc(100vh-12rem)] overflow-auto">
          <table class="w-full min-w-[42rem] text-sm">
            <thead class="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>
                <th class="p-3">{{ t("experiments.variant") }}</th>
                <th class="p-3">{{ t("experiments.eventName") }}</th>
                <th class="p-3 text-right">{{ t("experiments.count") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading" class="border-t border-border">
                <td class="p-4 text-center text-muted-foreground" colspan="3">
                  {{ t("common.loading") }}
                </td>
              </tr>
              <tr v-else-if="!metricRows.length" class="border-t border-border">
                <td class="p-4 text-center text-muted-foreground" colspan="3">
                  {{ t("experiments.noMetrics") }}
                </td>
              </tr>
              <tr
                v-for="row in metricRows"
                v-else
                :key="`${row.variant}:${row.eventName}`"
                class="border-t border-border"
              >
                <td class="p-3 font-mono">{{ row.variant }}</td>
                <td class="p-3">{{ row.eventName }}</td>
                <td class="p-3 text-right font-mono">{{ row.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </form>
  </AppShell>
</template>
