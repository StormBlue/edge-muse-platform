<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { ExperimentMetric } from "@/api/experiments";
import type { GenerationExperimentMetricSummaryRow } from "./generationExperimentMetricsSummary";

defineProps<{
  loading: boolean;
  metricsWindowText: string;
  metricSummaryRows: GenerationExperimentMetricSummaryRow[];
  metricRows: ExperimentMetric[];
}>();

const { t } = useI18n();
</script>

<template>
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
        <table class="w-full min-w-[76rem] text-sm">
          <thead class="bg-muted text-left text-muted-foreground">
            <tr>
              <th class="p-3">{{ t("experiments.variant") }}</th>
              <th class="p-3 text-right">{{ t("experiments.exposed") }}</th>
              <th class="p-3 text-right">{{ t("experiments.pageOpened") }}</th>
              <th class="p-3 text-right">{{ t("experiments.openRate") }}</th>
              <th class="p-3 text-right">{{ t("experiments.assistantStarted") }}</th>
              <th class="p-3 text-right">{{ t("experiments.promptFilled") }}</th>
              <th class="p-3 text-right">{{ t("experiments.promptFillRate") }}</th>
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
              <td class="p-4 text-center text-muted-foreground" colspan="16">
                {{ t("common.loading") }}
              </td>
            </tr>
            <tr v-else-if="!metricSummaryRows.length" class="border-t border-border">
              <td class="p-4 text-center text-muted-foreground" colspan="16">
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
              <td class="p-3 text-right font-mono">{{ row.exposed }}</td>
              <td class="p-3 text-right font-mono">{{ row.opened }}</td>
              <td class="p-3 text-right font-mono">{{ row.openRate }}</td>
              <td class="p-3 text-right font-mono">{{ row.assistantStarted }}</td>
              <td class="p-3 text-right font-mono">{{ row.promptFilled }}</td>
              <td class="p-3 text-right font-mono">{{ row.promptFillRate }}</td>
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
</template>
