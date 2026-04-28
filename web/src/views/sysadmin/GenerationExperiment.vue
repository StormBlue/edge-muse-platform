<script setup lang="ts">
/**
 * 生成入口 A/B 测试管理页。
 *
 * 固定管理 `generation_experience`：旧版 `/workspace` 为 A，新版 `/ai-image` 为 B。
 */
import { onMounted } from "vue";
import AppShell from "@/components/layout/AppShell.vue";
import GenerationExperimentAssignmentsPanel from "./GenerationExperimentAssignmentsPanel.vue";
import GenerationExperimentConfigPanel from "./GenerationExperimentConfigPanel.vue";
import GenerationExperimentMetricsPanel from "./GenerationExperimentMetricsPanel.vue";
import { useGenerationExperimentAdmin } from "./useGenerationExperimentAdmin";

const {
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
} = useGenerationExperimentAdmin();

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="grid gap-4 xl:grid-cols-[26rem_minmax(0,1fr)]">
      <GenerationExperimentConfigPanel
        :form="form"
        :loading="loading"
        :preset-buttons="presetButtons"
        :risk-class="riskClass"
        :risk-summary="riskSummary"
        :saving="saving"
        :scope-text="scopeText"
        :traffic-options="trafficOptions"
        @apply-preset="applyPreset"
        @save="save"
        @update:scope-text="updateScopeText"
        @update:status="form.status = $event"
        @update:strategy="form.strategy = $event"
        @update:traffic-percent="form.trafficPercent = $event"
      />

      <div class="space-y-4">
        <GenerationExperimentMetricsPanel
          :loading="loading"
          :metric-rows="metricRows"
          :metric-summary-rows="metricSummaryRows"
          :metrics-window-text="metricsWindowText"
        />

        <GenerationExperimentAssignmentsPanel
          :assignment-form="assignmentForm"
          :assignments="assignments"
          :format-date-time="formatDateTime"
          :loading="loading"
          :saving-assignment="savingAssignment"
          @remove-assignment="removeAssignment"
          @save-assignment="saveAssignment"
          @update:user-id="assignmentForm.userId = $event"
          @update:variant="assignmentForm.variant = $event"
        />
      </div>
    </div>
  </AppShell>
</template>
