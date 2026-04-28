import type { ExperimentMetric } from "@/api/experiments";

const SUMMARY_VARIANTS = ["A", "B", "parallel"] as const;

export type GenerationExperimentMetricSummaryRow = {
  variant: (typeof SUMMARY_VARIANTS)[number];
  opened: number;
  submitted: number;
  succeeded: number;
  failed: number;
  retrySubmitted: number;
  retrySucceeded: number;
  directAccess: number;
  submitRate: string;
  successRate: string;
  retryRate: string;
  retrySuccessRate: string;
  total: number;
};

export function buildGenerationExperimentMetricSummary(
  metrics: ExperimentMetric[]
): GenerationExperimentMetricSummaryRow[] {
  const counts = new Map(metrics.map((item) => [`${item.variant}:${item.eventName}`, item.count]));
  return SUMMARY_VARIANTS.map((variant) => {
    const opened = metricCount(counts, variant, "generation_page_opened");
    const submitted = metricCount(counts, variant, "generate_submitted");
    const succeeded = metricCount(counts, variant, "generate_succeeded");
    const failed = metricCount(counts, variant, "generate_failed");
    const retrySubmitted = metricCount(counts, variant, "generate_retry_submitted");
    const retrySucceeded = metricCount(counts, variant, "generate_retry_succeeded");
    const directAccess = metricCount(counts, variant, "variant_switched_directly");
    return {
      variant,
      opened,
      submitted,
      succeeded,
      failed,
      retrySubmitted,
      retrySucceeded,
      directAccess,
      submitRate: formatRate(submitted, opened),
      successRate: formatRate(succeeded, submitted),
      retryRate: formatRate(retrySubmitted, failed),
      retrySuccessRate: formatRate(retrySucceeded, retrySubmitted),
      total:
        opened + submitted + succeeded + failed + retrySubmitted + retrySucceeded + directAccess
    };
  }).filter((row) => row.total > 0);
}

function metricCount(
  counts: Map<string, number>,
  variant: (typeof SUMMARY_VARIANTS)[number],
  eventName: string
) {
  return counts.get(`${variant}:${eventName}`) ?? 0;
}

function formatRate(part: number, total: number) {
  if (!total) return "-";
  return `${((part / total) * 100).toFixed(1)}%`;
}
