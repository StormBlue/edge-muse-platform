/**
 * 生成入口 A/B 实验。
 *
 * MVP 只实现固定实验 `generation_experience`，避免把项目过早抽象成通用实验平台。
 */
import { and, desc, eq, gte, lte } from "drizzle-orm";
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
import { appError } from "./errors";
import { newId, now } from "./id";
import { parseJson, stringifyJson } from "./json";
import type { AppBindings, AuthUser } from "../types";

export const GENERATION_EXPERIENCE_KEY = "generation_experience";
export const GENERATION_METRICS_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const SERVER_GENERATE_SUBMIT_SOURCE = "server_generate";
const SERVER_RETRY_SUBMIT_SOURCE = "server_retry";
const SERVER_TASK_TERMINAL_SOURCE = "server_task_terminal";

export const experimentPatchSchema = z.object({
  status: z.enum(["draft", "running", "paused", "archived"]),
  strategy: z.enum(["parallel", "force_legacy", "force_ai", "ab_test"]),
  trafficPercent: z.number().int().min(0).max(100),
  scope: z.record(z.string(), z.unknown()).default({})
});

const experimentEventNames = [
  "generation_entry_exposed",
  "generation_page_opened",
  "prompt_case_selected",
  "assistant_started",
  "assistant_prompt_filled",
  "generate_submitted",
  "generate_succeeded",
  "generate_failed",
  "variant_switched_directly"
] as const;

const clientExperimentEventNames = [
  "generation_entry_exposed",
  "generation_page_opened",
  "prompt_case_selected",
  "assistant_started",
  "assistant_prompt_filled",
  "variant_switched_directly"
] as const;

export const experimentEventSchema = z.object({
  eventName: z.enum(experimentEventNames),
  route: z.string().trim().max(120).optional(),
  caseId: z.string().trim().max(120).optional(),
  taskId: z.string().trim().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const clientExperimentEventSchema = z
  .object({
    eventName: z.enum(clientExperimentEventNames),
    route: z.string().trim().max(120).optional(),
    caseId: z.string().trim().max(120).optional(),
    metadata: z.record(z.string(), z.unknown()).default({})
  })
  .strict();

export type ExperimentStrategy = z.infer<typeof experimentPatchSchema>["strategy"];
export type ExperimentStatus = z.infer<typeof experimentPatchSchema>["status"];
export type ExperimentVariant = "A" | "B" | "parallel" | "sysadmin";
export type TaskResultExperimentEventName = Extract<
  z.infer<typeof experimentEventSchema>["eventName"],
  "generate_succeeded" | "generate_failed"
>;
export type GenerationExperimentMetric = { variant: string; eventName: string; count: number };
export type GenerationExperimentMetricsWindow = {
  since: number;
  until: number;
  days: number;
};
export type GenerationExperimentAssignmentOverride = {
  userId: string;
  username: string;
  email: string;
  nickname: string;
  variant: "A" | "B";
  manualOverride: boolean;
  assignedAt: number;
  updatedAt: number;
};

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

async function ensureGenerationExperimentRow(env: AppBindings, actorId: string) {
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
      if (existing === "B" || existing === "A")
        return abTestExperience(existing, experiment.status);
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

export async function recordExperimentEvent(
  env: AppBindings,
  user: AuthUser,
  input: z.infer<typeof experimentEventSchema>,
  options: { trustedTaskResultEvent?: boolean } = {}
) {
  const submitted = isTaskResultEvent(input.eventName)
    ? await findSubmittedEventSnapshot(env, user.id, input.taskId)
    : null;
  if (isTaskResultEvent(input.eventName) && input.taskId) {
    const existing = options.trustedTaskResultEvent
      ? await findExistingServerTaskResultEvent(env, user.id, input.taskId, input.eventName)
      : await findExistingTaskResultEvent(env, user.id, input.taskId, input.eventName);
    if (existing) return;
  }
  const attribution = await resolveEventAttribution(env, user, input, submitted);
  const metadata =
    isTaskResultEvent(input.eventName) && submitted
      ? {
          ...submitted.metadata,
          ...input.metadata,
          ...attribution.metadata
        }
      : { ...input.metadata, ...attribution.metadata };
  if (
    input.eventName === "generate_submitted" &&
    metadata.directAccess !== true &&
    isDirectAccessGenerateRoute(attribution.variant, input.route)
  ) {
    metadata.directAccess = true;
  }
  await getDb(env)
    .insert(experimentEvents)
    .values({
      id: newId("expevt"),
      experimentKey: GENERATION_EXPERIENCE_KEY,
      userId: user.id,
      variant: attribution.variant,
      eventName: input.eventName,
      route: input.route ?? submitted?.route ?? null,
      caseId: input.caseId ?? submitted?.caseId ?? null,
      taskId: input.taskId ?? null,
      metadata: stringifyJson(sanitizeExperimentEventMetadata(metadata)),
      isSysadminPreview: user.role === "sysadmin",
      createdAt: now()
    });
}

export async function recordTaskResultExperimentEvent(
  env: AppBindings,
  input: {
    userId: string;
    taskId: string;
    eventName: TaskResultExperimentEventName;
    metadata?: Record<string, unknown>;
  }
) {
  // 只有带提交事件的任务才写服务端终态事件；避免历史任务产生无法归因的孤立结果指标。
  const submitted = await findSubmittedEventSnapshot(env, input.userId, input.taskId);
  if (!submitted) return;
  const user = await findExperimentAuthUser(env, input.userId);
  if (!user) return;
  await recordExperimentEvent(
    env,
    user,
    {
      eventName: input.eventName,
      taskId: input.taskId,
      metadata: {
        ...input.metadata,
        resultEventSource: SERVER_TASK_TERMINAL_SOURCE
      }
    },
    { trustedTaskResultEvent: true }
  );
}

export async function recordRetrySubmittedExperimentEvent(
  env: AppBindings,
  input: {
    userId: string;
    sourceTaskId: string;
    taskId: string;
    route?: string;
    caseId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  // AI 图像生成 A/B 默认漏斗不包含连续对话；chat 重试不写入本实验指标。
  if (input.metadata?.mode === "chat") return;
  const user = await findExperimentAuthUser(env, input.userId);
  if (!user) return;
  const sourceSubmitted = await findSubmittedEventSnapshot(env, input.userId, input.sourceTaskId);
  const metadata: Record<string, unknown> = {
    ...input.metadata,
    // 重试血缘由服务端任务行决定，不能被前端 metadata 覆盖。
    isRetry: true,
    retryOf: input.sourceTaskId,
    submitEventSource: SERVER_RETRY_SUBMIT_SOURCE
  };

  if (!sourceSubmitted) {
    await recordExperimentEvent(env, user, {
      eventName: "generate_submitted",
      route: input.route,
      caseId: input.caseId,
      taskId: input.taskId,
      metadata: {
        ...metadata,
        attributionFallback: true,
        attributionSource: "current_assignment"
      }
    });
    return;
  }

  // 重试任务继承源任务的提交快照，避免实验暂停或切换后把同一条用户旅程拆到另一个变体。
  await getDb(env)
    .insert(experimentEvents)
    .values({
      id: newId("expevt"),
      experimentKey: GENERATION_EXPERIENCE_KEY,
      userId: user.id,
      variant: sourceSubmitted.variant,
      eventName: "generate_submitted",
      route: sourceSubmitted.route ?? input.route ?? null,
      caseId: sourceSubmitted.caseId ?? input.caseId ?? null,
      taskId: input.taskId,
      metadata: stringifyJson(
        sanitizeExperimentEventMetadata({
          ...metadata,
          ...(metadata.directAccess === true || sourceSubmitted.metadata.directAccess === true
            ? { directAccess: true }
            : {}),
          attributionSource: "retry_of_generate_submitted"
        })
      ),
      isSysadminPreview: user.role === "sysadmin",
      createdAt: now()
    });
}

async function resolveEventAttribution(
  env: AppBindings,
  user: AuthUser,
  input: z.infer<typeof experimentEventSchema>,
  submitted: SubmittedEventSnapshot | null
): Promise<{ variant: ExperimentVariant; metadata: Record<string, unknown> }> {
  if (user.role === "sysadmin") return { variant: "sysadmin", metadata: {} };

  if (isTaskResultEvent(input.eventName) && submitted) {
    return {
      variant: submitted.variant,
      metadata: { attributionSource: "generate_submitted" }
    };
  }

  const assignment = await getGenerationExperienceForUser(env, user);
  return {
    variant: assignment.variant,
    metadata: isTaskResultEvent(input.eventName)
      ? { attributionFallback: true, attributionSource: "current_assignment" }
      : {}
  };
}

function isTaskResultEvent(
  eventName: z.infer<typeof experimentEventSchema>["eventName"]
): eventName is TaskResultExperimentEventName {
  return eventName === "generate_succeeded" || eventName === "generate_failed";
}

type SubmittedEventSnapshot = {
  variant: ExperimentVariant;
  route: string | null;
  caseId: string | null;
  metadata: Record<string, unknown>;
};

async function findSubmittedEventSnapshot(
  env: AppBindings,
  userId: string,
  taskId?: string
): Promise<SubmittedEventSnapshot | null> {
  if (!taskId) return null;
  const submittedRows = await getDb(env)
    .select({
      variant: experimentEvents.variant,
      route: experimentEvents.route,
      caseId: experimentEvents.caseId,
      metadata: experimentEvents.metadata
    })
    .from(experimentEvents)
    .where(
      and(
        eq(experimentEvents.experimentKey, GENERATION_EXPERIENCE_KEY),
        eq(experimentEvents.userId, userId),
        eq(experimentEvents.taskId, taskId),
        eq(experimentEvents.eventName, "generate_submitted")
      )
    )
    .orderBy(desc(experimentEvents.createdAt));
  const submitted = submittedRows.find((row) =>
    isTrustedSubmittedMetadata(parseJson<Record<string, unknown>>(row.metadata, {}))
  );
  if (!submitted) return null;
  const metadata = parseJson<Record<string, unknown>>(submitted.metadata, {});
  return {
    variant: submitted.variant as ExperimentVariant,
    route: submitted.route,
    caseId: submitted.caseId,
    metadata
  };
}

async function findExistingTaskResultEvent(
  env: AppBindings,
  userId: string,
  taskId: string,
  eventName: TaskResultExperimentEventName
) {
  return getDb(env).query.experimentEvents.findFirst({
    where: and(
      eq(experimentEvents.experimentKey, GENERATION_EXPERIENCE_KEY),
      eq(experimentEvents.userId, userId),
      eq(experimentEvents.taskId, taskId),
      eq(experimentEvents.eventName, eventName)
    )
  });
}

async function findExistingServerTaskResultEvent(
  env: AppBindings,
  userId: string,
  taskId: string,
  eventName: TaskResultExperimentEventName
) {
  const rows = await getDb(env)
    .select({ metadata: experimentEvents.metadata })
    .from(experimentEvents)
    .where(
      and(
        eq(experimentEvents.experimentKey, GENERATION_EXPERIENCE_KEY),
        eq(experimentEvents.userId, userId),
        eq(experimentEvents.taskId, taskId),
        eq(experimentEvents.eventName, eventName)
      )
    );
  return rows.find((row) => isServerTaskResultMetadata(row.metadata));
}

async function findExperimentAuthUser(env: AppBindings, userId: string): Promise<AuthUser | null> {
  const row = await getDb(env).query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      email: true,
      username: true,
      nickname: true,
      role: true,
      status: true,
      preferredProviderKeyId: true
    }
  });
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    preferredProviderKeyId: row.preferredProviderKeyId
  };
}

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
    if (!shouldCountMetricEvent(row.eventName, metadata)) continue;
    const eventName = metricEventName(row.eventName, metadata);
    incrementMetric(metrics, row.variant, eventName);
  }
  return [...metrics.values()].sort((left, right) =>
    `${left.variant}:${left.eventName}`.localeCompare(`${right.variant}:${right.eventName}`)
  );
}

function shouldCountMetricEvent(eventName: string, metadata: Record<string, unknown>) {
  if (isGenerateMetricEventName(eventName) && metadata.directAccess === true) {
    return false;
  }
  if (eventName === "generate_succeeded" || eventName === "generate_failed") {
    return metadata.resultEventSource === SERVER_TASK_TERMINAL_SOURCE;
  }
  return true;
}

function isDirectAccessGenerateRoute(variant: ExperimentVariant, route?: string) {
  if (variant === "A") return route === "/ai-image";
  if (variant === "B") return route === "/workspace";
  return false;
}

function metricEventName(eventName: string, metadata: Record<string, unknown>) {
  if (!isGenerateMetricEventName(eventName)) return eventName;
  if (metadata.isRetry === true) return retryMetricName(eventName);
  if (metadata.mode === "chat") return `chat_${eventName}`;
  return eventName;
}

function isGenerateMetricEventName(
  eventName: string
): eventName is "generate_submitted" | "generate_succeeded" | "generate_failed" {
  return (
    eventName === "generate_submitted" ||
    eventName === "generate_succeeded" ||
    eventName === "generate_failed"
  );
}

function retryMetricName(
  eventName: "generate_submitted" | "generate_succeeded" | "generate_failed"
) {
  if (eventName === "generate_submitted") return "generate_retry_submitted";
  if (eventName === "generate_succeeded") return "generate_retry_succeeded";
  return "generate_retry_failed";
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

function isTrustedSubmittedMetadata(metadata: Record<string, unknown>) {
  if (metadata.submitEventSource === undefined) return true;
  return (
    metadata.submitEventSource === SERVER_GENERATE_SUBMIT_SOURCE ||
    metadata.submitEventSource === SERVER_RETRY_SUBMIT_SOURCE
  );
}

function isServerTaskResultMetadata(rawMetadata: string) {
  const metadata = parseJson<Record<string, unknown>>(rawMetadata, {});
  return metadata.resultEventSource === SERVER_TASK_TERMINAL_SOURCE;
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
