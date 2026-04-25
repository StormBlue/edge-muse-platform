import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  imageObjects,
  messages,
  providerKeys,
  providers,
  sessions,
  tasks,
  userProviderKeys
} from "../db/schema";
import { decryptString } from "./crypto";
import { base64ToBytes } from "./encoding";
import { appError } from "./errors";
import { newId, now } from "./id";
import { parseJson, stringifyJson } from "./json";
import { putImage } from "./r2";
import { refundQuota, tryConsumeQuota } from "./quota";
import { getProvider } from "../providers/registry";
import type { GenerateParams, ImageAttachment, AppBindings, TaskStatus } from "../types";
import type { GenerateRequest, ProviderImage } from "../providers/types";

export type TaskEvent =
  | { type: "task.update"; task: { id: string; status: TaskStatus; progress?: number } }
  | { type: "task.image"; task: { id: string; status: "running" }; image: ImageAttachment }
  | {
      type: "task.failed";
      task: { id: string; status: "failed" };
      error: { code: string; message: string };
    }
  | { type: "task.done"; task: { id: string; status: "succeeded" }; images: ImageAttachment[] };

export async function resolveProviderKey(env: AppBindings, userId: string) {
  const db = getDb(env);
  const assigned = await db.query.userProviderKeys.findFirst({
    where: eq(userProviderKeys.userId, userId)
  });
  const keyId = assigned?.providerKeyId;
  if (keyId) {
    const key = await db.query.providerKeys.findFirst({
      where: and(eq(providerKeys.id, keyId), eq(providerKeys.enabled, true))
    });
    if (key) return key;
  }
  const fallback = await db.query.providerKeys.findFirst({
    where: eq(providerKeys.enabled, true),
    orderBy: desc(providerKeys.createdAt)
  });
  if (!fallback) throw appError("PROVIDER_ERROR", "No provider key configured");
  return fallback;
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
  const key = await resolveProviderKey(env, input.userId);
  const settings = stringifyJson({
    size: input.params.size,
    n: input.params.n,
    model: input.params.model
  });
  const sessionId = input.sessionId ?? newId("ses");
  const title = input.params.prompt.trim().slice(0, 20) || "Untitled";

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
      mode: input.params.mode,
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
      prompt: input.params.prompt,
      referenceImageIds: stringifyJson(input.params.referenceImageIds ?? []),
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
      prompt: input.params.prompt,
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
    mode: input.params.mode,
    params: stringifyJson(input.params),
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
    .set({ updatedAt: timestamp, lastMessageAt: timestamp })
    .where(eq(sessions.id, sessionId));

  await tryConsumeQuota(env, input.userId, input.params.n, taskId);

  return { taskId, sessionId, messageId: assistantMessageId };
}

export async function runGenerateTask(
  env: AppBindings,
  taskId: string,
  notify: (event: TaskEvent) => Promise<void> = async () => undefined
): Promise<void> {
  const db = getDb(env);
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task || task.status === "cancelled") return;
  const params = parseJson<GenerateParams>(task.params, {
    prompt: "",
    mode: "text2image",
    size: "1024x1024",
    n: 1
  });
  const startedAt = now();
  await db.update(tasks).set({ status: "running", startedAt }).where(eq(tasks.id, taskId));
  await db.update(messages).set({ status: "running" }).where(eq(messages.id, task.messageId));
  await notify({ type: "task.update", task: { id: taskId, status: "running", progress: 0.1 } });

  try {
    const key = await db.query.providerKeys.findFirst({
      where: eq(providerKeys.id, task.providerKeyId)
    });
    if (!key || !key.enabled) throw appError("PROVIDER_ERROR", "Provider key disabled");
    const provider = await db.query.providers.findFirst({
      where: eq(providers.id, key.providerId)
    });
    if (!provider || !provider.enabled) throw appError("PROVIDER_ERROR", "Provider disabled");
    const apiKey = await decryptString(key.encryptedKey, env.KEY_ENCRYPTION_KEY);
    const providerImpl = getProvider(provider.requestFormat);
    const referenceImages = await loadReferenceImages(env, params.referenceImageIds ?? []);
    const chatMessages =
      params.mode === "chat"
        ? await buildChatMessages(env, task.sessionId, params.prompt)
        : undefined;
    const images: ImageAttachment[] = [];
    const rawResponses: unknown[] = [];
    const requestIds: string[] = [];

    for (let index = 0; index < params.n; index += 1) {
      const response = await providerImpl.generate({
        prompt: params.prompt,
        mode: params.mode,
        size: params.size,
        model: params.model ?? provider.defaultModel,
        apiKey,
        baseUrl: provider.baseUrl,
        referenceImages,
        messages: chatMessages
      });
      if (response.requestId) requestIds.push(response.requestId);
      rawResponses.push(redactProviderResponse(response.raw));
      if (response.images.length === 0 && response.text) {
        rawResponses.push({ text: response.text });
      }
      for (const providerImage of response.images) {
        const stored = await persistProviderImage(env, {
          image: providerImage,
          ownerUserId: task.userId,
          sessionId: task.sessionId,
          taskId
        });
        const attachment = { ...stored, prompt: params.prompt };
        images.push(attachment);
        await notify({
          type: "task.image",
          task: { id: taskId, status: "running" },
          image: attachment
        });
      }
      await notify({
        type: "task.update",
        task: { id: taskId, status: "running", progress: 0.1 + ((index + 1) / params.n) * 0.75 }
      });
    }

    const finishedAt = now();
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
      .set({ status: "succeeded", attachments: stringifyJson(images) })
      .where(eq(messages.id, task.messageId));
    await notify({ type: "task.done", task: { id: taskId, status: "succeeded" }, images });
  } catch (error) {
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
