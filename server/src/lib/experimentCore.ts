import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { experiments, type Experiment } from "../db/schema";
import { GENERATION_EXPERIENCE_KEY } from "./generationExperimentConstants";
import { newId, now } from "./id";
import { parseJson, stringifyJson } from "./json";
import type { AppBindings } from "../types";
import type { ExperimentPatchInput } from "./experimentSchemas";

export function experimentToDto(row: Experiment) {
  return {
    key: row.key,
    status: row.status,
    strategy: row.strategy,
    trafficPercent: row.trafficPercent,
    salt: row.salt,
    scope: parseJson<Record<string, unknown>>(row.scope, {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function getGenerationExperiment(env: AppBindings) {
  const row = await getDb(env).query.experiments.findFirst({
    where: eq(experiments.key, GENERATION_EXPERIENCE_KEY)
  });
  return row ? experimentToDto(row) : defaultExperimentDto();
}

export async function saveGenerationExperiment(
  env: AppBindings,
  actorId: string,
  input: ExperimentPatchInput
) {
  const timestamp = now();
  const existing = await getDb(env).query.experiments.findFirst({
    where: eq(experiments.key, GENERATION_EXPERIENCE_KEY)
  });
  const row: Experiment = {
    key: GENERATION_EXPERIENCE_KEY,
    status: input.status,
    strategy: input.strategy,
    trafficPercent: input.trafficPercent,
    salt: existing?.salt ?? newId("salt"),
    scope: stringifyJson(input.scope),
    createdBy: existing?.createdBy ?? actorId,
    updatedBy: actorId,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
  if (existing) {
    await getDb(env)
      .update(experiments)
      .set({
        status: row.status,
        strategy: row.strategy,
        trafficPercent: row.trafficPercent,
        scope: row.scope,
        updatedBy: actorId,
        updatedAt: timestamp
      })
      .where(eq(experiments.key, GENERATION_EXPERIENCE_KEY));
  } else {
    await getDb(env).insert(experiments).values(row);
  }
  return experimentToDto(row);
}

export async function ensureGenerationExperimentRow(env: AppBindings, actorId: string) {
  const existing = await getDb(env).query.experiments.findFirst({
    where: eq(experiments.key, GENERATION_EXPERIENCE_KEY)
  });
  if (existing) return;
  await saveGenerationExperiment(env, actorId, {
    status: "draft",
    strategy: "parallel",
    trafficPercent: 50,
    scope: {}
  });
}

function defaultExperimentDto() {
  return {
    key: GENERATION_EXPERIENCE_KEY,
    status: "draft" as const,
    strategy: "parallel" as const,
    trafficPercent: 50,
    salt: "",
    scope: {},
    createdAt: 0,
    updatedAt: 0
  };
}
