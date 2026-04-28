import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { experimentEvents, users } from "../db/schema";
import {
  GENERATION_EXPERIENCE_KEY,
  SERVER_GENERATE_SUBMIT_SOURCE,
  SERVER_RETRY_SUBMIT_SOURCE,
  SERVER_TASK_TERMINAL_SOURCE
} from "./generationExperimentConstants";
import type { TaskResultExperimentEventName } from "./generationExperimentEvents";
import { parseJson } from "./json";
import type { ExperimentVariant } from "./experimentTypes";
import type { AppBindings, AuthUser } from "../types";

export type SubmittedEventSnapshot = {
  variant: ExperimentVariant;
  route: string | null;
  caseId: string | null;
  metadata: Record<string, unknown>;
};

export async function findSubmittedEventSnapshot(
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

export async function findExistingTaskResultEvent(
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

export async function findExistingServerTaskResultEvent(
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

export async function findExperimentAuthUser(
  env: AppBindings,
  userId: string
): Promise<AuthUser | null> {
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
