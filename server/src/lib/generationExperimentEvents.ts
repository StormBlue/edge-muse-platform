import { z } from "zod";

type GenerationExperimentEventSpec = {
  client: boolean;
  generateMetric: boolean;
  taskResult: boolean;
  excludeDirectAccessFromPrimaryMetrics: boolean;
};

const GENERATION_EXPERIMENT_EVENT_CATALOG = {
  generation_entry_exposed: {
    client: true,
    generateMetric: false,
    taskResult: false,
    excludeDirectAccessFromPrimaryMetrics: false
  },
  generation_page_opened: {
    client: true,
    generateMetric: false,
    taskResult: false,
    excludeDirectAccessFromPrimaryMetrics: true
  },
  prompt_case_selected: {
    client: true,
    generateMetric: false,
    taskResult: false,
    excludeDirectAccessFromPrimaryMetrics: true
  },
  assistant_started: {
    client: true,
    generateMetric: false,
    taskResult: false,
    excludeDirectAccessFromPrimaryMetrics: true
  },
  assistant_prompt_filled: {
    client: true,
    generateMetric: false,
    taskResult: false,
    excludeDirectAccessFromPrimaryMetrics: true
  },
  generate_submitted: {
    client: false,
    generateMetric: true,
    taskResult: false,
    excludeDirectAccessFromPrimaryMetrics: true
  },
  generate_succeeded: {
    client: false,
    generateMetric: true,
    taskResult: true,
    excludeDirectAccessFromPrimaryMetrics: true
  },
  generate_failed: {
    client: false,
    generateMetric: true,
    taskResult: true,
    excludeDirectAccessFromPrimaryMetrics: true
  },
  variant_switched_directly: {
    client: true,
    generateMetric: false,
    taskResult: false,
    excludeDirectAccessFromPrimaryMetrics: false
  }
} as const satisfies Record<string, GenerationExperimentEventSpec>;

export type GenerationExperimentEventName = keyof typeof GENERATION_EXPERIMENT_EVENT_CATALOG;

type EventNamesByFlag<Flag extends keyof GenerationExperimentEventSpec> = {
  [Name in GenerationExperimentEventName]: (typeof GENERATION_EXPERIMENT_EVENT_CATALOG)[Name][Flag] extends true
    ? Name
    : never;
}[GenerationExperimentEventName];

export type ClientGenerationExperimentEventName = EventNamesByFlag<"client">;
export type GenerateMetricEventName = EventNamesByFlag<"generateMetric">;
export type TaskResultExperimentEventName = EventNamesByFlag<"taskResult">;
export type DirectAccessPrimaryMetricEventName =
  EventNamesByFlag<"excludeDirectAccessFromPrimaryMetrics">;

export const generationExperimentEventNames = Object.keys(GENERATION_EXPERIMENT_EVENT_CATALOG) as [
  GenerationExperimentEventName,
  ...GenerationExperimentEventName[]
];

export const clientGenerationExperimentEventNames = generationExperimentEventNames.filter(
  (eventName): eventName is ClientGenerationExperimentEventName =>
    GENERATION_EXPERIMENT_EVENT_CATALOG[eventName].client
) as [ClientGenerationExperimentEventName, ...ClientGenerationExperimentEventName[]];

export const generationExperimentEventSchema = z.enum(generationExperimentEventNames);
export const clientGenerationExperimentEventSchema = z.enum(clientGenerationExperimentEventNames);

export function isGenerateMetricEventName(eventName: string): eventName is GenerateMetricEventName {
  return hasEventFlag(eventName, "generateMetric");
}

export function isTaskResultExperimentEventName(
  eventName: GenerationExperimentEventName
): eventName is TaskResultExperimentEventName {
  return GENERATION_EXPERIMENT_EVENT_CATALOG[eventName].taskResult;
}

export function isDirectAccessPrimaryMetricEventName(
  eventName: string
): eventName is DirectAccessPrimaryMetricEventName {
  return hasEventFlag(eventName, "excludeDirectAccessFromPrimaryMetrics");
}

export function generationExperimentMetricEventName(
  eventName: string,
  metadata: Record<string, unknown>
) {
  if (!isGenerateMetricEventName(eventName)) return eventName;
  if (metadata.isRetry === true) return generationExperimentRetryMetricName(eventName);
  if (metadata.mode === "chat") return `chat_${eventName}`;
  return eventName;
}

function generationExperimentRetryMetricName(eventName: GenerateMetricEventName) {
  if (eventName === "generate_submitted") return "generate_retry_submitted";
  if (eventName === "generate_succeeded") return "generate_retry_succeeded";
  return "generate_retry_failed";
}

function hasEventFlag<Flag extends keyof GenerationExperimentEventSpec>(
  eventName: string,
  flag: Flag
) {
  if (!isGenerationExperimentEventName(eventName)) return false;
  return GENERATION_EXPERIMENT_EVENT_CATALOG[eventName][flag];
}

function isGenerationExperimentEventName(
  eventName: string
): eventName is GenerationExperimentEventName {
  return eventName in GENERATION_EXPERIMENT_EVENT_CATALOG;
}
