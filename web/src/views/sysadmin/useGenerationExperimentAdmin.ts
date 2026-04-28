import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import {
  deleteGenerationExperimentAssignment,
  getGenerationExperiment,
  saveGenerationExperimentAssignment,
  saveGenerationExperiment,
  type ExperimentAssignmentOverride,
  type ExperimentMetric,
  type ExperimentMetricsWindow
} from "@/api/experiments";
import {
  applyGenerationExperimentPreset,
  generationExperimentScopeHasTargetRule,
  GENERATION_EXPERIMENT_PRESETS,
  type GenerationExperimentForm,
  type GenerationExperimentPreset,
  type GenerationExperimentPresetKey
} from "./generationExperimentPresets";
import {
  buildGenerationExperimentMetricSummary,
  type GenerationExperimentMetricSummaryRow
} from "./generationExperimentMetricsSummary";
import {
  generationExperimentRiskSummary,
  type GenerationExperimentRisk
} from "./generationExperimentRisk";

export type GenerationExperimentPresetButton = GenerationExperimentPreset & {
  disabled: boolean;
};

export type GenerationExperimentAssignmentForm = {
  userId: string;
  variant: "A" | "B";
};

export function useGenerationExperimentAdmin() {
  const { t, locale } = useI18n();
  const loading = ref(false);
  const saving = ref(false);
  const savingAssignment = ref(false);
  const metrics = ref<ExperimentMetric[]>([]);
  const metricsWindow = ref<ExperimentMetricsWindow | null>(null);
  const assignments = ref<ExperimentAssignmentOverride[]>([]);
  const scopeText = ref("{}");
  const form = reactive<GenerationExperimentForm>({
    status: "draft",
    strategy: "parallel",
    trafficPercent: 50,
    scope: {}
  });
  const assignmentForm = reactive<GenerationExperimentAssignmentForm>({
    userId: "",
    variant: "B"
  });

  const trafficOptions = [0, 25, 50, 75, 100];
  const metricRows = computed(() =>
    [...metrics.value].sort((left, right) =>
      `${left.variant}:${left.eventName}`.localeCompare(`${right.variant}:${right.eventName}`)
    )
  );
  const metricSummaryRows = computed<GenerationExperimentMetricSummaryRow[]>(() =>
    buildGenerationExperimentMetricSummary(metrics.value)
  );
  const presetButtons = computed<GenerationExperimentPresetButton[]>(() =>
    GENERATION_EXPERIMENT_PRESETS.map((preset) => ({
      ...preset,
      disabled:
        preset.requiresTargetScope && !generationExperimentScopeHasTargetRule(scopeText.value)
    }))
  );
  const riskSummary = computed<GenerationExperimentRisk>(() =>
    generationExperimentRiskSummary(form, scopeText.value)
  );
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
      form.status = body.experiment.status;
      form.strategy = body.experiment.strategy;
      form.trafficPercent = body.experiment.trafficPercent;
      form.scope = body.experiment.scope;
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
      form.scope = scope;
      await saveGenerationExperiment(form);
      toast.success(t("experiments.saved"));
      await load();
    } finally {
      saving.value = false;
    }
  }

  async function saveAssignment() {
    const userId = assignmentForm.userId.trim();
    if (!userId) {
      toast.error(t("experiments.assignmentUserIdRequired"));
      return;
    }
    savingAssignment.value = true;
    try {
      await saveGenerationExperimentAssignment(userId, assignmentForm.variant);
      toast.success(t("experiments.assignmentSaved"));
      assignmentForm.userId = "";
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
    Object.assign(form, applyGenerationExperimentPreset(form, key));
  }

  function updateScopeText(value: string) {
    scopeText.value = value;
  }

  return {
    loading,
    saving,
    savingAssignment,
    form,
    assignmentForm,
    trafficOptions,
    presetButtons,
    riskSummary,
    riskClass,
    metricsWindowText,
    metricSummaryRows,
    metricRows,
    assignments,
    scopeText,
    load,
    save,
    saveAssignment,
    removeAssignment,
    formatDateTime,
    applyPreset,
    updateScopeText
  };
}
