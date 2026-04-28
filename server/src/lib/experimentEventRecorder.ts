import { getDb } from "../db/client";
import { experimentEvents } from "../db/schema";
import { getGenerationExperienceForUser } from "./experimentAssignments";
import {
  findExistingServerTaskResultEvent,
  findExistingTaskResultEvent,
  findExperimentAuthUser,
  findSubmittedEventSnapshot,
  type SubmittedEventSnapshot
} from "./experimentEventQueries";
import type { ExperimentEventInput } from "./experimentSchemas";
import type { ExperimentVariant } from "./experimentTypes";
import {
  GENERATION_EXPERIENCE_KEY,
  SERVER_RETRY_SUBMIT_SOURCE,
  SERVER_TASK_TERMINAL_SOURCE
} from "./generationExperimentConstants";
import {
  isDirectAccessPrimaryMetricEventName,
  isTaskResultExperimentEventName,
  type TaskResultExperimentEventName
} from "./generationExperimentEvents";
import { newId, now } from "./id";
import { stringifyJson } from "./json";
import { sanitizeExperimentEventMetadata } from "./experimentEventMetadata";
import type { AppBindings, AuthUser } from "../types";

export async function recordExperimentEvent(
  env: AppBindings,
  user: AuthUser,
  input: ExperimentEventInput,
  options: { trustedTaskResultEvent?: boolean } = {}
) {
  const submitted = isTaskResultExperimentEventName(input.eventName)
    ? await findSubmittedEventSnapshot(env, user.id, input.taskId)
    : null;
  if (isTaskResultExperimentEventName(input.eventName) && input.taskId) {
    const existing = options.trustedTaskResultEvent
      ? await findExistingServerTaskResultEvent(env, user.id, input.taskId, input.eventName)
      : await findExistingTaskResultEvent(env, user.id, input.taskId, input.eventName);
    if (existing) return;
  }
  const attribution = await resolveEventAttribution(env, user, input, submitted);
  const metadata =
    isTaskResultExperimentEventName(input.eventName) && submitted
      ? {
          ...submitted.metadata,
          ...input.metadata,
          ...attribution.metadata
        }
      : { ...input.metadata, ...attribution.metadata };
  if (
    metadata.directAccess !== true &&
    isDirectAccessPrimaryMetricEventName(input.eventName) &&
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
  input: ExperimentEventInput,
  submitted: SubmittedEventSnapshot | null
): Promise<{ variant: ExperimentVariant; metadata: Record<string, unknown> }> {
  if (user.role === "sysadmin") return { variant: "sysadmin", metadata: {} };

  if (isTaskResultExperimentEventName(input.eventName) && submitted) {
    return {
      variant: submitted.variant,
      metadata: { attributionSource: "generate_submitted" }
    };
  }

  const assignment = await getGenerationExperienceForUser(env, user);
  return {
    variant: assignment.variant,
    metadata: isTaskResultExperimentEventName(input.eventName)
      ? { attributionFallback: true, attributionSource: "current_assignment" }
      : {}
  };
}

function isDirectAccessGenerateRoute(variant: ExperimentVariant, route?: string) {
  if (variant === "A") return route === "/ai-image";
  if (variant === "B") return route === "/workspace";
  return false;
}
