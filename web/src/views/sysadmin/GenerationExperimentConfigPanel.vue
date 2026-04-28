<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type {
  GenerationExperimentPresetKey,
  GenerationExperimentForm
} from "./generationExperimentPresets";
import type { GenerationExperimentRisk } from "./generationExperimentRisk";
import type { GenerationExperimentPresetButton } from "./useGenerationExperimentAdmin";

const props = defineProps<{
  loading: boolean;
  saving: boolean;
  form: GenerationExperimentForm;
  scopeText: string;
  trafficOptions: number[];
  presetButtons: GenerationExperimentPresetButton[];
  riskSummary: GenerationExperimentRisk;
  riskClass: string;
}>();

const emit = defineEmits<{
  save: [];
  applyPreset: [key: GenerationExperimentPresetKey];
  "update:scopeText": [value: string];
  "update:status": [value: GenerationExperimentForm["status"]];
  "update:strategy": [value: GenerationExperimentForm["strategy"]];
  "update:trafficPercent": [value: number];
}>();

const { t } = useI18n();
const statusModel = computed({
  get: () => props.form.status,
  set: (value: GenerationExperimentForm["status"]) => emit("update:status", value)
});
const strategyModel = computed({
  get: () => props.form.strategy,
  set: (value: GenerationExperimentForm["strategy"]) => emit("update:strategy", value)
});
const trafficPercentModel = computed({
  get: () => props.form.trafficPercent,
  set: (value: number) => emit("update:trafficPercent", value)
});
const scopeTextModel = computed({
  get: () => props.scopeText,
  set: (value: string) => emit("update:scopeText", value)
});
</script>

<template>
  <form class="panel space-y-4 p-5" @submit.prevent="emit('save')">
    <div>
      <h1 class="text-xl font-semibold">{{ t("experiments.title") }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{{ t("experiments.subtitle") }}</p>
    </div>

    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("adminUsers.status") }}
      </span>
      <select v-model="statusModel" class="ui-field h-10 px-3">
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
      <select v-model="strategyModel" class="ui-field h-10 px-3">
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
      <select v-model.number="trafficPercentModel" class="ui-field h-10 px-3">
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
          @click="emit('applyPreset', preset.key)"
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
      <textarea v-model="scopeTextModel" class="ui-field min-h-28 p-3 font-mono text-xs" />
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
</template>
