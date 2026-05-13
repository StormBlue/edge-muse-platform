import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messages, sessions, tasks, users, type Session as SessionRow } from "../../db/schema";
import { appError } from "../errors";
import { resolveImageCountForRole, resolveMaxConcurrentTasksForRole } from "../generationPolicy";
import { newId, now } from "../id";
import { parseJson, stringifyJson } from "../json";
import { logInfo, logWarn, promptSummary } from "../log";
import { resolveProviderKeyGroupForUser } from "../providerKeyGroups";
import { refundQuota, tryConsumeQuota } from "../quota";
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
 * 用户级 queued/running 任务数限制；sysadmin 直接放行。冲突时 409 并带当前活跃任务统计。
 */
export async function assertNoActiveGenerationTask(
  env: AppBindings,
  input: { userId: string; role: UserRole }
): Promise<void> {
  const user = await getDb(env).query.users.findFirst({ where: eq(users.id, input.userId) });
  const limit = resolveMaxConcurrentTasksForRole(input.role, user?.maxConcurrentTasks);
  if (limit === null) return;
  const rows = await getDb(env)
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(and(eq(tasks.userId, input.userId), inArray(tasks.status, ["queued", "running"])));
  const activeCount = rows[0]?.count ?? 0;
  if (activeCount < limit) return;
  const activeGeneration = await findActiveGenerationTaskForUser(env, input.userId);
  throw appError("CONFLICT", "Too many active generation tasks", {
    activeGeneration,
    activeCount,
    limit
  });
}

/**
 * 创建生图任务（同步路径）：校验后先预扣配额，再插入会话（若新会话）、消息与 queued 任务行。
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
  const keyGroup = await resolveProviderKeyGroupForUser(env, input.userId);
  const provider = keyGroup.provider;
  const initialProviderKeyId = keyGroup.members[0]?.providerKeyId;
  if (!initialProviderKeyId) throw appError("PROVIDER_ERROR", "No provider key configured");
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

  const userMessageId = newId("msg");
  const assistantMessageId = newId("msg");
  const taskId = newId("tsk");
  await tryConsumeQuota(env, input.userId, params.n, taskId);
  logInfo("task.create.quota_consumed", {
    userId: input.userId,
    taskId,
    imageCount: params.n
  });
  const shouldRefundQuotaOnCreateFailure = user.role !== "sysadmin";
  let messagesInserted = false;

  try {
    if (!existingSession) {
      await db.insert(sessions).values({
        id: sessionId,
        userId: input.userId,
        title,
        mode: params.mode,
        providerKeyId: initialProviderKeyId,
        providerKeyGroupId: keyGroup.group.id,
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
        providerKeyId: initialProviderKeyId,
        providerKeyGroupId: keyGroup.group.id,
        mode: params.mode
      });
    } else {
      logInfo("task.create.session_reused", {
        userId: input.userId,
        sessionId,
        providerKeyId: initialProviderKeyId,
        providerKeyGroupId: keyGroup.group.id,
        mode: params.mode
      });
    }

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
    messagesInserted = true;

    await db
      .update(sessions)
      .set({
        mode: params.mode,
        providerKeyId: initialProviderKeyId,
        providerKeyGroupId: keyGroup.group.id,
        settings,
        updatedAt: timestamp,
        lastMessageAt: timestamp
      })
      .where(eq(sessions.id, sessionId));
    logInfo("task.create.session_updated", {
      userId: input.userId,
      taskId,
      sessionId,
      providerKeyId: initialProviderKeyId,
      providerKeyGroupId: keyGroup.group.id,
      mode: params.mode
    });

    await db.insert(tasks).values({
      id: taskId,
      sessionId,
      messageId: assistantMessageId,
      userId: input.userId,
      providerKeyId: initialProviderKeyId,
      providerKeyGroupId: keyGroup.group.id,
      status: "queued",
      mode: params.mode,
      params: stringifyJson(params),
      errorCode: null,
      errorMsg: null,
      providerRequestId: null,
      providerRawResponse: null,
      queuedAt: timestamp,
      assignedAt: null,
      startedAt: null,
      heartbeatAt: null,
      finishedAt: null,
      retryOf: input.retryOf ?? null
    });
    logInfo("task.create.task_inserted", {
      userId: input.userId,
      taskId,
      sessionId,
      messageId: assistantMessageId,
      providerKeyId: initialProviderKeyId,
      providerKeyGroupId: keyGroup.group.id,
      retryOf: input.retryOf ?? null,
      mode: params.mode,
      size: params.size,
      imageCount: params.n
    });
  } catch (error) {
    if (messagesInserted) {
      await markAssistantMessageFailedAfterCreateError(env, assistantMessageId);
    }
    if (shouldRefundQuotaOnCreateFailure) {
      await refundQuotaAfterCreateError(env, input.userId, params.n, taskId);
    }
    logWarn("task.create.failed_after_quota", {
      userId: input.userId,
      taskId,
      sessionId,
      messageId: assistantMessageId,
      message: error instanceof Error ? error.message : "unknown"
    });
    throw error;
  }

  try {
    await attachReferenceImagesToTask(env, {
      ownerUserId: input.userId,
      sessionId,
      taskId,
      referenceImageIds
    });
  } catch (error) {
    logWarn("task.create.reference_attach_failed", {
      userId: input.userId,
      taskId,
      sessionId,
      referenceImageIds,
      message: error instanceof Error ? error.message : "unknown"
    });
  }

  return {
    taskId,
    sessionId,
    messageId: assistantMessageId,
    title: existingSession?.title ?? title
  };
}

async function markAssistantMessageFailedAfterCreateError(
  env: AppBindings,
  messageId: string
): Promise<void> {
  try {
    await getDb(env).update(messages).set({ status: "failed" }).where(eq(messages.id, messageId));
  } catch (error) {
    logWarn("task.create.message_rollback_failed", {
      messageId,
      message: error instanceof Error ? error.message : "unknown"
    });
  }
}

async function refundQuotaAfterCreateError(
  env: AppBindings,
  userId: string,
  amount: number,
  taskId: string
): Promise<void> {
  try {
    await refundQuota(env, userId, amount, taskId);
  } catch (error) {
    logWarn("task.create.quota_refund_failed", {
      userId,
      taskId,
      amount,
      message: error instanceof Error ? error.message : "unknown"
    });
  }
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
