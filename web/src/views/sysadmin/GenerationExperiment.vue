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
  deleteGenerationExperimentAssignment,
  getGenerationExperiment,
  saveGenerationExperimentAssignment,
  saveGenerationExperiment,
  type ExperimentAssignmentOverride,
  type ExperimentMetric,
  type ExperimentMetricsWindow,
  type GenerationExperiment
} from "@/api/experiments";
import {
  applyGenerationExperimentPreset,
  generationExperimentScopeHasTargetRule,
  GENERATION_EXPERIMENT_PRESETS,
  type GenerationExperimentPresetKey
} from "./generationExperimentPresets";
import { buildGenerationExperimentMetricSummary } from "./generationExperimentMetricsSummary";
import { generationExperimentRiskSummary } from "./generationExperimentRisk";

const { t, locale } = useI18n();
const loading = ref(false);
const saving = ref(false);
const savingAssignment = ref(false);
const metrics = ref<ExperimentMetric[]>([]);
const metricsWindow = ref<ExperimentMetricsWindow | null>(null);
const assignments = ref<ExperimentAssignmentOverride[]>([]);
const scopeText = ref("{}");
const form = ref({
  status: "draft" as GenerationExperiment["status"],
  strategy: "parallel" as GenerationExperiment["strategy"],
  trafficPercent: 50,
  scope: {}
});
const assignmentForm = ref({
  userId: "",
  variant: "B" as "A" | "B"
});

const trafficOptions = [0, 25, 50, 75, 100];
const metricRows = computed(() =>
  [...metrics.value].sort((left, right) =>
    `${left.variant}:${left.eventName}`.localeCompare(`${right.variant}:${right.eventName}`)
  )
);
const metricSummaryRows = computed(() => {
  return buildGenerationExperimentMetricSummary(metrics.value);
});
const presetButtons = computed(() =>
  GENERATION_EXPERIMENT_PRESETS.map((preset) => ({
    ...preset,
    disabled: preset.requiresTargetScope && !generationExperimentScopeHasTargetRule(scopeText.value)
  }))
);
const riskSummary = computed(() => generationExperimentRiskSummary(form.value, scopeText.value));
const metricsWindowText = computed(() =>
  metricsWindow.value ? t("experiments.metricsWindow", { days: metricsWindow.value.days }) : ""
);
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
    metricsWindow.value = body.metricsWindow;
    assignments.value = body.assignments;
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

async function saveAssignment() {
  const userId = assignmentForm.value.userId.trim();
  if (!userId) {
    toast.error(t("experiments.assignmentUserIdRequired"));
    return;
  }
  savingAssignment.value = true;
  try {
    await saveGenerationExperimentAssignment(userId, assignmentForm.value.variant);
    toast.success(t("experiments.assignmentSaved"));
    assignmentForm.value.userId = "";
    await load();
  } finally {
    savingAssignment.value = false;
  }
}

async function removeAssignment(userId: string) {
  savingAssignment.value = true;
  try {
    await deleteGenerationExperimentAssignment(userId);
    toast.success(t("experiments.assignmentRemoved"));
    await load();
  } finally {
    savingAssignment.value = false;
  }
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat(locale.value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
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
    <div class="grid gap-4 xl:grid-cols-[26rem_minmax(0,1fr)]">
      <form class="panel space-y-4 p-5" @submit.prevent="save">
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
      </form>

      <div class="space-y-4">
        <section class="panel overflow-hidden">
          <div class="border-b border-border p-4">
            <h2 class="font-semibold">{{ t("experiments.metrics") }}</h2>
            <p v-if="metricsWindowText" class="mt-1 text-xs text-muted-foreground">
              {{ metricsWindowText }}
            </p>
          </div>
          <div class="border-b border-border p-4">
            <h3 class="text-sm font-semibold">{{ t("experiments.funnelSummary") }}</h3>
            <div class="mt-3 overflow-auto rounded-lg border border-border">
              <table class="w-full min-w-[56rem] text-sm">
                <thead class="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th class="p-3">{{ t("experiments.variant") }}</th>
                    <th class="p-3 text-right">{{ t("experiments.pageOpened") }}</th>
                    <th class="p-3 text-right">{{ t("experiments.submitted") }}</th>
                    <th class="p-3 text-right">{{ t("experiments.submitRate") }}</th>
                    <th class="p-3 text-right">{{ t("experiments.successRate") }}</th>
                    <th class="p-3 text-right">{{ t("experiments.failed") }}</th>
                    <th class="p-3 text-right">{{ t("experiments.retrySubmitted") }}</th>
                    <th class="p-3 text-right">{{ t("experiments.retryRate") }}</th>
                    <th class="p-3 text-right">{{ t("experiments.retrySucceeded") }}</th>
                    <th class="p-3 text-right">{{ t("experiments.retrySuccessRate") }}</th>
                    <th class="p-3 text-right">{{ t("experiments.directAccess") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="loading" class="border-t border-border">
                    <td class="p-4 text-center text-muted-foreground" colspan="11">
                      {{ t("common.loading") }}
                    </td>
                  </tr>
                  <tr v-else-if="!metricSummaryRows.length" class="border-t border-border">
                    <td class="p-4 text-center text-muted-foreground" colspan="11">
                      {{ t("experiments.noMetrics") }}
                    </td>
                  </tr>
                  <tr
                    v-for="row in metricSummaryRows"
                    v-else
                    :key="row.variant"
                    class="border-t border-border"
                  >
                    <td class="p-3 font-mono">{{ row.variant }}</td>
                    <td class="p-3 text-right font-mono">{{ row.opened }}</td>
                    <td class="p-3 text-right font-mono">{{ row.submitted }}</td>
                    <td class="p-3 text-right font-mono">{{ row.submitRate }}</td>
                    <td class="p-3 text-right font-mono">{{ row.successRate }}</td>
                    <td class="p-3 text-right font-mono">{{ row.failed }}</td>
                    <td class="p-3 text-right font-mono">{{ row.retrySubmitted }}</td>
                    <td class="p-3 text-right font-mono">{{ row.retryRate }}</td>
                    <td class="p-3 text-right font-mono">{{ row.retrySucceeded }}</td>
                    <td class="p-3 text-right font-mono">{{ row.retrySuccessRate }}</td>
                    <td class="p-3 text-right font-mono">{{ row.directAccess }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="thin-scrollbar max-h-[calc(100vh-20rem)] overflow-auto">
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

        <section class="panel overflow-hidden">
          <div class="border-b border-border p-4">
            <h2 class="font-semibold">{{ t("experiments.manualAssignments") }}</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ t("experiments.manualAssignmentsHint") }}
            </p>
          </div>
          <div class="space-y-4 p-4">
            <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_auto]">
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {{ t("experiments.assignmentUserId") }}
                </span>
                <input
                  v-model.trim="assignmentForm.userId"
                  class="ui-field h-10 px-3 font-mono text-sm"
                  :placeholder="t('experiments.assignmentUserIdPlaceholder')"
                />
              </label>
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {{ t("experiments.assignmentVariant") }}
                </span>
                <select v-model="assignmentForm.variant" class="ui-field h-10 px-3">
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              </label>
              <button
                class="ui-button ui-button-secondary self-end"
                type="button"
                :disabled="savingAssignment || loading"
                @click="saveAssignment"
              >
                {{ t("experiments.setAssignment") }}
              </button>
            </div>

            <div class="thin-scrollbar max-h-72 overflow-auto rounded-lg border border-border">
              <table class="w-full min-w-[42rem] text-sm">
                <thead class="sticky top-0 bg-muted text-left text-muted-foreground">
                  <tr>
                    <th class="p-3">{{ t("adminUsers.user") }}</th>
                    <th class="p-3">{{ t("experiments.variant") }}</th>
                    <th class="p-3">{{ t("history.updatedAt") }}</th>
                    <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="loading" class="border-t border-border">
                    <td class="p-4 text-center text-muted-foreground" colspan="4">
                      {{ t("common.loading") }}
                    </td>
                  </tr>
                  <tr v-else-if="!assignments.length" class="border-t border-border">
                    <td class="p-4 text-center text-muted-foreground" colspan="4">
                      {{ t("experiments.noAssignments") }}
                    </td>
                  </tr>
                  <tr
                    v-for="assignment in assignments"
                    v-else
                    :key="assignment.userId"
                    class="border-t border-border"
                  >
                    <td class="p-3">
                      <p class="font-medium">{{ assignment.nickname }}</p>
                      <p class="font-mono text-xs text-muted-foreground">
                        {{ assignment.userId }} · {{ assignment.username }}
                      </p>
                    </td>
                    <td class="p-3 font-mono">{{ assignment.variant }}</td>
                    <td class="p-3 text-muted-foreground">
                      {{ formatDateTime(assignment.updatedAt) }}
                    </td>
                    <td class="p-3 text-right">
                      <button
                        class="ui-button ui-button-ghost"
                        type="button"
                        :disabled="savingAssignment || loading"
                        @click="removeAssignment(assignment.userId)"
                      >
                        {{ t("experiments.removeAssignment") }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  </AppShell>
</template>
