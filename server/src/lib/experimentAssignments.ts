import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { experimentAssignments, experiments, users, type Experiment } from "../db/schema";
import { isInGenerationExperimentScope } from "./experimentScope";
import { appError } from "./errors";
import { ensureGenerationExperimentRow } from "./experimentCore";
import { GENERATION_EXPERIENCE_KEY } from "./generationExperimentConstants";
import { newId, now } from "./id";
import { parseJson } from "./json";
import type { AppBindings, AuthUser } from "../types";
import type {
  ExperimentStatus,
  ExperimentStrategy,
  ExperimentVariant,
  GenerationExperience,
  GenerationExperimentAssignmentOverride
} from "./experimentTypes";

export async function listGenerationExperimentAssignmentOverrides(
  env: AppBindings
): Promise<GenerationExperimentAssignmentOverride[]> {
  return getDb(env)
    .select({
      userId: experimentAssignments.userId,
      username: users.username,
      email: users.email,
      nickname: users.nickname,
      variant: experimentAssignments.variant,
      manualOverride: experimentAssignments.manualOverride,
      assignedAt: experimentAssignments.assignedAt,
      updatedAt: experimentAssignments.updatedAt
    })
    .from(experimentAssignments)
    .innerJoin(users, eq(users.id, experimentAssignments.userId))
    .where(
      and(
        eq(experimentAssignments.experimentKey, GENERATION_EXPERIENCE_KEY),
        eq(experimentAssignments.manualOverride, true)
      )
    )
    .orderBy(desc(experimentAssignments.updatedAt));
}

export async function setGenerationExperimentAssignmentOverride(
  env: AppBindings,
  actorId: string,
  input: { userId: string; variant: "A" | "B" }
) {
  const targetUser = await getDb(env).query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: { id: true, role: true }
  });
  if (!targetUser || targetUser.role === "sysadmin") {
    throw appError("NOT_FOUND", "Experiment target user not found");
  }
  await ensureGenerationExperimentRow(env, actorId);
  const timestamp = now();
  const existing = await findExistingAssignmentRow(env, input.userId);
  if (existing) {
    await getDb(env)
      .update(experimentAssignments)
      .set({
        variant: input.variant,
        manualOverride: true,
        updatedAt: timestamp
      })
      .where(eq(experimentAssignments.id, existing.id));
  } else {
    await getDb(env)
      .insert(experimentAssignments)
      .values({
        id: newId("expasn"),
        experimentKey: GENERATION_EXPERIENCE_KEY,
        userId: input.userId,
        variant: input.variant,
        manualOverride: true,
        assignedAt: timestamp,
        updatedAt: timestamp
      });
  }
  const assignment = await findAssignmentOverride(env, input.userId);
  if (!assignment) throw appError("INTERNAL", "Experiment assignment override was not saved");
  return assignment;
}

export async function clearGenerationExperimentAssignmentOverride(
  env: AppBindings,
  userId: string
) {
  const existing = await findExistingAssignmentRow(env, userId);
  if (!existing?.manualOverride) return false;
  const experiment = await getDb(env).query.experiments.findFirst({
    where: eq(experiments.key, GENERATION_EXPERIENCE_KEY)
  });
  const variant =
    experiment?.strategy === "ab_test"
      ? variantForExperiment(experiment, userId)
      : existing.variant;
  await getDb(env)
    .update(experimentAssignments)
    .set({ variant, manualOverride: false, updatedAt: now() })
    .where(eq(experimentAssignments.id, existing.id));
  return true;
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
  if (!experiment) {
    return experience("parallel", "parallel", "draft", true, true);
  }
  if (experiment.status === "draft" || experiment.status === "archived") {
    return experience("parallel", "parallel", experiment.status, true, true);
  }
  if (experiment.strategy === "ab_test") {
    const existing = await findExistingAssignmentRow(env, user.id);
    if (existing?.manualOverride) return abTestExperience(existing.variant, experiment.status);
  }
  if (!(await userMatchesExperimentScope(env, experiment, user))) {
    return experience("parallel", "parallel", experiment.status, true, true);
  }
  if (experiment.status === "paused") {
    if (experiment.strategy === "ab_test") {
      const existing = await findExistingAssignment(env, user.id);
      if (existing === "B" || existing === "A") {
        return abTestExperience(existing, experiment.status);
      }
    }
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
  return abTestExperience(assignment, experiment.status);
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

async function resolveAssignment(env: AppBindings, experiment: Experiment, userId: string) {
  const existing = await findExistingAssignmentRow(env, userId);
  if (existing?.manualOverride) return existing.variant;
  if (experiment.status !== "running") return existing?.variant ?? "A";
  const variant = variantForExperiment(experiment, userId);
  const timestamp = now();
  if (existing) {
    if (existing.variant !== variant) {
      await getDb(env)
        .update(experimentAssignments)
        .set({ variant, updatedAt: timestamp })
        .where(eq(experimentAssignments.id, existing.id));
    }
    return variant;
  }
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

async function findExistingAssignment(env: AppBindings, userId: string) {
  const existing = await findExistingAssignmentRow(env, userId);
  return existing?.variant ?? null;
}

async function findExistingAssignmentRow(env: AppBindings, userId: string) {
  const existing = await getDb(env).query.experimentAssignments.findFirst({
    where: and(
      eq(experimentAssignments.experimentKey, GENERATION_EXPERIENCE_KEY),
      eq(experimentAssignments.userId, userId)
    )
  });
  return existing ?? null;
}

async function findAssignmentOverride(
  env: AppBindings,
  userId: string
): Promise<GenerationExperimentAssignmentOverride | null> {
  const rows = await getDb(env)
    .select({
      userId: experimentAssignments.userId,
      username: users.username,
      email: users.email,
      nickname: users.nickname,
      variant: experimentAssignments.variant,
      manualOverride: experimentAssignments.manualOverride,
      assignedAt: experimentAssignments.assignedAt,
      updatedAt: experimentAssignments.updatedAt
    })
    .from(experimentAssignments)
    .innerJoin(users, eq(users.id, experimentAssignments.userId))
    .where(
      and(
        eq(experimentAssignments.experimentKey, GENERATION_EXPERIENCE_KEY),
        eq(experimentAssignments.userId, userId),
        eq(experimentAssignments.manualOverride, true)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

function variantForExperiment(experiment: Experiment, userId: string) {
  return stableBucket(`${userId}:${experiment.key}:${experiment.salt}`) < experiment.trafficPercent
    ? "B"
    : "A";
}

function stableBucket(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

function abTestExperience(variant: "A" | "B", status: ExperimentStatus) {
  return variant === "B"
    ? experience("ab_test", "B", status, false, true)
    : experience("ab_test", "A", status, true, false);
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
