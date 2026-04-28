import { describe, expect, it } from "vitest";
import { buildGenerationExperimentMetricSummary } from "./generationExperimentMetricsSummary";
import type { ExperimentMetric } from "@/api/experiments";

describe("generation experiment metric summary", () => {
  it("includes retry success counts and rates", () => {
    const metrics: ExperimentMetric[] = [
      { variant: "B", eventName: "generation_entry_exposed", count: 20 },
      { variant: "B", eventName: "generation_page_opened", count: 10 },
      { variant: "B", eventName: "assistant_started", count: 5 },
      { variant: "B", eventName: "assistant_turn_requested", count: 4 },
      { variant: "B", eventName: "assistant_turn_degraded", count: 1 },
      { variant: "B", eventName: "assistant_prompt_filled", count: 3 },
      { variant: "B", eventName: "generate_submitted", count: 4 },
      { variant: "B", eventName: "generate_succeeded", count: 3 },
      { variant: "B", eventName: "generate_failed", count: 2 },
      { variant: "B", eventName: "generate_retry_submitted", count: 2 },
      { variant: "B", eventName: "generate_retry_succeeded", count: 1 },
      { variant: "B", eventName: "generation_history_returned", count: 2 },
      { variant: "B", eventName: "variant_switched_directly", count: 1 }
    ];

    expect(buildGenerationExperimentMetricSummary(metrics)).toEqual([
      {
        variant: "B",
        exposed: 20,
        opened: 10,
        assistantStarted: 5,
        assistantTurns: 4,
        assistantDegraded: 1,
        promptFilled: 3,
        submitted: 4,
        succeeded: 3,
        failed: 2,
        retrySubmitted: 2,
        retrySucceeded: 1,
        historyReturned: 2,
        directAccess: 1,
        openRate: "50.0%",
        assistantDegradedRate: "25.0%",
        promptFillRate: "60.0%",
        submitRate: "40.0%",
        successRate: "75.0%",
        retryRate: "100.0%",
        retrySuccessRate: "50.0%",
        historyReturnRate: "66.7%",
        total: 58
      }
    ]);
  });
});
