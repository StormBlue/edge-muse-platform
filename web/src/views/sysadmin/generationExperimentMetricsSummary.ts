import type { ExperimentMetric } from "@/api/experiments";

const SUMMARY_VARIANTS = ["A", "B", "parallel"] as const;

export type GenerationExperimentMetricSummaryRow = {
  variant: (typeof SUMMARY_VARIANTS)[number];
  exposed: number;
  opened: number;
  assistantStarted: number;
  assistantTurns: number;
  assistantDegraded: number;
  promptFilled: number;
  submitted: number;
  succeeded: number;
  failed: number;
  retrySubmitted: number;
  retrySucceeded: number;
  historyReturned: number;
  directAccess: number;
  openRate: string;
  assistantDegradedRate: string;
  promptFillRate: string;
  submitRate: string;
  successRate: string;
  retryRate: string;
  retrySuccessRate: string;
  historyReturnRate: string;
  total: number;
};

export function buildGenerationExperimentMetricSummary(
  metrics: ExperimentMetric[]
): GenerationExperimentMetricSummaryRow[] {
  const counts = new Map(metrics.map((item) => [`${item.variant}:${item.eventName}`, item.count]));
  return SUMMARY_VARIANTS.map((variant) => {
    const exposed = metricCount(counts, variant, "generation_entry_exposed");
    const opened = metricCount(counts, variant, "generation_page_opened");
    const assistantStarted = metricCount(counts, variant, "assistant_started");
    const assistantTurns = metricCount(counts, variant, "assistant_turn_requested");
    const assistantDegraded = metricCount(counts, variant, "assistant_turn_degraded");
    const promptFilled = metricCount(counts, variant, "assistant_prompt_filled");
    const submitted = metricCount(counts, variant, "generate_submitted");
    const succeeded = metricCount(counts, variant, "generate_succeeded");
    const failed = metricCount(counts, variant, "generate_failed");
    const retrySubmitted = metricCount(counts, variant, "generate_retry_submitted");
    const retrySucceeded = metricCount(counts, variant, "generate_retry_succeeded");
    const historyReturned = metricCount(counts, variant, "generation_history_returned");
    const directAccess = metricCount(counts, variant, "variant_switched_directly");
    return {
      variant,
      exposed,
      opened,
      assistantStarted,
      assistantTurns,
      assistantDegraded,
      promptFilled,
      submitted,
      succeeded,
      failed,
      retrySubmitted,
      retrySucceeded,
      historyReturned,
      directAccess,
      openRate: formatRate(opened, exposed),
      assistantDegradedRate: formatRate(assistantDegraded, assistantTurns),
      promptFillRate: formatRate(promptFilled, assistantStarted || opened),
      submitRate: formatRate(submitted, opened),
      successRate: formatRate(succeeded, submitted),
      retryRate: formatRate(retrySubmitted, failed),
      retrySuccessRate: formatRate(retrySucceeded, retrySubmitted),
      historyReturnRate: formatRate(historyReturned, succeeded || submitted),
      total:
        opened +
        submitted +
        succeeded +
        failed +
        retrySubmitted +
        retrySucceeded +
        historyReturned +
        directAccess +
        exposed +
        assistantStarted +
        assistantTurns +
        assistantDegraded +
        promptFilled
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
