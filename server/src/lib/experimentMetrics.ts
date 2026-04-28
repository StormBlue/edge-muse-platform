import { and, gte, lte, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { experimentEvents } from "../db/schema";
import {
  GENERATION_EXPERIENCE_KEY,
  GENERATION_METRICS_WINDOW_DAYS,
  SERVER_TASK_TERMINAL_SOURCE
} from "./generationExperimentConstants";
import {
  generationExperimentMetricEventName,
  shouldCountGenerationExperimentMetricEvent
} from "./generationExperimentEvents";
import { now } from "./id";
import { parseJson } from "./json";
import type { AppBindings } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type GenerationExperimentMetric = { variant: string; eventName: string; count: number };
export type GenerationExperimentMetricsWindow = {
  since: number;
  until: number;
  days: number;
};

export function getGenerationExperimentMetricsWindow(
  referenceTime = now()
): GenerationExperimentMetricsWindow {
  return {
    since: referenceTime - GENERATION_METRICS_WINDOW_DAYS * DAY_MS,
    until: referenceTime,
    days: GENERATION_METRICS_WINDOW_DAYS
  };
}

export async function getGenerationExperimentMetrics(
  env: AppBindings,
  options: { window?: GenerationExperimentMetricsWindow } = {}
) {
  const window = options.window ?? getGenerationExperimentMetricsWindow();
  const rows = await getDb(env)
    .select({
      variant: experimentEvents.variant,
      eventName: experimentEvents.eventName,
      metadata: experimentEvents.metadata
    })
    .from(experimentEvents)
    .where(
      and(
        eq(experimentEvents.experimentKey, GENERATION_EXPERIENCE_KEY),
        eq(experimentEvents.isSysadminPreview, false),
        gte(experimentEvents.createdAt, window.since),
        lte(experimentEvents.createdAt, window.until)
      )
    );
  const metrics = new Map<string, GenerationExperimentMetric>();
  for (const row of rows) {
    const metadata = parseJson<Record<string, unknown>>(row.metadata, {});
    if (
      !shouldCountGenerationExperimentMetricEvent(row.eventName, metadata, {
        serverTaskTerminalSource: SERVER_TASK_TERMINAL_SOURCE
      })
    ) {
      continue;
    }
    incrementMetric(
      metrics,
      row.variant,
      generationExperimentMetricEventName(row.eventName, metadata)
    );
  }
  return [...metrics.values()].sort((left, right) =>
    `${left.variant}:${left.eventName}`.localeCompare(`${right.variant}:${right.eventName}`)
  );
}

function incrementMetric(
  metrics: Map<string, GenerationExperimentMetric>,
  variant: string,
  eventName: string
) {
  const key = `${variant}:${eventName}`;
  const existing = metrics.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  metrics.set(key, { variant, eventName, count: 1 });
}
