/**
 * 生成入口 A/B 实验。
 *
 * MVP 只实现固定实验 `generation_experience`，避免把项目过早抽象成通用实验平台。
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import {
  experimentAssignments,
  experimentEvents,
  experiments,
  users,
  type Experiment
} from "../db/schema";
import { isInGenerationExperimentScope } from "./experimentScope";
import { newId, now } from "./id";
import { parseJson, stringifyJson } from "./json";
import type { AppBindings, AuthUser } from "../types";

export const GENERATION_EXPERIENCE_KEY = "generation_experience";

export const experimentPatchSchema = z.object({
  status: z.enum(["draft", "running", "paused", "archived"]),
  strategy: z.enum(["parallel", "force_legacy", "force_ai", "ab_test"]),
  trafficPercent: z.number().int().min(0).max(100),
  scope: z.record(z.string(), z.unknown()).default({})
});

export const experimentEventSchema = z.object({
  eventName: z
    .enum([
      "generation_entry_exposed",
      "generation_page_opened",
      "prompt_case_selected",
      "assistant_started",
      "assistant_prompt_filled",
      "generate_submitted",
      "generate_succeeded",
      "generate_failed",
      "variant_switched_directly"
    ])
    .or(z.string().trim().min(1).max(80)),
  route: z.string().trim().max(120).optional(),
  caseId: z.string().trim().max(120).optional(),
  taskId: z.string().trim().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type ExperimentStrategy = z.infer<typeof experimentPatchSchema>["strategy"];
export type ExperimentStatus = z.infer<typeof experimentPatchSchema>["status"];
export type ExperimentVariant = "A" | "B" | "parallel" | "sysadmin";

export type GenerationExperience = {
  experimentKey: typeof GENERATION_EXPERIENCE_KEY;
  status: ExperimentStatus;
  strategy: ExperimentStrategy;
  variant: ExperimentVariant;
  navTarget: "/workspace" | "/ai-image";
  showLegacy: boolean;
  showAi: boolean;
};

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
  input: z.infer<typeof experimentPatchSchema>
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

export async function getGenerationExperienceForUser(
  env: AppBindings,
  user: AuthUser
): Promise<GenerationExperience> {
  if (user.role === "sysadmin") {
    return experience("parallel", "parallel", "running", true, true);
  }
  const experiment = await getDb(env).query.experiments.findFirst({
    where: eq(experiments.key, GENERATION_EXPERIENCE_KEY)
  });
  if (!experiment || experiment.status === "draft" || experiment.status === "archived") {
    return experience("parallel", "parallel", "draft", true, true);
  }
  if (!(await userMatchesExperimentScope(env, experiment, user))) {
    return experience("parallel", "parallel", experiment.status, true, true);
  }
  if (experiment.strategy === "parallel") {
    return experience("parallel", "parallel", experiment.status, true, true);
  }
  if (experiment.strategy === "force_legacy") {
    return experience("force_legacy", "A", experiment.status, true, false);
  }
  if (experiment.strategy === "force_ai") {
    return experience("force_ai", "B", experiment.status, false, true);
  }
  const assignment = await resolveAssignment(env, experiment, user.id);
  return assignment === "B"
    ? experience("ab_test", "B", experiment.status, false, true)
    : experience("ab_test", "A", experiment.status, true, false);
}

async function userMatchesExperimentScope(
  env: AppBindings,
  experiment: Experiment,
  user: AuthUser
) {
  const scope = parseJson<Record<string, unknown>>(experiment.scope, {});
  const row = await getDb(env).query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { id: true, role: true, createdBy: true }
  });
  return isInGenerationExperimentScope(scope, {
    id: user.id,
    role: user.role,
    createdBy: row?.createdBy ?? null
  });
}

export async function recordExperimentEvent(
  env: AppBindings,
  user: AuthUser,
  input: z.infer<typeof experimentEventSchema>
) {
  const assignment = await getGenerationExperienceForUser(env, user);
  await getDb(env)
    .insert(experimentEvents)
    .values({
      id: newId("expevt"),
      experimentKey: GENERATION_EXPERIENCE_KEY,
      userId: user.id,
      variant: user.role === "sysadmin" ? "sysadmin" : assignment.variant,
      eventName: input.eventName,
      route: input.route ?? null,
      caseId: input.caseId ?? null,
      taskId: input.taskId ?? null,
      metadata: stringifyJson(sanitizeExperimentEventMetadata(input.metadata)),
      isSysadminPreview: user.role === "sysadmin",
      createdAt: now()
    });
}

export async function getGenerationExperimentMetrics(env: AppBindings) {
  const rows = await getDb(env)
    .select({
      variant: experimentEvents.variant,
      eventName: experimentEvents.eventName,
      count: sql<number>`count(*)`
    })
    .from(experimentEvents)
    .where(eq(experimentEvents.experimentKey, GENERATION_EXPERIENCE_KEY))
    .groupBy(experimentEvents.variant, experimentEvents.eventName);
  return rows;
}

async function resolveAssignment(env: AppBindings, experiment: Experiment, userId: string) {
  const existing = await getDb(env).query.experimentAssignments.findFirst({
    where: and(
      eq(experimentAssignments.experimentKey, GENERATION_EXPERIENCE_KEY),
      eq(experimentAssignments.userId, userId)
    )
  });
  if (existing) return existing.variant;
  if (experiment.status !== "running") return "A";
  const variant =
    stableBucket(`${userId}:${experiment.key}:${experiment.salt}`) < experiment.trafficPercent
      ? "B"
      : "A";
  const timestamp = now();
  await getDb(env)
    .insert(experimentAssignments)
    .values({
      id: newId("expasn"),
      experimentKey: GENERATION_EXPERIENCE_KEY,
      userId,
      variant,
      manualOverride: false,
      assignedAt: timestamp,
      updatedAt: timestamp
    });
  return variant;
}

function stableBucket(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

function experience(
  strategy: ExperimentStrategy,
  variant: ExperimentVariant,
  status: ExperimentStatus,
  showLegacy: boolean,
  showAi: boolean
): GenerationExperience {
  return {
    experimentKey: GENERATION_EXPERIENCE_KEY,
    status,
    strategy,
    variant,
    navTarget: variant === "B" || strategy === "force_ai" ? "/ai-image" : "/workspace",
    showLegacy,
    showAi
  };
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

export function sanitizeExperimentEventMetadata(value: Record<string, unknown>) {
  const blocked = new Set(["prompt", "finalPrompt", "apiKey", "referenceImage", "referenceImages"]);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.has(key)) continue;
    if (typeof item === "string") output[key] = item.slice(0, 160);
    else if (typeof item === "number" || typeof item === "boolean" || item === null)
      output[key] = item;
  }
  return output;
}
