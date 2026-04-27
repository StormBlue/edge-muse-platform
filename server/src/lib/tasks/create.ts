import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  messages,
  providers,
  sessions,
  tasks,
  users,
  type Session as SessionRow
} from "../../db/schema";
import { appError } from "../errors";
import { isSingleActiveGenerationRole, resolveImageCountForRole } from "../generationPolicy";
import { newId, now } from "../id";
import { parseJson, stringifyJson } from "../json";
import { logInfo, promptSummary } from "../log";
import { resolveProviderKey } from "../providerKeys";
import { tryConsumeQuota } from "../quota";
import { defaultSessionTitle } from "../sessionTitle";
import { getProvider } from "../../providers/registry";
import { assertProviderSupportsGenerateParams } from "./providerParams";
import { assertReferenceImagesAccessible, attachReferenceImagesToTask } from "./references";
import type { AppBindings, GenerateParams, UserRole } from "../../types";
import type { ActiveGenerationTask } from "./types";

/**
 * 当前用户是否有一条 queued/running 任务；用于侧栏「进行中」与 `assertNoActiveGenerationTask`。
 */
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

/**
 * 普通用户/管理员同时只允许一个进行中的生图；sysadmin 直接放行。冲突时 409 并带 `activeGeneration` 详情。
 */
export async function assertNoActiveGenerationTask(
  env: AppBindings,
  input: { userId: string; role: UserRole }
): Promise<void> {
  if (!isSingleActiveGenerationRole(input.role)) return;
  const activeGeneration = await findActiveGenerationTaskForUser(env, input.userId);
  if (!activeGeneration) return;
  throw appError("CONFLICT", "A generation task is already running", { activeGeneration });
}

/**
 * 创建生图任务（同步路径）：插入会话（若新会话）、用户消息、助手消息、任务行，并扣配额。
 * 不调用第三方、不持锁等待；真正生图在 `startGenerateTask` → `runGenerateTask`。
 */
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
  logInfo("task.create.started", {
    userId: input.userId,
    sessionId: input.sessionId ?? null,
    retryOf: input.retryOf ?? null,
    mode: input.params.mode,
    size: input.params.size,
    requestedImageCount: input.params.n,
    referenceImageCount: input.params.referenceImageIds?.length ?? 0,
    ...promptSummary(input.params.prompt)
  });
  const user = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
  if (!user) throw appError("UNAUTHORIZED", "User missing");
  await assertNoActiveGenerationTask(env, { userId: user.id, role: user.role });
  const referenceImageIds =
    input.params.mode === "image2image" ? [...new Set(input.params.referenceImageIds ?? [])] : [];
  if (input.params.mode === "image2image" && referenceImageIds.length === 0) {
    throw appError("VALIDATION_ERROR", "Reference image required for image-to-image");
  }
  await assertReferenceImagesAccessible(env, {
    ownerUserId: input.userId,
    referenceImageIds
  });
  const params = {
    ...input.params,
    n: resolveImageCountForRole(user.role, input.params.mode, input.params.n),
    referenceImageIds
  };
  const key = await resolveProviderKey(env, input.userId);
  const provider = await db.query.providers.findFirst({
    where: and(eq(providers.id, key.providerId), isNull(providers.deletedAt))
  });
  if (!provider || !provider.enabled) {
    throw appError("PROVIDER_ERROR", "Provider disabled");
  }
  const providerImpl = getProvider(provider.requestFormat);
  assertProviderSupportsGenerateParams(provider, providerImpl, params);
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
  assertReusableGenerateSession(existingSession, {
    sessionId: input.sessionId,
    userId: input.userId
  });

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
    logInfo("task.create.session_created", {
      userId: input.userId,
      sessionId,
      providerKeyId: key.id,
      mode: params.mode
    });
  } else {
    logInfo("task.create.session_reused", {
      userId: input.userId,
      sessionId,
      providerKeyId: key.id,
      mode: params.mode
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
  await attachReferenceImagesToTask(env, {
    ownerUserId: input.userId,
    sessionId,
    taskId,
    referenceImageIds
  });
  logInfo("task.create.task_inserted", {
    userId: input.userId,
    taskId,
    sessionId,
    messageId: assistantMessageId,
    providerKeyId: key.id,
    retryOf: input.retryOf ?? null,
    mode: params.mode,
    size: params.size,
    imageCount: params.n
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
  logInfo("task.create.session_updated", {
    userId: input.userId,
    taskId,
    sessionId,
    providerKeyId: key.id,
    mode: params.mode
  });

  await tryConsumeQuota(env, input.userId, params.n, taskId);
  logInfo("task.create.quota_consumed", {
    userId: input.userId,
    taskId,
    imageCount: params.n
  });

  return {
    taskId,
    sessionId,
    messageId: assistantMessageId,
    title: existingSession?.title ?? title
  };
}

/**
 * 生成任务复用会话时必须校验归属，不能只相信客户端传入的 sessionId。
 * 否则用户可把消息、任务和 provider 设置写入他人的会话，造成跨用户数据污染。
 */
export function assertReusableGenerateSession(
  session: Pick<SessionRow, "userId"> | null | undefined,
  input: { sessionId?: string; userId: string }
): void {
  if (!input.sessionId) return;
  if (!session) throw appError("NOT_FOUND", "Session not found");
  if (session.userId !== input.userId) throw appError("FORBIDDEN", "No access");
}
