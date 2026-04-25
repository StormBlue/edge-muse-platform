import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  imageObjects,
  messages,
  providerKeys,
  providers,
  sessions,
  tasks,
  userProviderKeys,
  users
} from "../db/schema";
import { decryptString } from "./crypto";
import { base64ToBytes } from "./encoding";
import { appError } from "./errors";
import { isSingleActiveGenerationRole, resolveImageCountForRole } from "./generationPolicy";
import { newId, now } from "./id";
import { parseJson, stringifyJson } from "./json";
import { putImage } from "./r2";
import { refundQuota, tryConsumeQuota } from "./quota";
import { defaultSessionTitle } from "./sessionTitle";
import { getProvider } from "../providers/registry";
import type { GenerateParams, ImageAttachment, AppBindings, TaskStatus, UserRole } from "../types";
import type { GenerateRequest, ProviderImage } from "../providers/types";

const INTERRUPTED_TASK_TIMEOUT_MS = 2 * 60 * 1000;
const INTERRUPTED_TASK_RECOVERY_LIMIT = 20;
const TASK_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const DEFAULT_PARALLEL_GENERATIONS = 4;
const SYSADMIN_PARALLEL_GENERATIONS = 10;
const TASK_RECOVERY_THROTTLE_KEY = "tasks:interrupted-recovery";
const TASK_RECOVERY_THROTTLE_SECONDS = 60;

export type ActiveGenerationTask = {
  taskId: string;
  sessionId: string;
  messageId: string;
  status: "queued" | "running";
  queuedAt: number;
  startedAt: number | null;
  heartbeatAt: number | null;
  session: {
    id: string;
    title: string;
    mode: "text2image" | "image2image" | "chat";
    settings: { size: string; n: number; model?: string };
    lastMessageAt: number;
  };
};

export type TaskEvent =
  | { type: "task.update"; task: { id: string; status: TaskStatus; progress?: number } }
  | { type: "task.image"; task: { id: string; status: "running" }; image: ImageAttachment }
  | {
      type: "task.failed";
      task: { id: string; status: "failed" };
      error: { code: string; message: string };
    }
  | { type: "task.done"; task: { id: string; status: "succeeded" }; images: ImageAttachment[] };

export type TaskRecoveryResult = {
  scheduled: number;
  taskIds: string[];
  throttled: boolean;
};

type WaitUntilContext = Pick<ExecutionContext, "waitUntil">;

type RunGenerateTaskOptions = {
  retryable?: boolean;
};

type GenerationResult = {
  index: number;
  requestId?: string;
  rawResponses: unknown[];
  textResponse?: string;
  images: ProviderImage[];
};

type GenerationFailure = {
  type: "generation_failure";
  index: number;
  code: string;
  message: string;
  phase: "provider" | "persist";
  createdAt: number;
  raw?: unknown;
};

type GenerationSettledResult =
  | { ok: true; value: GenerationResult }
  | { ok: false; failure: GenerationFailure };

type TaskImageAttachment = ImageAttachment & {
  generationIndex?: number | null;
  createdAt?: number;
};

class TaskClaimLostError extends Error {
  constructor(taskId: string) {
    super(`Task claim lost: ${taskId}`);
    this.name = "TaskClaimLostError";
  }
}

export async function resolveProviderKey(env: AppBindings, userId: string) {
  const db = getDb(env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.preferredProviderKeyId) {
    const preferred = await db.query.providerKeys.findFirst({
      where: and(
        eq(providerKeys.id, user.preferredProviderKeyId),
        eq(providerKeys.enabled, true),
        isNull(providerKeys.deletedAt)
      )
    });
    if (preferred) return preferred;
  }
  const assigned = await db.query.userProviderKeys.findFirst({
    where: eq(userProviderKeys.userId, userId)
  });
  const keyId = assigned?.providerKeyId;
  if (keyId) {
    const key = await db.query.providerKeys.findFirst({
      where: and(
        eq(providerKeys.id, keyId),
        eq(providerKeys.enabled, true),
        isNull(providerKeys.deletedAt)
      )
    });
    if (key) return key;
  }
  const fallback = await db.query.providerKeys.findFirst({
    where: and(eq(providerKeys.enabled, true), isNull(providerKeys.deletedAt)),
    orderBy: desc(providerKeys.createdAt)
  });
  if (!fallback) throw appError("PROVIDER_ERROR", "No provider key configured");
  return fallback;
}

export async function findActiveGenerationTaskForUser(
  env: AppBindings,
  userId: string
): Promise<ActiveGenerationTask | null> {
  const rows = await getDb(env)
    .select({
      taskId: tasks.id,
      sessionId: tasks.sessionId,
      messageId: tasks.messageId,
      status: tasks.status,
      queuedAt: tasks.queuedAt,
      startedAt: tasks.startedAt,
      heartbeatAt: tasks.heartbeatAt,
      sessionTitle: sessions.title,
      sessionMode: sessions.mode,
      sessionSettings: sessions.settings,
      sessionLastMessageAt: sessions.lastMessageAt
    })
    .from(tasks)
    .innerJoin(sessions, eq(tasks.sessionId, sessions.id))
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.status, ["queued", "running"]),
        isNull(sessions.deletedAt)
      )
    )
    .orderBy(desc(tasks.queuedAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    taskId: row.taskId,
    sessionId: row.sessionId,
    messageId: row.messageId,
    status: row.status as "queued" | "running",
    queuedAt: row.queuedAt,
    startedAt: row.startedAt,
    heartbeatAt: row.heartbeatAt,
    session: {
      id: row.sessionId,
      title: row.sessionTitle,
      mode: row.sessionMode,
      settings: parseJson(row.sessionSettings, { size: "1024x1024", n: 1 }),
      lastMessageAt: row.sessionLastMessageAt
    }
  };
}

export async function assertNoActiveGenerationTask(
  env: AppBindings,
  input: { userId: string; role: UserRole }
): Promise<void> {
  if (!isSingleActiveGenerationRole(input.role)) return;
  const activeGeneration = await findActiveGenerationTaskForUser(env, input.userId);
  if (!activeGeneration) return;
  throw appError("CONFLICT", "A generation task is already running", { activeGeneration });
}

export function startGenerateTask(env: AppBindings, ctx: WaitUntilContext, taskId: string): void {
  const workflow = env.GEN_WORKFLOW;
  if (workflow && typeof workflow.create === "function") {
    ctx.waitUntil(
      startWorkflowGenerateTask(env, taskId).catch((error) => {
        console.error(
          JSON.stringify({
            event: "task.workflow_start_failed",
            taskId,
            message: error instanceof Error ? error.message : "Workflow start failed"
          })
        );
        return runGenerateTask(env, taskId, (event) => broadcastTaskEvent(env, taskId, event));
      })
    );
    return;
  }
  ctx.waitUntil(runGenerateTask(env, taskId, (event) => broadcastTaskEvent(env, taskId, event)));
}

export function scheduleInterruptedTaskRecovery(env: AppBindings, ctx: WaitUntilContext): void {
  ctx.waitUntil(
    recoverInterruptedGenerateTasks(env, ctx)
      .then((result) => {
        if (result.scheduled === 0) return;
        console.warn(
          JSON.stringify({
            event: "task.recovery_scheduled",
            scheduled: result.scheduled,
            taskIds: result.taskIds
          })
        );
      })
      .catch((error) => {
        console.error(
          JSON.stringify({
            event: "task.recovery_failed",
            message: error instanceof Error ? error.message : "Task recovery failed"
          })
        );
      })
  );
}

export async function recoverInterruptedGenerateTasks(
  env: AppBindings,
  ctx: WaitUntilContext,
  options: { staleMs?: number; limit?: number; throttle?: boolean } = {}
): Promise<TaskRecoveryResult> {
  const throttled = options.throttle !== false && !(await claimRecoveryWindow(env));
  if (throttled) return { scheduled: 0, taskIds: [], throttled: true };

  const staleBefore = now() - (options.staleMs ?? INTERRUPTED_TASK_TIMEOUT_MS);
  const limit = options.limit ?? INTERRUPTED_TASK_RECOVERY_LIMIT;
  const result = await env.DB.prepare(
    `SELECT id
     FROM tasks
     WHERE status = 'queued'
        OR (status = 'running' AND COALESCE(heartbeat_at, started_at, queued_at) <= ?1)
     ORDER BY queued_at ASC
     LIMIT ?2`
  )
    .bind(staleBefore, limit)
    .all<{ id: string }>();
  const taskIds = result.results.map((row) => row.id);
  for (const taskId of taskIds) {
    startGenerateTask(env, ctx, taskId);
  }
  return { scheduled: taskIds.length, taskIds, throttled: false };
}

export async function createGenerateTask(
  env: AppBindings,
  input: {
    userId: string;
    sessionId?: string;
    params: GenerateParams;
    retryOf?: string | null;
  }
) {
  const db = getDb(env);
  const timestamp = now();
  const user = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
  if (!user) throw appError("UNAUTHORIZED", "User missing");
  await assertNoActiveGenerationTask(env, { userId: user.id, role: user.role });
  const referenceImageIds =
    input.params.mode === "image2image" ? (input.params.referenceImageIds ?? []) : [];
  if (input.params.mode === "image2image" && referenceImageIds.length === 0) {
    throw appError("VALIDATION_ERROR", "Reference image required for image-to-image");
  }
  const params = {
    ...input.params,
    n: resolveImageCountForRole(user.role, input.params.mode, input.params.n),
    referenceImageIds
  };
  const key = await resolveProviderKey(env, input.userId);
  const settings = stringifyJson({
    size: params.size,
    n: params.n,
    model: params.model
  });
  const sessionId = input.sessionId ?? newId("ses");
  const title = params.title?.trim().slice(0, 80) || defaultSessionTitle(timestamp);

  const existingSession = input.sessionId
    ? await db.query.sessions.findFirst({
        where: and(eq(sessions.id, input.sessionId), isNull(sessions.deletedAt))
      })
    : null;

  if (!existingSession) {
    await db.insert(sessions).values({
      id: sessionId,
      userId: input.userId,
      title,
      mode: params.mode,
      providerKeyId: key.id,
      settings,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastMessageAt: timestamp,
      archived: false,
      deletedAt: null
    });
  }

  const userMessageId = newId("msg");
  const assistantMessageId = newId("msg");
  const taskId = newId("tsk");
  await db.insert(messages).values([
    {
      id: userMessageId,
      sessionId,
      role: "user",
      prompt: params.prompt,
      referenceImageIds: stringifyJson(referenceImageIds),
      attachments: stringifyJson([]),
      taskId: null,
      status: "succeeded",
      createdAt: timestamp,
      deletedAt: null
    },
    {
      id: assistantMessageId,
      sessionId,
      role: "assistant",
      prompt: params.prompt,
      referenceImageIds: stringifyJson([]),
      attachments: stringifyJson([]),
      taskId,
      status: "queued",
      createdAt: timestamp + 1,
      deletedAt: null
    }
  ]);
  await db.insert(tasks).values({
    id: taskId,
    sessionId,
    messageId: assistantMessageId,
    userId: input.userId,
    providerKeyId: key.id,
    status: "queued",
    mode: params.mode,
    params: stringifyJson(params),
    errorCode: null,
    errorMsg: null,
    providerRequestId: null,
    providerRawResponse: null,
    queuedAt: timestamp,
    startedAt: null,
    heartbeatAt: null,
    finishedAt: null,
    retryOf: input.retryOf ?? null
  });
  await db
    .update(sessions)
    .set({
      mode: params.mode,
      providerKeyId: key.id,
      settings,
      updatedAt: timestamp,
      lastMessageAt: timestamp
    })
    .where(eq(sessions.id, sessionId));

  await tryConsumeQuota(env, input.userId, params.n, taskId);

  return {
    taskId,
    sessionId,
    messageId: assistantMessageId,
    title: existingSession?.title ?? title
  };
}

export async function runGenerateTask(
  env: AppBindings,
  taskId: string,
  notify: (event: TaskEvent) => Promise<void> = async () => undefined,
  options: RunGenerateTaskOptions = {}
): Promise<void> {
  const db = getDb(env);
  const startedAt = now();
  const claimed = await claimGenerateTask(env, taskId, startedAt);
  if (!claimed) return;
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) return;
  const params = parseJson<GenerateParams>(task.params, {
    prompt: "",
    mode: "text2image",
    size: "1024x1024",
    n: 1
  });
  const taskUser = await db.query.users.findFirst({ where: eq(users.id, task.userId) });
  const parallelGenerations = resolveParallelGenerationsForRole(taskUser?.role ?? "user");
  const send = (event: TaskEvent) => notifyTaskEvent(taskId, notify, event);
  const stopHeartbeat = startTaskHeartbeat(env, taskId, startedAt);

  try {
    if (await recoverTaskFromPersistedImages(env, { task, params, startedAt, notify: send })) {
      return;
    }
    await db.update(messages).set({ status: "running" }).where(eq(messages.id, task.messageId));
    await send({ type: "task.update", task: { id: taskId, status: "running", progress: 0.1 } });

    const key = await db.query.providerKeys.findFirst({
      where: and(eq(providerKeys.id, task.providerKeyId), isNull(providerKeys.deletedAt))
    });
    if (!key || !key.enabled) throw appError("PROVIDER_ERROR", "Provider key disabled");
    const provider = await db.query.providers.findFirst({
      where: and(eq(providers.id, key.providerId), isNull(providers.deletedAt))
    });
    if (!provider || !provider.enabled) throw appError("PROVIDER_ERROR", "Provider disabled");
    const apiKey = await decryptString(key.encryptedKey, env.KEY_ENCRYPTION_KEY);
    const providerImpl = getProvider(provider.requestFormat);
    const referenceImageIds = params.mode === "image2image" ? (params.referenceImageIds ?? []) : [];
    const referenceImages = await loadReferenceImages(env, referenceImageIds);
    const chatMessages =
      params.mode === "chat"
        ? await buildChatMessages(env, task.sessionId, params.prompt)
        : undefined;
    const images: ImageAttachment[] = [];
    const rawResponses: unknown[] = [];
    const requestIds: string[] = [];
    const textResponses: string[] = [];
    let completedGenerations = 0;
    const generateOne = async (index: number): Promise<GenerationResult> => {
      const response = await providerImpl.generate({
        prompt: params.prompt,
        mode: params.mode,
        size: params.size,
        model: params.model ?? key.model ?? provider.defaultModel,
        apiKey,
        baseUrl: provider.baseUrl,
        referenceImages,
        messages: chatMessages
      });
      await touchTaskHeartbeat(env, taskId, startedAt);
      await assertTaskClaimCurrent(env, taskId, startedAt);
      if (params.mode !== "chat" && response.images.length === 0) {
        throw appError("PROVIDER_ERROR", "No usable image was generated");
      }
      const generatedRawResponses = [redactProviderResponse(response.raw)];
      if (response.images.length === 0 && response.text) {
        generatedRawResponses.push({ text: response.text });
      }
      completedGenerations += 1;
      await send({
        type: "task.update",
        task: {
          id: taskId,
          status: "running",
          progress: 0.1 + (completedGenerations / params.n) * 0.75
        }
      });
      return {
        index,
        requestId: response.requestId,
        rawResponses: generatedRawResponses,
        textResponse: response.images.length === 0 ? response.text : undefined,
        images: response.images
      };
    };

    const settledGenerationResults = await mapWithConcurrency(
      Array.from({ length: params.n }, (_, index) => index),
      parallelGenerations,
      async (index): Promise<GenerationSettledResult> => {
        try {
          return { ok: true, value: await generateOne(index) };
        } catch (error) {
          completedGenerations += 1;
          await touchTaskHeartbeat(env, taskId, startedAt).catch(() => undefined);
          await send({
            type: "task.update",
            task: {
              id: taskId,
              status: "running",
              progress: 0.1 + (completedGenerations / params.n) * 0.75
            }
          });
          return { ok: false, failure: generationFailureFromError(index, error, "provider") };
        }
      }
    );
    const generationResults = settledGenerationResults
      .filter((result): result is { ok: true; value: GenerationResult } => result.ok)
      .map((result) => result.value);
    const generationFailures = settledGenerationResults
      .filter((result): result is { ok: false; failure: GenerationFailure } => !result.ok)
      .map((result) => result.failure);

    for (const result of generationResults.sort((left, right) => left.index - right.index)) {
      if (result.requestId) requestIds.push(result.requestId);
      rawResponses.push({
        type: "generation_success",
        index: result.index,
        requestId: result.requestId ?? null,
        rawResponses: result.rawResponses
      });
      if (result.textResponse) textResponses.push(result.textResponse);
    }

    const providerImages = generationResults.flatMap((result) =>
      result.images.map((image) => ({ image, generationIndex: result.index }))
    );
    let persistedImages = 0;
    const persistenceFailures: GenerationFailure[] = [];
    for (const providerImage of providerImages) {
      try {
        await assertTaskClaimCurrent(env, taskId, startedAt);
        const stored = await persistProviderImage(env, {
          image: providerImage.image,
          ownerUserId: task.userId,
          sessionId: task.sessionId,
          taskId
        });
        await touchTaskHeartbeat(env, taskId, startedAt);
        const attachment = {
          ...stored,
          prompt: params.prompt,
          generationIndex: providerImage.generationIndex
        };
        images.push(attachment);
        persistedImages += 1;
        await send({
          type: "task.update",
          task: {
            id: taskId,
            status: "running",
            progress: 0.75 + (persistedImages / Math.max(providerImages.length, 1)) * 0.2
          }
        });
      } catch (error) {
        persistenceFailures.push(
          generationFailureFromError(providerImage.generationIndex, error, "persist")
        );
      }
    }

    const failures = [...generationFailures, ...persistenceFailures].sort(
      (left, right) => left.index - right.index
    );
    rawResponses.push(...failures);
    const finalStatus = failures.length ? "failed" : "succeeded";
    const errorMessage = summarizeGenerationFailures(failures);
    const errorCode = failures[0]?.code ?? null;
    const finishedAt = now();
    logSlowTask(taskId, startedAt, finishedAt);
    const finished = await finishRunningTaskIfCurrent(env, {
      taskId,
      startedAt,
      status: finalStatus,
      errorCode,
      errorMsg: errorMessage,
      finishedAt,
      providerRequestId: requestIds.length ? requestIds.join(",") : null,
      providerRawResponse: stringifyJson(rawResponses)
    });
    if (!finished) return;
    await db
      .update(messages)
      .set({
        status: finalStatus,
        prompt: textResponses.join("\n\n") || params.prompt,
        attachments: stringifyJson(images)
      })
      .where(eq(messages.id, task.messageId));
    for (const image of images) {
      await send({ type: "task.image", task: { id: taskId, status: "running" }, image });
    }
    if (finalStatus === "succeeded") {
      await send({ type: "task.done", task: { id: taskId, status: "succeeded" }, images });
    } else {
      await send({
        type: "task.failed",
        task: { id: taskId, status: "failed" },
        error: {
          code: errorCode ?? "PARTIAL_GENERATION_FAILED",
          message: errorMessage ?? "Some images failed to generate"
        }
      });
    }
  } catch (error) {
    if (error instanceof TaskClaimLostError) return;
    if (!(await isTaskClaimCurrent(env, taskId, startedAt))) return;
    if (options.retryable) {
      await cleanupTaskGeneratedImages(env, taskId);
      await releaseGenerateTaskForRetry(env, taskId, task.messageId, notify);
      throw error;
    }
    await failGenerateTask(env, taskId, error, notify, { task, params, startedAt });
  } finally {
    await stopHeartbeat();
  }
}

function logSlowTask(taskId: string, startedAt: number, finishedAt: number): void {
  const durationMs = finishedAt - startedAt;
  if (durationMs <= 120_000) return;
  console.warn(JSON.stringify({ event: "task.slow", taskId, durationMs }));
}

function resolveParallelGenerationsForRole(role: UserRole): number {
  return role === "sysadmin" ? SYSADMIN_PARALLEL_GENERATIONS : DEFAULT_PARALLEL_GENERATIONS;
}

function generationFailureFromError(
  index: number,
  error: unknown,
  phase: GenerationFailure["phase"]
): GenerationFailure {
  const code =
    error && typeof error === "object" && "code" in error ? String(error.code) : "PROVIDER_ERROR";
  const message = error instanceof Error ? error.message : "Generation failed";
  const raw =
    error && typeof error === "object" && "body" in error
      ? redactProviderResponse((error as { body?: unknown }).body)
      : undefined;
  return {
    type: "generation_failure",
    index,
    code,
    message,
    phase,
    createdAt: now(),
    ...(raw ? { raw } : {})
  };
}

function summarizeGenerationFailures(failures: GenerationFailure[]): string | null {
  if (failures.length === 0) return null;
  return failures
    .map((failure) => `#${failure.index + 1} ${failure.code}: ${failure.message}`)
    .join("\n");
}

async function recoverTaskFromPersistedImages(
  env: AppBindings,
  input: {
    task: {
      id: string;
      messageId: string;
      sessionId: string;
    };
    params: GenerateParams;
    startedAt: number;
    notify: (event: TaskEvent) => Promise<void>;
  }
): Promise<boolean> {
  const persistedImages = await loadTaskGeneratedImages(env, input.task.id, input.params.prompt);
  if (persistedImages.length === 0) return false;

  const expectedImageCount = Math.max(input.params.n, 1);
  if (persistedImages.length < expectedImageCount) {
    await cleanupTaskGeneratedImages(env, input.task.id);
    return false;
  }

  const recoveredAt = now();
  const images = persistedImages
    .slice(-expectedImageCount)
    .map((image, index) => ({ ...image, generationIndex: index }));
  const finished = await finishRunningTaskIfCurrent(env, {
    taskId: input.task.id,
    startedAt: input.startedAt,
    status: "succeeded",
    errorCode: null,
    errorMsg: null,
    finishedAt: recoveredAt,
    providerRequestId: null,
    providerRawResponse: stringifyJson([
      {
        type: "recovered_from_persisted_images",
        expectedImageCount,
        persistedImageCount: persistedImages.length,
        recoveredImageCount: images.length,
        recoveredAt
      }
    ])
  });
  if (!finished) return true;

  await cleanupTaskGeneratedImagesExcept(
    env,
    input.task.id,
    images.map((image) => image.id)
  );
  await getDb(env)
    .update(messages)
    .set({
      status: "succeeded",
      prompt: input.params.prompt,
      attachments: stringifyJson(images)
    })
    .where(eq(messages.id, input.task.messageId));
  for (const image of images) {
    await input.notify({
      type: "task.image",
      task: { id: input.task.id, status: "running" },
      image
    });
  }
  await input.notify({
    type: "task.done",
    task: { id: input.task.id, status: "succeeded" },
    images
  });
  return true;
}

async function loadTaskGeneratedImages(
  env: AppBindings,
  taskId: string,
  prompt: string
): Promise<TaskImageAttachment[]> {
  const rows = await env.DB.prepare(
    `SELECT id,
       mime,
       width,
       height,
       byte_size,
       task_id,
       session_id,
       created_at
     FROM image_objects
     WHERE task_id = ?1
       AND deleted_at IS NULL
       AND is_reference = 0
     ORDER BY created_at ASC`
  )
    .bind(taskId)
    .all<{
      id: string;
      mime: string;
      width: number | null;
      height: number | null;
      byte_size: number;
      task_id: string | null;
      session_id: string | null;
      created_at: number;
    }>();

  return rows.results.map((row, index) => ({
    id: row.id,
    url: `/api/i/${row.id}`,
    mime: row.mime,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    taskId: row.task_id,
    sessionId: row.session_id,
    prompt,
    generationIndex: index,
    createdAt: row.created_at
  }));
}

async function cleanupTaskGeneratedImagesExcept(
  env: AppBindings,
  taskId: string,
  keepImageIds: string[]
): Promise<void> {
  if (keepImageIds.length === 0) {
    await cleanupTaskGeneratedImages(env, taskId);
    return;
  }
  await env.DB.prepare(
    `UPDATE image_objects
     SET deleted_at = COALESCE(deleted_at, ?1)
     WHERE task_id = ?2
       AND deleted_at IS NULL
       AND id NOT IN (${keepImageIds.map((_, index) => `?${index + 3}`).join(",")})`
  )
    .bind(now(), taskId, ...keepImageIds)
    .run();
}

async function finishRunningTaskIfCurrent(
  env: AppBindings,
  input: {
    taskId: string;
    startedAt: number;
    status: TaskStatus;
    errorCode: string | null;
    errorMsg: string | null;
    finishedAt: number;
    providerRequestId: string | null;
    providerRawResponse: string | null;
  }
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE tasks
     SET status = ?1,
         error_code = ?2,
         error_msg = ?3,
         heartbeat_at = ?4,
         finished_at = ?4,
         provider_request_id = ?5,
         provider_raw_response = ?6
     WHERE id = ?7
       AND status = 'running'
       AND started_at = ?8`
  )
    .bind(
      input.status,
      input.errorCode,
      input.errorMsg,
      input.finishedAt,
      input.providerRequestId,
      input.providerRawResponse,
      input.taskId,
      input.startedAt
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

async function isTaskClaimCurrent(
  env: AppBindings,
  taskId: string,
  startedAt: number
): Promise<boolean> {
  const row = await env.DB.prepare("SELECT status, started_at FROM tasks WHERE id = ?1")
    .bind(taskId)
    .first<{ status: string; started_at: number | null }>();
  return row?.status === "running" && row.started_at === startedAt;
}

async function assertTaskClaimCurrent(
  env: AppBindings,
  taskId: string,
  startedAt: number
): Promise<void> {
  if (await isTaskClaimCurrent(env, taskId, startedAt)) return;
  throw new TaskClaimLostError(taskId);
}

type FailureContext = {
  task?: {
    userId: string;
    messageId: string;
    params: string;
    startedAt: number | null;
    queuedAt: number;
  };
  params?: GenerateParams;
  startedAt?: number;
};

export async function failGenerateTask(
  env: AppBindings,
  taskId: string,
  error: unknown,
  notify: (event: TaskEvent) => Promise<void> = async () => undefined,
  context: FailureContext = {}
): Promise<void> {
  const db = getDb(env);
  const task =
    context.task ?? (await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) })) ?? null;
  if (!task) return;
  const params =
    context.params ??
    parseJson<GenerateParams>(task.params, {
      prompt: "",
      mode: "text2image",
      size: "1024x1024",
      n: 1
    });
  const finishedAt = now();
  logSlowTask(taskId, context.startedAt ?? task.startedAt ?? task.queuedAt, finishedAt);
  await cleanupTaskGeneratedImages(env, taskId);
  const message = error instanceof Error ? error.message : "Generation failed";
  const code =
    error && typeof error === "object" && "code" in error ? String(error.code) : "PROVIDER_ERROR";
  await db
    .update(tasks)
    .set({
      status: "failed",
      errorCode: code,
      errorMsg: message,
      heartbeatAt: finishedAt,
      finishedAt
    })
    .where(eq(tasks.id, taskId));
  await db
    .update(messages)
    .set({ status: "failed", attachments: stringifyJson([]) })
    .where(eq(messages.id, task.messageId));
  if (code !== "PROVIDER_ERROR") await refundQuota(env, task.userId, params.n, taskId);
  await notifyTaskEvent(taskId, notify, {
    type: "task.failed",
    task: { id: taskId, status: "failed" },
    error: { code, message }
  });
}

async function notifyTaskEvent(
  taskId: string,
  notify: (event: TaskEvent) => Promise<void>,
  event: TaskEvent
): Promise<void> {
  try {
    await notify(event);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "task.notify_failed",
        taskId,
        message: error instanceof Error ? error.message : "Task notification failed"
      })
    );
  }
}

async function claimGenerateTask(
  env: AppBindings,
  taskId: string,
  startedAt: number
): Promise<boolean> {
  const staleBefore = startedAt - INTERRUPTED_TASK_TIMEOUT_MS;
  const result = await env.DB.prepare(
    `UPDATE tasks
     SET status = 'running',
         started_at = ?1,
         heartbeat_at = ?1,
         finished_at = NULL,
         error_code = NULL,
         error_msg = NULL
     WHERE id = ?2
       AND (
         status = 'queued'
         OR (status = 'running' AND COALESCE(heartbeat_at, started_at, queued_at) <= ?3)
       )`
  )
    .bind(startedAt, taskId, staleBefore)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

async function releaseGenerateTaskForRetry(
  env: AppBindings,
  taskId: string,
  messageId: string,
  notify: (event: TaskEvent) => Promise<void>
): Promise<void> {
  const db = getDb(env);
  await db
    .update(tasks)
    .set({
      status: "queued",
      heartbeatAt: null,
      startedAt: null,
      finishedAt: null,
      errorCode: null,
      errorMsg: null
    })
    .where(eq(tasks.id, taskId));
  await db
    .update(messages)
    .set({ status: "queued", attachments: stringifyJson([]) })
    .where(eq(messages.id, messageId));
  await notifyTaskEvent(taskId, notify, {
    type: "task.update",
    task: { id: taskId, status: "queued", progress: 0 }
  });
}

async function cleanupTaskGeneratedImages(env: AppBindings, taskId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE image_objects
     SET deleted_at = COALESCE(deleted_at, ?1)
     WHERE task_id = ?2 AND deleted_at IS NULL`
  )
    .bind(now(), taskId)
    .run();
}

function startTaskHeartbeat(
  env: AppBindings,
  taskId: string,
  startedAt: number
): () => Promise<void> {
  let pending = touchTaskHeartbeat(env, taskId, startedAt);
  const pulse = () => {
    pending = pending.catch(() => undefined).then(() => touchTaskHeartbeat(env, taskId, startedAt));
  };
  const interval = setInterval(pulse, TASK_HEARTBEAT_INTERVAL_MS);
  return async () => {
    clearInterval(interval);
    try {
      await pending;
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "task.heartbeat_failed",
          taskId,
          message: error instanceof Error ? error.message : "Task heartbeat failed"
        })
      );
    }
  };
}

async function touchTaskHeartbeat(
  env: AppBindings,
  taskId: string,
  startedAt: number
): Promise<void> {
  await env.DB.prepare(
    "UPDATE tasks SET heartbeat_at = ?1 WHERE id = ?2 AND status = 'running' AND started_at = ?3"
  )
    .bind(now(), taskId, startedAt)
    .run();
}

async function claimRecoveryWindow(env: AppBindings): Promise<boolean> {
  try {
    const active = await env.KV.get(TASK_RECOVERY_THROTTLE_KEY);
    if (active) return false;
    await env.KV.put(TASK_RECOVERY_THROTTLE_KEY, String(now()), {
      expirationTtl: TASK_RECOVERY_THROTTLE_SECONDS
    });
    return true;
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "task.recovery_throttle_failed",
        message: error instanceof Error ? error.message : "Task recovery throttle failed"
      })
    );
    return true;
  }
}

export async function broadcastTaskEvent(
  env: AppBindings,
  taskId: string,
  event: TaskEvent
): Promise<void> {
  if (!env.TASK_ROOM) return;
  const id = env.TASK_ROOM.idFromName(taskId);
  const stub = env.TASK_ROOM.get(id);
  await stub.updateStatus(event);
}

async function startWorkflowGenerateTask(env: AppBindings, taskId: string): Promise<void> {
  const workflow = env.GEN_WORKFLOW;
  if (!workflow) return;
  try {
    await workflow.create({ id: taskId, params: { taskId } });
    return;
  } catch {
    const instance = await workflow.get(taskId);
    const status = await instance.status();
    if (status.status === "paused") {
      await instance.resume();
      return;
    }
    if (["errored", "terminated", "complete", "unknown"].includes(status.status)) {
      await instance.restart();
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let firstError: unknown;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (firstError === undefined) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        firstError ??= error;
      }
    }
  });
  await Promise.all(workers);
  if (firstError !== undefined) throw firstError;
  return results;
}

async function buildChatMessages(
  env: AppBindings,
  sessionId: string,
  prompt: string
): Promise<NonNullable<GenerateRequest["messages"]>> {
  const rows = await getDb(env)
    .select({
      role: messages.role,
      prompt: messages.prompt,
      attachments: messages.attachments,
      status: messages.status,
      createdAt: messages.createdAt
    })
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt))
    .limit(20);
  return rows
    .reverse()
    .filter(
      (row) =>
        (row.role === "user" || row.status === "succeeded") &&
        (row.prompt || parseJson<ImageAttachment[]>(row.attachments, []).length > 0)
    )
    .slice(-12)
    .map((row) => {
      const attachments = parseJson<ImageAttachment[]>(row.attachments, []);
      const imageText =
        attachments.length > 0
          ? `\nGenerated images: ${attachments.map((image) => image.url).join(", ")}`
          : "";
      return {
        role: (row.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
        content: `${row.prompt ?? ""}${imageText}`.trim() || prompt
      };
    });
}

async function persistProviderImage(
  env: AppBindings,
  input: { image: ProviderImage; ownerUserId: string; sessionId: string; taskId: string }
): Promise<ImageAttachment> {
  if (input.image.kind === "url") {
    const response = await fetch(input.image.url);
    if (!response.ok) throw appError("PROVIDER_ERROR", "Provider image download failed");
    const bytes = new Uint8Array(await response.arrayBuffer());
    return putImage(env, {
      ownerUserId: input.ownerUserId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      bytes,
      mime: response.headers.get("Content-Type") ?? "image/png"
    });
  }
  if (input.image.kind === "base64") {
    return putImage(env, {
      ownerUserId: input.ownerUserId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      bytes: base64ToBytes(input.image.data),
      mime: input.image.mime
    });
  }
  return putImage(env, {
    ownerUserId: input.ownerUserId,
    sessionId: input.sessionId,
    taskId: input.taskId,
    bytes: input.image.bytes,
    mime: input.image.mime
  });
}

async function loadReferenceImages(env: AppBindings, imageIds: string[]) {
  if (imageIds.length === 0) return [];
  const rows = await getDb(env)
    .select()
    .from(imageObjects)
    .where(and(inArray(imageObjects.id, imageIds), isNull(imageObjects.deletedAt)));
  const images: Array<{ bytes: Uint8Array; mime: string }> = [];
  for (const row of rows) {
    const object = await env.R2.get(row.r2Key);
    if (object) images.push({ bytes: new Uint8Array(await object.arrayBuffer()), mime: row.mime });
  }
  return images;
}

function redactProviderResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const json = JSON.stringify(raw);
  if (json.length <= 16_384) return raw;
  return { truncated: true, length: json.length };
}
