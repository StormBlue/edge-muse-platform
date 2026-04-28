/**
 * 生成体验实验 API。
 */
import { apiFetch } from "@/api/client";

export type GenerationExperiment = {
  key: "generation_experience";
  status: "draft" | "running" | "paused" | "archived";
  strategy: "parallel" | "force_legacy" | "force_ai" | "ab_test";
  trafficPercent: number;
  salt: string;
  scope: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type ExperimentMetric = {
  variant: "A" | "B" | "parallel" | "sysadmin";
  eventName: string;
  count: number;
};

export type ExperimentMetricsWindow = {
  since: number;
  until: number;
  days: number;
};

export type ClientExperimentEventName =
  | "generation_entry_exposed"
  | "generation_page_opened"
  | "prompt_case_selected"
  | "assistant_started"
  | "assistant_prompt_filled"
  | "variant_switched_directly";

export type ClientExperimentEventInput = {
  eventName: ClientExperimentEventName;
  route?: string;
  caseId?: string;
  metadata?: Record<string, unknown>;
};

export async function getGenerationExperiment() {
  return apiFetch<{
    experiment: GenerationExperiment;
    metrics: ExperimentMetric[];
    metricsWindow: ExperimentMetricsWindow;
  }>("/sysadmin/experiments/generation");
}

export async function saveGenerationExperiment(input: {
  status: GenerationExperiment["status"];
  strategy: GenerationExperiment["strategy"];
  trafficPercent: number;
  scope: Record<string, unknown>;
}) {
  const body = await apiFetch<{ experiment: GenerationExperiment }>(
    "/sysadmin/experiments/generation",
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
  return body.experiment;
}

export async function trackExperimentEvent(input: ClientExperimentEventInput) {
  await apiFetch("/experiments/events", {
    method: "POST",
    body: JSON.stringify(input)
  }).catch(() => undefined);
}
