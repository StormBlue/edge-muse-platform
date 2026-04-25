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
const TASK_RECOVERY_THROTTLE_KEY = "tasks:interrupted-recovery";
const TASK_RECOVERY_THROTTLE_SECONDS = 60;

export type ActiveGenerationTask = {
  taskId: string;
  sessionId: string;
  messageId: string;
  status: "queued" | "running";
  queuedAt: number;
  startedAt: number | null;
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
        OR (status = 'running' AND (started_at IS NULL OR started_at <= ?1))
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
  notify: (event: TaskEvent) => Promise<void> = async () => undefined
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
  await db.update(messages).set({ status: "running" }).where(eq(messages.id, task.messageId));
  await notify({ type: "task.update", task: { id: taskId, status: "running", progress: 0.1 } });

  try {
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
    const generateOne = async (index: number) => {
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
      const generatedImages: ImageAttachment[] = [];
      const generatedRawResponses = [redactProviderResponse(response.raw)];
      for (const providerImage of response.images) {
        const stored = await persistProviderImage(env, {
          image: providerImage,
          ownerUserId: task.userId,
          sessionId: task.sessionId,
          taskId
        });
        const attachment = { ...stored, prompt: params.prompt };
        generatedImages.push(attachment);
        await notify({
          type: "task.image",
          task: { id: taskId, status: "running" },
          image: attachment
        });
      }
      if (response.images.length === 0 && response.text) {
        generatedRawResponses.push({ text: response.text });
      }
      completedGenerations += 1;
      await notify({
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
        images: generatedImages
      };
    };

    const generationResults =
      params.n === 1
        ? [await generateOne(0)]
        : await collectParallelGenerationResults(
            Array.from({ length: params.n }, (_, index) => generateOne(index))
          );

    for (const result of generationResults.sort((left, right) => left.index - right.index)) {
      if (result.requestId) requestIds.push(result.requestId);
      rawResponses.push(...result.rawResponses);
      if (result.textResponse) textResponses.push(result.textResponse);
      images.push(...result.images);
    }

    const finishedAt = now();
    logSlowTask(taskId, startedAt, finishedAt);
    await db
      .update(tasks)
      .set({
        status: "succeeded",
        finishedAt,
        providerRequestId: requestIds.length ? requestIds.join(",") : null,
        providerRawResponse: stringifyJson(rawResponses)
      })
      .where(eq(tasks.id, taskId));
    await db
      .update(messages)
      .set({
        status: "succeeded",
        prompt: textResponses.join("\n\n") || params.prompt,
        attachments: stringifyJson(images)
      })
      .where(eq(messages.id, task.messageId));
    await notify({ type: "task.done", task: { id: taskId, status: "succeeded" }, images });
  } catch (error) {
    logSlowTask(taskId, startedAt, now());
    const message = error instanceof Error ? error.message : "Generation failed";
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code) : "PROVIDER_ERROR";
    await db
      .update(tasks)
      .set({
        status: "failed",
        errorCode: code,
        errorMsg: message,
        finishedAt: now()
      })
      .where(eq(tasks.id, taskId));
    await db
      .update(messages)
      .set({ status: "failed", attachments: stringifyJson([]) })
      .where(eq(messages.id, task.messageId));
    if (code !== "PROVIDER_ERROR") await refundQuota(env, task.userId, params.n, taskId);
    await notify({
      type: "task.failed",
      task: { id: taskId, status: "failed" },
      error: { code, message }
    });
  }
}

function logSlowTask(taskId: string, startedAt: number, finishedAt: number): void {
  const durationMs = finishedAt - startedAt;
  if (durationMs <= 120_000) return;
  console.warn(JSON.stringify({ event: "task.slow", taskId, durationMs }));
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
         finished_at = NULL,
         error_code = NULL,
         error_msg = NULL
     WHERE id = ?2
       AND (
         status = 'queued'
         OR (status = 'running' AND (started_at IS NULL OR started_at <= ?3))
       )`
  )
    .bind(startedAt, taskId, staleBefore)
    .run();
  return (result.meta.changes ?? 0) > 0;
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

async function collectParallelGenerationResults<T>(jobs: Array<Promise<T>>): Promise<T[]> {
  const settled = await Promise.allSettled(jobs);
  const failed = settled.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return settled.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
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
