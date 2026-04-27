/**
 * 生图任务域：从「建任务 / 跑任务 / 广播事件 / 失败与配额 / 断线恢复」到「多并发张数 n、图生图参考图、对话上下文」
 *
 * 与产品文档的对应关系（docs/开发需求.md）：
 * - 配额：`tryConsumeQuota` 在 `createGenerateTask` 内按「张数 n」预扣；`failGenerateTask` 在非 PROVIDER_ERROR 时 `refundQuota`（见业务规则）。
 * - 1 个任务 1 条 assistant 消息：messages.attachments 存生成结果；image_objects 存 R2 元数据。
 * - 在线推送：`TaskEvent` 类型与文档 §6.7 一致，经 `broadcastTaskEvent` 写入 DO TaskRoom。
 *
 * 全链路时序（符号，缩略）：
 *
 *   [HTTP]  Client → POST /api/generate
 *              → createGenerateTask
 *                 ├ D1: sessions + messages(用户+助手) + tasks(queued)
 *                 ├ tryConsumeQuota(user, n, taskId)
 *                 └ return { taskId, sessionId, messageId, title }
 *              → startGenerateTask
 *                 ├ 优先 GEN_WORKFLOW.create({ taskId })
 *                 └ 否则 waitUntil(runGenerateTask(..., broadcastTaskEvent))
 *
 *   [Run]  runGenerateTask
 *              → claimGenerateTask(queued → running, started_at)
 *              → 可选：recoverTaskFromPersistedImages（崩后恢复）
 *              → 并发 mapWithConcurrency：每 index 调 provider.generate → persistProviderImage(R2) → task.image 事件
 *              → finishRunningTaskIfCurrent → messages.attachments 落库 → task.done | task.failed
 *
 *   [Push]  broadcastTaskEvent
 *              → TASK_ROOM.get(idFromName(taskId)).updateStatus(event)
 *                 → WebSocket 客户端收 JSON
 */
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
import { logError, logInfo, logWarn, promptSummary, urlSummary } from "./log";
import { putImage } from "./r2";
import { refundQuota, tryConsumeQuota } from "./quota";
import { defaultSessionTitle } from "./sessionTitle";
import { getProvider } from "../providers/registry";
import type { GenerateParams, ImageAttachment, AppBindings, TaskStatus, UserRole } from "../types";
import type { GenerateRequest, ProviderImage } from "../providers/types";

/** 单任务从 started_at 起算的超时时间；DO alarm 与 sweep 用同一量级做兜底 */
const GENERATION_ATTEMPT_TIMEOUT_MS = 10 * 60 * 1000;
/** 每次恢复扫描最多「再点火」的 queued 条数，防一次 waitUntil 拖太久 */
const INTERRUPTED_TASK_RECOVERY_LIMIT = 20;
/** 任务心跳写入间隔（供超时判断与僵尸任务识别，与实现细节相关） */
const TASK_HEARTBEAT_INTERVAL_MS = 30 * 1000;
/** 普通用户多图并发槽；过大易打满 provider 速率 */
const DEFAULT_PARALLEL_GENERATIONS = 4;
/** sysadmin 可提高并发，仍受单任务 n 上限约束 */
const SYSADMIN_PARALLEL_GENERATIONS = 10;
/** KV 键：跨请求节流 `recoverInterruptedGenerateTasks`，避免流量高峰重复扫库 */
const TASK_RECOVERY_THROTTLE_KEY = "tasks:interrupted-recovery";
const TASK_RECOVERY_THROTTLE_SECONDS = 60;
/** 基64/URL 图从 provider 拉回时的重试次数与单次超时、指数退避（毫秒） */
const PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS = 6;
const PROVIDER_IMAGE_DOWNLOAD_ATTEMPT_TIMEOUT_MS = 30_000;
const PROVIDER_IMAGE_DOWNLOAD_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

/** 与 GET /sessions/active-generation 以及 DO 广播协议一致 */
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

/** WebSocket / DO 推送的离散事件（前端 `applyTaskEvent` 消费） */
export type TaskEvent =
  | { type: "task.update"; task: { id: string; status: TaskStatus; progress?: number } }
  | { type: "task.image"; task: { id: string; status: "running" }; image: ImageAttachment }
  | {
      type: "task.failed";
      task: { id: string; status: "failed" };
      error: { code: string; message: string };
    }
  | { type: "task.done"; task: { id: string; status: "succeeded" }; images: ImageAttachment[] };

/** `recoverInterruptedGenerateTasks` 的汇总，供日志与运维 */
export type TaskRecoveryResult = {
  scheduled: number;
  taskIds: string[];
  throttled: boolean;
  timedOut: {
    failed: number;
    recovered: number;
    taskIds: string[];
  };
};

type WaitUntilContext = Pick<ExecutionContext, "waitUntil">;

/** 并行槽 `mapWithConcurrency` 每一「张」的聚合结果 */
type GenerationResult = {
  index: number;
  requestId?: string;
  rawResponses: unknown[];
  textResponse?: string;
  images: TaskImageAttachment[];
  providerImageCount: number;
  persistenceFailures: GenerationFailure[];
};

/** 单张失败：来自 provider 或 R2 落库，写入最终 `provider_raw_response` 数组 */
type GenerationFailure = {
  type: "generation_failure";
  index: number;
  code: string;
  message: string;
  phase: "provider" | "persist";
  createdAt: number;
  raw?: unknown;
};

/** 单槽 settled：成功带 GenerationResult，失败只记 GenerationFailure */
type GenerationSettledResult =
  | { ok: true; value: GenerationResult }
  | { ok: false; failure: GenerationFailure };

/** 落库到 messages.attachments 与 WS 的图，可带来源槽位 generationIndex */
type TaskImageAttachment = ImageAttachment & {
  generationIndex?: number | null;
  createdAt?: number;
};

/** 本 worker 的 started_at 与 DB 已不一致，应中止写库/通知（新实例或重复执行） */
class TaskClaimLostError extends Error {
  constructor(taskId: string) {
    super(`Task claim lost: ${taskId}`);
    this.name = "TaskClaimLostError";
  }
}

/** 单轮生成超过 GENERATION_ATTEMPT_TIMEOUT_MS 仍无终态时由 DO alarm / sweep 使用 */
class TaskAttemptTimeoutError extends Error {
  readonly code = "GENERATION_TIMEOUT";

  constructor(taskId: string) {
    super(
      `Image generation did not finish within ${GENERATION_ATTEMPT_TIMEOUT_MS / 60_000} minutes`
    );
    this.name = "TaskAttemptTimeoutError";
    this.cause = { taskId };
  }
}

/**
 * 为任务解析实际使用的 `provider_keys` 行：优先系统管理员偏好的 key →
 * `user_provider_keys` 绑定 → 任意启用中的 key 回退（无人配置时报错）。
 */
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
 * 从 HTTP 202 路径「点火」：不阻塞响应。
 * - 有 `GEN_WORKFLOW`：`waitUntil` 里 `startWorkflowGenerateTask`，失败则打日志并 **inline** `runGenerateTask`。
 * - 无 Workflow：直接 `waitUntil(runGenerateTask)`，便于本地/测试环境。
 */
export function startGenerateTask(env: AppBindings, ctx: WaitUntilContext, taskId: string): void {
  const workflow = env.GEN_WORKFLOW;
  logInfo("task.dispatch.requested", { taskId, workflowConfigured: Boolean(workflow) });
  if (workflow && typeof workflow.create === "function") {
    ctx.waitUntil(
      startWorkflowGenerateTask(env, taskId).catch((error) => {
        logError("task.workflow_start_failed", error, { taskId });
        logWarn("task.dispatch.fallback_inline", { taskId });
        return runGenerateTask(env, taskId, (event) => broadcastTaskEvent(env, taskId, event));
      })
    );
    return;
  }
  logInfo("task.dispatch.inline", { taskId });
  ctx.waitUntil(runGenerateTask(env, taskId, (event) => broadcastTaskEvent(env, taskId, event)));
}

/**
 * 在 `index` 的 `fetch` 中针对生图/WS/恢复相关路径触发，异步扫描 queued 与超时 running。
 */
export function scheduleInterruptedTaskRecovery(env: AppBindings, ctx: WaitUntilContext): void {
  ctx.waitUntil(
    recoverInterruptedGenerateTasks(env, ctx)
      .then((result) => {
        if (
          result.scheduled === 0 &&
          result.timedOut.failed === 0 &&
          result.timedOut.recovered === 0
        )
          return;
        logWarn("task.recovery_scheduled", {
          scheduled: result.scheduled,
          taskIds: result.taskIds,
          timedOut: result.timedOut
        });
      })
      .catch((error) => {
        logError("task.recovery_failed", error);
      })
  );
}

/**
 * 1) KV 节流下跳过重入；2) 扫「超时未结束」的 running 任务；3) 对 queued 老任务再 `startGenerateTask` 点火。
 */
export async function recoverInterruptedGenerateTasks(
  env: AppBindings,
  ctx: WaitUntilContext,
  options: { limit?: number; throttle?: boolean } = {}
): Promise<TaskRecoveryResult> {
  const throttled = options.throttle !== false && !(await claimRecoveryWindow(env));
  const emptyTimedOut = { failed: 0, recovered: 0, taskIds: [] };
  if (throttled) return { scheduled: 0, taskIds: [], throttled: true, timedOut: emptyTimedOut };

  const limit = options.limit ?? INTERRUPTED_TASK_RECOVERY_LIMIT;
  const timedOut = await sweepTimedOutGenerateTasks(env, {
    limit,
    notify: (taskId, event) => broadcastTaskEvent(env, taskId, event)
  });
  const result = await env.DB.prepare(
    `SELECT id
     FROM tasks
     WHERE status = 'queued'
     ORDER BY queued_at ASC
     LIMIT ?1`
  )
    .bind(limit)
    .all<{ id: string }>();
  const taskIds = result.results.map((row) => row.id);
  for (const taskId of taskIds) {
    startGenerateTask(env, ctx, taskId);
  }
  return {
    scheduled: taskIds.length,
    taskIds,
    throttled: false,
    timedOut: {
      failed: timedOut.failedTaskIds.length,
      recovered: timedOut.recoveredTaskIds.length,
      taskIds: [...timedOut.failedTaskIds, ...timedOut.recoveredTaskIds]
    }
  };
}

type TimedOutTaskRow = {
  id: string;
  session_id: string;
  message_id: string;
  user_id: string;
  params: string;
  queued_at: number;
  started_at: number;
};

type TimedOutSweepResult = {
  failedTaskIds: string[];
  recoveredTaskIds: string[];
};

type TimedOutTaskResult = "failed" | "recovered" | "skipped";

/**
 * 供 DO `TaskRoom.alarm` 单点调用：若该 task 已 running 超窗则走 `settleTimedOutGenerateTask`。
 */
export async function failTimedOutGenerateTaskIfNeeded(
  env: AppBindings,
  taskId: string,
  notify: (event: TaskEvent) => Promise<void> = async () => undefined
): Promise<TimedOutTaskResult> {
  const timeoutBefore = now() - GENERATION_ATTEMPT_TIMEOUT_MS;
  const row = await env.DB.prepare(
    `SELECT id,
            session_id,
            message_id,
            user_id,
            params,
            queued_at,
            started_at
     FROM tasks
     WHERE id = ?1
       AND status = 'running'
       AND started_at IS NOT NULL
       AND started_at <= ?2`
  )
    .bind(taskId, timeoutBefore)
    .first<TimedOutTaskRow>();
  if (!row) return "skipped";
  return settleTimedOutGenerateTask(env, row, notify);
}

/** scheduled/cron 批量：找出所有超时的 running 任务并逐条结算 */
async function sweepTimedOutGenerateTasks(
  env: AppBindings,
  input: {
    limit: number;
    notify: (taskId: string, event: TaskEvent) => Promise<void>;
  }
): Promise<TimedOutSweepResult> {
  const timeoutBefore = now() - GENERATION_ATTEMPT_TIMEOUT_MS;
  const result = await env.DB.prepare(
    `SELECT id,
            session_id,
            message_id,
            user_id,
            params,
            queued_at,
            started_at
     FROM tasks
     WHERE status = 'running'
       AND started_at IS NOT NULL
       AND started_at <= ?1
     ORDER BY started_at ASC
     LIMIT ?2`
  )
    .bind(timeoutBefore, input.limit)
    .all<TimedOutTaskRow>();

  const failedTaskIds: string[] = [];
  const recoveredTaskIds: string[] = [];
  for (const row of result.results) {
    const result = await settleTimedOutGenerateTask(env, row, (event) =>
      input.notify(row.id, event)
    );
    if (result === "recovered") recoveredTaskIds.push(row.id);
    if (result === "failed") failedTaskIds.push(row.id);
  }

  if (failedTaskIds.length || recoveredTaskIds.length) {
    logWarn("task.timeout_sweep.finished", {
      failedTaskIds,
      recoveredTaskIds,
      timeoutMs: GENERATION_ATTEMPT_TIMEOUT_MS
    });
  }
  return { failedTaskIds, recoveredTaskIds };
}

/**
 * 先尝试 `recoverTaskFromPersistedImages`（Worker 已写 R2 但无终态时）；否则按超时失败并通知。
 */
async function settleTimedOutGenerateTask(
  env: AppBindings,
  row: TimedOutTaskRow,
  notify: (event: TaskEvent) => Promise<void>
): Promise<"failed" | "recovered"> {
  const task = {
    id: row.id,
    sessionId: row.session_id,
    messageId: row.message_id,
    userId: row.user_id,
    params: row.params,
    queuedAt: row.queued_at,
    startedAt: row.started_at
  };
  const params = parseJson<GenerateParams>(task.params, {
    prompt: "",
    mode: "text2image",
    size: "1024x1024",
    n: 1
  });
  const recovered = await recoverTaskFromPersistedImages(env, {
    task,
    params,
    startedAt: task.startedAt,
    notify: (event) => notifyTaskEvent(task.id, notify, event)
  });
  if (recovered) return "recovered";

  await failGenerateTask(env, task.id, new TaskAttemptTimeoutError(task.id), notify, {
    task,
    params,
    startedAt: task.startedAt,
    expectedStartedAt: task.startedAt
  });
  return "failed";
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
 * 执行生图：单 Worker 内可能长时间运行；应仅由 Workflow.step 或 `waitUntil` 调用。
 * - 使用 `started_at` 作为「这一代执行」的租约，防止重复启动或旧实例覆盖新实例（`assertTaskClaimCurrent` / `TaskClaimLostError`）。
 * - 多图 `params.n`：并发度 `resolveParallelGenerationsForRole`，每张一次 provider 调用 + 落库 + 事件。
 */
export async function runGenerateTask(
  env: AppBindings,
  taskId: string,
  notify: (event: TaskEvent) => Promise<void> = async () => undefined
): Promise<void> {
  const db = getDb(env);
  const startedAt = now();
  logInfo("task.run.claim_attempt", {
    taskId,
    startedAt
  });
  const claimed = await claimGenerateTask(env, taskId, startedAt);
  if (!claimed) {
    logWarn("task.run.claim_skipped", {
      taskId,
      startedAt,
      reason: "not_queued_or_not_stale"
    });
    return;
  }
  logInfo("task.run.claimed", { taskId, startedAt });
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) {
    logWarn("task.run.task_missing", { taskId, startedAt });
    return;
  }
  // --- 以下：解析 params、用户角色、并行度；`parallelGenerations` 仅影响墙钟，不改变 `params.n` 总张数 ---
  const params = parseJson<GenerateParams>(task.params, {
    prompt: "",
    mode: "text2image",
    size: "1024x1024",
    n: 1
  });
  const taskUser = await db.query.users.findFirst({ where: eq(users.id, task.userId) });
  const parallelGenerations = resolveParallelGenerationsForRole(taskUser?.role ?? "user");
  const baseLogFields = {
    taskId,
    sessionId: task.sessionId,
    messageId: task.messageId,
    userId: task.userId,
    providerKeyId: task.providerKeyId
  };
  logInfo("task.run.started", {
    ...baseLogFields,
    mode: params.mode,
    size: params.size,
    imageCount: params.n,
    model: params.model ?? null,
    referenceImageCount: params.referenceImageIds?.length ?? 0,
    parallelGenerations,
    queuedAt: task.queuedAt,
    startedAt,
    ...promptSummary(params.prompt)
  });
  const send = (event: TaskEvent) => notifyTaskEvent(taskId, notify, event);
  // --- 长任务过程中心跳：防外部误判僵尸；`finally` 里 stop 避免泄漏 interval ---
  const stopHeartbeat = startTaskHeartbeat(env, taskId, startedAt);

  try {
    // --- 2a. 优先崩溃恢复：若 R2/DB 已有足量生成图，直接终态+WS，不调 provider ---
    if (await recoverTaskFromPersistedImages(env, { task, params, startedAt, notify: send })) {
      logInfo("task.run.recovered_from_persisted_images", baseLogFields);
      return;
    }
    // --- 2b. 真跑：助手消息、任务更新为 running，并推首帧进度 ---
    await db.update(messages).set({ status: "running" }).where(eq(messages.id, task.messageId));
    logInfo("task.message.status_running", baseLogFields);
    await send({ type: "task.update", task: { id: taskId, status: "running", progress: 0.1 } });

    const key = await db.query.providerKeys.findFirst({
      where: and(eq(providerKeys.id, task.providerKeyId), isNull(providerKeys.deletedAt))
    });
    if (!key || !key.enabled) {
      logWarn("task.provider_key_unavailable", baseLogFields);
      throw appError("PROVIDER_ERROR", "Provider key disabled");
    }
    const provider = await db.query.providers.findFirst({
      where: and(eq(providers.id, key.providerId), isNull(providers.deletedAt))
    });
    if (!provider || !provider.enabled) {
      logWarn("task.provider_unavailable", {
        ...baseLogFields,
        providerId: key.providerId
      });
      throw appError("PROVIDER_ERROR", "Provider disabled");
    }
    const apiKey = await decryptString(key.encryptedKey, env.KEY_ENCRYPTION_KEY);
    const providerImpl = getProvider(provider.requestFormat);
    const model = params.model ?? key.model ?? provider.defaultModel;
    logInfo("task.provider.resolved", {
      ...baseLogFields,
      providerId: provider.id,
      providerName: provider.name,
      providerAdapter: providerImpl.id,
      requestFormat: provider.requestFormat,
      model,
      keyHint: key.keyHint,
      baseUrl: urlSummary(provider.baseUrl)
    });
    const referenceImageIds = params.mode === "image2image" ? (params.referenceImageIds ?? []) : [];
    const referenceImages = await loadReferenceImages(env, referenceImageIds, task.userId);
    if (params.mode === "image2image" && referenceImages.length !== referenceImageIds.length) {
      throw appError("VALIDATION_ERROR", "Reference image not found or inaccessible");
    }
    const referenceImageBytes = referenceImages.reduce((sum, image) => sum + image.bytes.length, 0);
    const referenceLog = referenceImages.length === referenceImageIds.length ? logInfo : logWarn;
    referenceLog("task.reference_images.loaded", {
      ...baseLogFields,
      requestedReferenceImageCount: referenceImageIds.length,
      loadedReferenceImageCount: referenceImages.length,
      missingReferenceImageCount: referenceImageIds.length - referenceImages.length,
      referenceImageBytes
    });
    // --- 2c. 对话模式：拼多轮 user/assistant + 已生成图 URL 摘要（见 buildChatMessages） ---
    const chatMessages =
      params.mode === "chat"
        ? await buildChatMessages(env, task.sessionId, params.prompt)
        : undefined;
    if (chatMessages) {
      logInfo("task.chat_context.built", {
        ...baseLogFields,
        messageCount: chatMessages.length,
        contentChars: chatMessages.reduce((sum, message) => sum + message.content.length, 0)
      });
    }
    // --- 3. 多图累加器：`images` 为全任务最终附件；`queueMessageAttachmentUpdate` 串行写 messages.attachments 防竞态 ---
    const images: TaskImageAttachment[] = [];
    const rawResponses: unknown[] = [];
    const requestIds: string[] = [];
    const textResponses: string[] = [];
    let completedGenerations = 0;
    let persistedImages = 0;
    let messageAttachmentUpdate = Promise.resolve();
    const queueMessageAttachmentUpdate = (reason: string): Promise<void> => {
      const attachments = sortTaskImages(images).map((image) => ({ ...image }));
      messageAttachmentUpdate = messageAttachmentUpdate
        .catch(() => undefined)
        .then(async () => {
          await db
            .update(messages)
            .set({ status: "running", attachments: stringifyJson(attachments) })
            .where(eq(messages.id, task.messageId));
          logInfo("task.message.attachments_updated", {
            ...baseLogFields,
            reason,
            imageCount: attachments.length,
            imageIds: attachments.map((image) => image.id)
          });
        });
      return messageAttachmentUpdate;
    };
    // --- 3b. 单张槽位：调 adapter.generate → 可选 persist 多张（单张 persist 失败记入 persistenceFailures 不整槽失败）---
    const generateOne = async (index: number): Promise<GenerationResult> => {
      const generationStartedAt = Date.now();
      logInfo("task.generation.started", {
        ...baseLogFields,
        providerId: provider.id,
        providerAdapter: providerImpl.id,
        requestFormat: provider.requestFormat,
        generationIndex: index,
        generationNumber: index + 1,
        totalGenerations: params.n,
        mode: params.mode,
        size: params.size,
        model,
        referenceImageCount: referenceImages.length,
        messageCount: chatMessages?.length ?? null
      });
      const response = await providerImpl.generate({
        prompt: params.prompt,
        mode: params.mode,
        size: params.size,
        model,
        apiKey,
        baseUrl: provider.baseUrl,
        referenceImages,
        messages: chatMessages,
        logContext: {
          ...baseLogFields,
          providerId: provider.id,
          requestFormat: provider.requestFormat,
          generationIndex: index
        }
      });
      logInfo("task.generation.provider_completed", {
        ...baseLogFields,
        providerId: provider.id,
        providerAdapter: providerImpl.id,
        requestFormat: provider.requestFormat,
        generationIndex: index,
        providerRequestId: response.requestId ?? null,
        imageCount: response.images.length,
        imageKinds: providerImageKindCounts(response.images),
        textLength: response.text?.length ?? 0,
        latencyMs: Date.now() - generationStartedAt
      });
      await touchTaskHeartbeat(env, taskId, startedAt);
      await assertTaskClaimCurrent(env, taskId, startedAt);
      if (params.mode !== "chat" && response.images.length === 0) {
        logWarn("task.generation.no_usable_image", {
          ...baseLogFields,
          generationIndex: index,
          providerRequestId: response.requestId ?? null,
          mode: params.mode
        });
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
      const persistedGenerationImages: TaskImageAttachment[] = [];
      const persistenceFailures: GenerationFailure[] = [];
      for (const [providerImageIndex, image] of response.images.entries()) {
        try {
          await assertTaskClaimCurrent(env, taskId, startedAt);
          logInfo("task.image.persist_started", {
            ...baseLogFields,
            generationIndex: index,
            providerImageIndex,
            providerImage: providerImageSummary(image)
          });
          const stored = await persistProviderImage(env, {
            image,
            ownerUserId: task.userId,
            sessionId: task.sessionId,
            taskId
          });
          await touchTaskHeartbeat(env, taskId, startedAt);
          const attachment: TaskImageAttachment = {
            ...stored,
            prompt: params.prompt,
            generationIndex: index
          };
          images.push(attachment);
          persistedGenerationImages.push(attachment);
          persistedImages += 1;
          await queueMessageAttachmentUpdate("image_persisted");
          await send({
            type: "task.image",
            task: { id: taskId, status: "running" },
            image: attachment
          });
          await send({
            type: "task.update",
            task: {
              id: taskId,
              status: "running",
              progress: Math.min(
                0.95,
                0.1 +
                  (completedGenerations / Math.max(params.n, 1)) * 0.75 +
                  (persistedImages / Math.max(params.n, 1)) * 0.1
              )
            }
          });
          logInfo("task.image.persisted", {
            ...baseLogFields,
            generationIndex: index,
            providerImageIndex,
            imageId: stored.id,
            mime: stored.mime,
            byteSize: stored.byteSize,
            persistedImages,
            requestedGenerations: params.n
          });
        } catch (error) {
          const failure = generationFailureFromError(index, error, "persist");
          logWarn("task.image.persist_failed", {
            ...baseLogFields,
            generationIndex: index,
            providerImageIndex,
            code: failure.code,
            message: failure.message,
            phase: failure.phase
          });
          persistenceFailures.push(failure);
        }
      }
      return {
        index,
        requestId: response.requestId,
        rawResponses: generatedRawResponses,
        textResponse: response.images.length === 0 ? response.text : undefined,
        images: persistedGenerationImages,
        providerImageCount: response.images.length,
        persistenceFailures
      };
    };

    // --- 4. 多槽并发：每 index 调 generateOne，provider 异常在槽内转 `ok: false`+failure，再汇总；与 Promise.all 不同见 `mapWithConcurrency` 注释 ---
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
          const failure = generationFailureFromError(index, error, "provider");
          logWarn("task.generation.failed", {
            ...baseLogFields,
            generationIndex: index,
            code: failure.code,
            message: failure.message,
            phase: failure.phase
          });
          return { ok: false, failure };
        }
      }
    );
    const generationResults = settledGenerationResults
      .filter((result): result is { ok: true; value: GenerationResult } => result.ok)
      .map((result) => result.value);
    const generationFailures = settledGenerationResults
      .filter((result): result is { ok: false; failure: GenerationFailure } => !result.ok)
      .map((result) => result.failure);
    // --- 5. 归并各槽成功/失败、算最终图列表、部分失败时仍可能 task 级 failed（见 finalStatus）---
    logInfo("task.generation.settled", {
      ...baseLogFields,
      requestedGenerations: params.n,
      succeededGenerations: generationResults.length,
      failedGenerations: generationFailures.length
    });

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

    const providerImageCount = generationResults.reduce(
      (count, result) => count + result.providerImageCount,
      0
    );
    const finalImages = sortTaskImages(generationResults.flatMap((result) => result.images));
    const persistenceFailures = generationResults
      .flatMap((result) => result.persistenceFailures)
      .sort((left, right) => left.index - right.index);
    logInfo("task.provider_images.collected", {
      ...baseLogFields,
      providerImageCount,
      persistedImageCount: finalImages.length,
      persistenceFailureCount: persistenceFailures.length
    });
    await messageAttachmentUpdate;

    // 合并「整槽失败」与「单张 R2 失败」；排序后写入 provider_raw_response 供排障
    const failures = [...generationFailures, ...persistenceFailures].sort(
      (left, right) => left.index - right.index
    );
    rawResponses.push(...failures);
    const finalStatus = failures.length ? "failed" : "succeeded";
    const errorMessage = summarizeGenerationFailures(failures);
    const errorCode = failures[0]?.code ?? null;
    const finishedAt = now();
    logSlowTask(taskId, startedAt, finishedAt);
    logInfo("task.finish.prepared", {
      ...baseLogFields,
      finalStatus,
      imageCount: finalImages.length,
      providerImageCount,
      failureCount: failures.length,
      providerRequestIds: requestIds,
      durationMs: finishedAt - startedAt
    });
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
    if (!finished) {
      logWarn("task.finish.claim_lost", {
        ...baseLogFields,
        finalStatus,
        startedAt,
        finishedAt
      });
      return;
    }
    logInfo("task.finish.task_updated", {
      ...baseLogFields,
      finalStatus,
      imageCount: finalImages.length,
      failureCount: failures.length,
      providerRequestIds: requestIds
    });
    await db
      .update(messages)
      .set({
        status: finalStatus,
        prompt: textResponses.join("\n\n") || params.prompt,
        attachments: stringifyJson(finalImages)
      })
      .where(eq(messages.id, task.messageId));
    logInfo("task.finish.message_updated", {
      ...baseLogFields,
      finalStatus,
      imageCount: finalImages.length,
      textResponseCount: textResponses.length
    });
    if (finalStatus === "succeeded") {
      await send({
        type: "task.done",
        task: { id: taskId, status: "succeeded" },
        images: finalImages
      });
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
    logInfo("task.finish.notified", {
      ...baseLogFields,
      finalStatus,
      imageCount: finalImages.length
    });
  } catch (error) {
    if (error instanceof TaskClaimLostError) {
      logWarn("task.run.claim_lost", baseLogFields);
      return;
    }
    if (!(await isTaskClaimCurrent(env, taskId, startedAt))) {
      logWarn("task.run.no_longer_current", baseLogFields);
      return;
    }
    logError("task.run.failed", error, baseLogFields);
    await failGenerateTask(env, taskId, error, notify, { task, params, startedAt });
  } finally {
    await stopHeartbeat();
    logInfo("task.run.heartbeat_stopped", baseLogFields);
  }
}

/** 超过 2 分钟打 warn，便于观测慢厂商或网络 */
function logSlowTask(taskId: string, startedAt: number, finishedAt: number): void {
  const durationMs = finishedAt - startedAt;
  if (durationMs <= 120_000) return;
  logWarn("task.slow", { taskId, durationMs });
}

/** sysadmin 可更高并发拉多图，降低总墙钟时间 */
function resolveParallelGenerationsForRole(role: UserRole): number {
  return role === "sysadmin" ? SYSADMIN_PARALLEL_GENERATIONS : DEFAULT_PARALLEL_GENERATIONS;
}

/** 将单次 generate 或 persist 异常转为可序列化进 `provider_raw_response` 的失败项 */
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

/** 多图部分失败时拼成一条 assistant 可读错误文案 */
function summarizeGenerationFailures(failures: GenerationFailure[]): string | null {
  if (failures.length === 0) return null;
  return failures
    .map((failure) => `#${failure.index + 1} ${failure.code}: ${failure.message}`)
    .join("\n");
}

/**
 * 崩溃恢复：若 D1 已有「本 task 足够数量」的 image_objects，则直接判成功并补发 WS，避免重复调 API。
 */
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
    logWarn("task.recovery.partial_images_found", {
      taskId: input.task.id,
      sessionId: input.task.sessionId,
      messageId: input.task.messageId,
      expectedImageCount,
      persistedImageCount: persistedImages.length
    });
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
  if (!finished) {
    logWarn("task.recovery.finish_skipped_claim_lost", {
      taskId: input.task.id,
      sessionId: input.task.sessionId,
      messageId: input.task.messageId,
      expectedImageCount,
      persistedImageCount: persistedImages.length
    });
    return true;
  }

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
  logInfo("task.recovery.succeeded", {
    taskId: input.task.id,
    sessionId: input.task.sessionId,
    messageId: input.task.messageId,
    expectedImageCount,
    persistedImageCount: persistedImages.length,
    recoveredImageCount: images.length
  });
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

/** 列出本任务已落库的非参考图（按 created_at） */
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

/** 恢复成功后软删多写的中间图，仅保留 `keepImageIds` */
async function cleanupTaskGeneratedImagesExcept(
  env: AppBindings,
  taskId: string,
  keepImageIds: string[]
): Promise<void> {
  if (keepImageIds.length === 0) {
    await cleanupTaskGeneratedImages(env, taskId);
    return;
  }
  const result = await env.DB.prepare(
    `UPDATE image_objects
     SET deleted_at = COALESCE(deleted_at, ?1)
     WHERE task_id = ?2
       AND deleted_at IS NULL
       AND is_reference = 0
       AND id NOT IN (${keepImageIds.map((_, index) => `?${index + 3}`).join(",")})`
  )
    .bind(now(), taskId, ...keepImageIds)
    .run();
  logInfo("task.images.cleanup_except_marked", {
    taskId,
    keepImageIds,
    deletedImageCount: result.meta.changes ?? 0
  });
}

/**
 * 以「running + 当前 started_at」为条件更新终态，防止旧 worker 覆盖新执行结果（changes=0 即丢租约）。
 */
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

/** 当前是否仍为同一轮 `startedAt` 的 running（用于长步骤中反复校验） */
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

/** 不成立则抛 `TaskClaimLostError`，在持久化/下载途中尽早止损 */
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
  expectedStartedAt?: number;
};

/**
 * 将任务与助手消息标为失败，清理由本任务产生但未展示的生成图，必要时**退还配额**（非 PROVIDER_ERROR 类系统失败）。
 * 并下发 `task.failed` 给 DO，前端 `applyTaskEvent` 可展示重试。
 */
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
  const message = error instanceof Error ? error.message : "Generation failed";
  const code =
    error && typeof error === "object" && "code" in error ? String(error.code) : "PROVIDER_ERROR";
  logError("task.fail.started", error, {
    taskId,
    userId: task.userId,
    messageId: task.messageId,
    code,
    mode: params.mode,
    imageCount: params.n
  });
  const persisted = await markGenerateTaskFailed(env, {
    taskId,
    code,
    message,
    finishedAt,
    expectedStartedAt: context.expectedStartedAt
  });
  if (!persisted) {
    logWarn("task.fail.skipped_not_current", {
      taskId,
      userId: task.userId,
      messageId: task.messageId,
      expectedStartedAt: context.expectedStartedAt ?? null
    });
    return;
  }
  const deletedImageCount = await cleanupTaskGeneratedImages(env, taskId);
  await db
    .update(messages)
    .set({ status: "failed", attachments: stringifyJson([]) })
    .where(eq(messages.id, task.messageId));
  logWarn("task.fail.persisted", {
    taskId,
    userId: task.userId,
    messageId: task.messageId,
    code,
    message,
    deletedImageCount
  });
  if (code !== "PROVIDER_ERROR") {
    await refundQuota(env, task.userId, params.n, taskId);
    logInfo("task.fail.quota_refunded", {
      taskId,
      userId: task.userId,
      imageCount: params.n,
      code
    });
  }
  await notifyTaskEvent(taskId, notify, {
    type: "task.failed",
    task: { id: taskId, status: "failed" },
    error: { code, message }
  });
}

/**
 * 无 expectedStartedAt 时允许结束 queued（罕见）；有则只结束匹配 running 的该轮。
 */
async function markGenerateTaskFailed(
  env: AppBindings,
  input: {
    taskId: string;
    code: string;
    message: string;
    finishedAt: number;
    expectedStartedAt?: number;
  }
): Promise<boolean> {
  const whereCurrent =
    input.expectedStartedAt === undefined
      ? "AND status IN ('queued', 'running')"
      : "AND status = 'running' AND started_at = ?5";
  const statement = env.DB.prepare(
    `UPDATE tasks
     SET status = 'failed',
         error_code = ?1,
         error_msg = ?2,
         heartbeat_at = ?3,
         finished_at = ?3
     WHERE id = ?4
       ${whereCurrent}`
  );
  const result =
    input.expectedStartedAt === undefined
      ? await statement.bind(input.code, input.message, input.finishedAt, input.taskId).run()
      : await statement
          .bind(input.code, input.message, input.finishedAt, input.taskId, input.expectedStartedAt)
          .run();
  return (result.meta.changes ?? 0) > 0;
}

/** 包装 `notify`：单次失败不影响主流程，但打 error 日志 */
async function notifyTaskEvent(
  taskId: string,
  notify: (event: TaskEvent) => Promise<void>,
  event: TaskEvent
): Promise<void> {
  try {
    await notify(event);
    logInfo("task.notify.sent", { taskId, ...taskEventSummary(event) });
  } catch (error) {
    logError("task.notify_failed", error, { taskId, ...taskEventSummary(event) });
  }
}

/** 仅当 status=queued 时改为 running 并写 started_at/heartbeat，返回是否抢到 */
async function claimGenerateTask(
  env: AppBindings,
  taskId: string,
  startedAt: number
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE tasks
     SET status = 'running',
         started_at = ?1,
         heartbeat_at = ?1,
         finished_at = NULL,
         error_code = NULL,
         error_msg = NULL
     WHERE id = ?2
       AND status = 'queued'`
  )
    .bind(startedAt, taskId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** 任务失败时软删本任务下所有**生成图**（非参考图） */
async function cleanupTaskGeneratedImages(env: AppBindings, taskId: string): Promise<number> {
  const result = await env.DB.prepare(
    `UPDATE image_objects
     SET deleted_at = COALESCE(deleted_at, ?1)
     WHERE task_id = ?2 AND deleted_at IS NULL AND is_reference = 0`
  )
    .bind(now(), taskId)
    .run();
  const deletedImageCount = result.meta.changes ?? 0;
  logInfo("task.images.cleanup_marked", { taskId, deletedImageCount });
  return deletedImageCount;
}

/**
 * 定时节拍更新 `tasks.heartbeat_at`，便于外部判断 Worker 是否仍存活；`stop` 在 finally 里调用。
 */
function startTaskHeartbeat(
  env: AppBindings,
  taskId: string,
  startedAt: number
): () => Promise<void> {
  let pending = touchTaskHeartbeat(env, taskId, startedAt);
  const pulse = () => {
    pending = pending
      .catch(() => undefined)
      .then(async () => {
        await touchTaskHeartbeat(env, taskId, startedAt);
        logInfo("task.heartbeat.touched", { taskId, startedAt });
      });
  };
  const interval = setInterval(pulse, TASK_HEARTBEAT_INTERVAL_MS);
  return async () => {
    clearInterval(interval);
    try {
      await pending;
    } catch (error) {
      logError("task.heartbeat_failed", error, { taskId, startedAt });
    }
  };
}

/** 与当前 started_at 绑定，防并发实例乱写 */
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

/** 使用 KV 固定窗口，避免多请求同时扫全表 recovery */
async function claimRecoveryWindow(env: AppBindings): Promise<boolean> {
  try {
    const active = await env.KV.get(TASK_RECOVERY_THROTTLE_KEY);
    if (active) return false;
    await env.KV.put(TASK_RECOVERY_THROTTLE_KEY, String(now()), {
      expirationTtl: TASK_RECOVERY_THROTTLE_SECONDS
    });
    return true;
  } catch (error) {
    logError("task.recovery_throttle_failed", error);
    return true;
  }
}

/**
 * 将任务事件推送到「该 taskId 专属」Durable Object，由 `TaskRoom.updateStatus` 落 storage + 广播 WebSocket。
 */
export async function broadcastTaskEvent(
  env: AppBindings,
  taskId: string,
  event: TaskEvent
): Promise<void> {
  if (!env.TASK_ROOM) {
    logWarn("task.broadcast.skipped_no_room", { taskId, ...taskEventSummary(event) });
    return;
  }
  const id = env.TASK_ROOM.idFromName(taskId);
  const stub = env.TASK_ROOM.get(id);
  await stub.updateStatus(event);
  logInfo("task.broadcast.sent", { taskId, ...taskEventSummary(event) });
}

/**
 * 创建或复用 Workflow 实例：pause 则 resume；终态则 restart。失败抛给 `startGenerateTask` 的 catch 走内联执行。
 */
async function startWorkflowGenerateTask(env: AppBindings, taskId: string): Promise<void> {
  const workflow = env.GEN_WORKFLOW;
  if (!workflow) return;
  try {
    logInfo("task.workflow_create.started", { taskId });
    await workflow.create({ id: taskId, params: { taskId } });
    logInfo("task.workflow_create.succeeded", { taskId });
    return;
  } catch (error) {
    logWarn("task.workflow_create.needs_existing_instance", {
      taskId,
      message: error instanceof Error ? error.message : "Workflow create failed"
    });
    const instance = await workflow.get(taskId);
    const status = await instance.status();
    logInfo("task.workflow_existing.status", { taskId, status: status.status });
    if (status.status === "paused") {
      await instance.resume();
      logInfo("task.workflow_existing.resumed", { taskId });
      return;
    }
    if (["errored", "terminated", "complete", "unknown"].includes(status.status)) {
      await instance.restart();
      logInfo("task.workflow_existing.restarted", { taskId, previousStatus: status.status });
    }
  }
}

/**
 * 受控并发池：多图 index 并行时**首个**未捕获错误会传回主流程（与 Promise.all 行为区分）。
 */
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

/**
 * 对话模式：从当前会话取最近消息拼成多轮 `messages`（带生成图 URL 摘要），条数/长度受截断保护。
 */
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

/**
 * 将 provider 返回的 url/base64/bytes 统一 `putImage` 入库，并返回带 `/api/i/:id` 的 `ImageAttachment`。
 */
async function persistProviderImage(
  env: AppBindings,
  input: { image: ProviderImage; ownerUserId: string; sessionId: string; taskId: string }
): Promise<ImageAttachment> {
  const baseFields = {
    taskId: input.taskId,
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    providerImage: providerImageSummary(input.image)
  };
  if (input.image.kind === "url") {
    logInfo("provider.image.download_started", {
      ...baseFields,
      sourceUrl: urlSummary(input.image.url),
      maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
      attemptTimeoutMs: PROVIDER_IMAGE_DOWNLOAD_ATTEMPT_TIMEOUT_MS
    });
    const downloaded = await downloadProviderImageWithRetry(input.image.url, baseFields);
    logInfo("provider.image.download_succeeded", {
      ...baseFields,
      sourceUrl: urlSummary(input.image.url),
      status: downloaded.status,
      mime: downloaded.mime,
      byteSize: downloaded.bytes.byteLength,
      attempts: downloaded.attempts,
      latencyMs: downloaded.latencyMs
    });
    return putImage(env, {
      ownerUserId: input.ownerUserId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      bytes: downloaded.bytes,
      mime: downloaded.mime
    });
  }
  if (input.image.kind === "base64") {
    const bytes = base64ToBytes(input.image.data);
    logInfo("provider.image.base64_decoded", {
      ...baseFields,
      mime: input.image.mime,
      byteSize: bytes.byteLength
    });
    return putImage(env, {
      ownerUserId: input.ownerUserId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      bytes,
      mime: input.image.mime
    });
  }
  logInfo("provider.image.bytes_ready", {
    ...baseFields,
    mime: input.image.mime,
    byteSize: input.image.bytes.byteLength
  });
  return putImage(env, {
    ownerUserId: input.ownerUserId,
    sessionId: input.sessionId,
    taskId: input.taskId,
    bytes: input.image.bytes,
    mime: input.image.mime
  });
}

type DownloadedProviderImage = {
  bytes: Uint8Array;
  mime: string;
  status: number;
  attempts: number;
  latencyMs: number;
};

/**
 * 供应商直链 URL 拉图：带超时、可重试状态码与指数退避，避免拖死整 task。
 */
async function downloadProviderImageWithRetry(
  url: string,
  logFields: Record<string, unknown>
): Promise<DownloadedProviderImage> {
  const totalStartedAt = Date.now();
  let lastMessage = "Provider image download failed";
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PROVIDER_IMAGE_DOWNLOAD_ATTEMPT_TIMEOUT_MS
    );
    try {
      logInfo("provider.image.download_attempt_started", {
        ...logFields,
        sourceUrl: urlSummary(url),
        attempt,
        maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS
      });
      const response = await fetch(url, {
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
          "User-Agent": "Edge-Muse-Platform/1.0"
        },
        signal: controller.signal
      });
      lastStatus = response.status;
      lastMessage = `Provider image download failed with HTTP ${response.status}`;
      if (!response.ok) {
        const retryable = isRetryableDownloadStatus(response.status);
        const nextDelayMs = retryable ? downloadBackoffDelayMs(attempt) : null;
        logWarn("provider.image.download_attempt_failed", {
          ...logFields,
          sourceUrl: urlSummary(url),
          attempt,
          maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
          status: response.status,
          statusText: response.statusText,
          retryable,
          nextDelayMs,
          latencyMs: Date.now() - attemptStartedAt
        });
        if (!retryable || nextDelayMs === null) break;
        await sleep(nextDelayMs);
        continue;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0) {
        lastMessage = "Provider image download returned an empty response";
        const nextDelayMs = downloadBackoffDelayMs(attempt);
        logWarn("provider.image.download_attempt_empty", {
          ...logFields,
          sourceUrl: urlSummary(url),
          attempt,
          maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
          status: response.status,
          nextDelayMs,
          latencyMs: Date.now() - attemptStartedAt
        });
        if (nextDelayMs === null) break;
        await sleep(nextDelayMs);
        continue;
      }

      logInfo("provider.image.download_attempt_succeeded", {
        ...logFields,
        sourceUrl: urlSummary(url),
        attempt,
        maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
        status: response.status,
        mime: response.headers.get("Content-Type") ?? "image/png",
        byteSize: bytes.byteLength,
        latencyMs: Date.now() - attemptStartedAt
      });
      return {
        bytes,
        mime: response.headers.get("Content-Type") ?? "image/png",
        status: response.status,
        attempts: attempt,
        latencyMs: Date.now() - totalStartedAt
      };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Provider image download failed";
      const nextDelayMs = downloadBackoffDelayMs(attempt);
      logError("provider.image.download_attempt_exception", error, {
        ...logFields,
        sourceUrl: urlSummary(url),
        attempt,
        maxAttempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
        retryable: nextDelayMs !== null,
        nextDelayMs,
        latencyMs: Date.now() - attemptStartedAt
      });
      if (nextDelayMs === null) break;
      await sleep(nextDelayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  logWarn("provider.image.download_failed", {
    ...logFields,
    sourceUrl: urlSummary(url),
    attempts: PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS,
    lastStatus,
    message: lastMessage,
    latencyMs: Date.now() - totalStartedAt
  });
  throw appError(
    "PROVIDER_ERROR",
    `Provider image download failed after ${PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS} attempts`
  );
}

/** 简单策略：4xx/5xx 均可能重试（亦可能快速失败，由 attempt 上限约束） */
function isRetryableDownloadStatus(status: number): boolean {
  return status >= 400;
}

/** 结合随机抖动，降低惊群 */
function downloadBackoffDelayMs(attempt: number): number | null {
  if (attempt >= PROVIDER_IMAGE_DOWNLOAD_MAX_ATTEMPTS) return null;
  const baseDelay = PROVIDER_IMAGE_DOWNLOAD_BACKOFF_MS[attempt - 1] ?? 16_000;
  return Math.round(baseDelay * (0.8 + Math.random() * 0.4));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 将用户上传的参考图行打上 sessionId/taskId，便于联查与权限 */
async function attachReferenceImagesToTask(
  env: AppBindings,
  input: {
    ownerUserId: string;
    sessionId: string;
    taskId: string;
    referenceImageIds: string[];
  }
): Promise<void> {
  if (input.referenceImageIds.length === 0) return;
  const result = await env.DB.prepare(
    `UPDATE image_objects
     SET session_id = COALESCE(session_id, ?1),
         task_id = COALESCE(task_id, ?2)
     WHERE id IN (${input.referenceImageIds.map((_, index) => `?${index + 3}`).join(",")})
       AND owner_user_id = ?${input.referenceImageIds.length + 3}
       AND is_reference = 1
       AND deleted_at IS NULL`
  )
    .bind(input.sessionId, input.taskId, ...input.referenceImageIds, input.ownerUserId)
    .run();
  logInfo("task.reference_images.attached", {
    taskId: input.taskId,
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    requestedReferenceImageCount: input.referenceImageIds.length,
    attachedReferenceImageCount: result.meta.changes ?? 0,
    referenceImageIds: input.referenceImageIds
  });
}

/** 建任务前：参考图须属于本人且 is_reference=1 未删 */
async function assertReferenceImagesAccessible(
  env: AppBindings,
  input: { ownerUserId: string; referenceImageIds: string[] }
): Promise<void> {
  if (input.referenceImageIds.length === 0) return;
  const rows = await getDb(env)
    .select({ id: imageObjects.id })
    .from(imageObjects)
    .where(
      and(
        inArray(imageObjects.id, input.referenceImageIds),
        eq(imageObjects.ownerUserId, input.ownerUserId),
        eq(imageObjects.isReference, true),
        isNull(imageObjects.deletedAt)
      )
    );
  if (rows.length === input.referenceImageIds.length) return;
  logWarn("task.reference_images.inaccessible", {
    ownerUserId: input.ownerUserId,
    requestedReferenceImageIds: input.referenceImageIds,
    accessibleReferenceImageIds: rows.map((row) => row.id)
  });
  throw appError("VALIDATION_ERROR", "Reference image not found or inaccessible");
}

/**
 * 从 R2 拉取参考图字节，顺序与 `imageIds` 一致（供 provider 多模态入参）。
 */
async function loadReferenceImages(env: AppBindings, imageIds: string[], ownerUserId: string) {
  if (imageIds.length === 0) return [];
  logInfo("task.reference_images.load_started", {
    imageIds,
    ownerUserId,
    requestedReferenceImageCount: imageIds.length
  });
  const rows = await getDb(env)
    .select()
    .from(imageObjects)
    .where(
      and(
        inArray(imageObjects.id, imageIds),
        eq(imageObjects.ownerUserId, ownerUserId),
        isNull(imageObjects.deletedAt)
      )
    );
  const orderedRows = orderRowsByImageIds(rows, imageIds);
  const images: Array<{ bytes: Uint8Array; mime: string }> = [];
  for (const row of orderedRows) {
    const object = await env.R2.get(row.r2Key);
    if (object) {
      const bytes = new Uint8Array(await object.arrayBuffer());
      logInfo("task.reference_image.loaded", {
        imageId: row.id,
        ownerUserId: row.ownerUserId,
        r2Key: row.r2Key,
        mime: row.mime,
        byteSize: bytes.byteLength
      });
      images.push({ bytes, mime: row.mime });
    } else {
      logWarn("task.reference_image.r2_missing", {
        imageId: row.id,
        ownerUserId: row.ownerUserId,
        r2Key: row.r2Key,
        mime: row.mime
      });
    }
  }
  if (orderedRows.length < imageIds.length) {
    logWarn("task.reference_images.db_missing", {
      requestedImageIds: imageIds,
      foundImageIds: rows.map((row) => row.id)
    });
  }
  return images;
}

/** 将 DB 查询结果重排为调用方给定的 id 顺序 */
export function orderRowsByImageIds<T extends { id: string }>(rows: T[], imageIds: string[]): T[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return imageIds.flatMap((imageId) => {
    const row = rowsById.get(imageId);
    return row ? [row] : [];
  });
}

/** 超大 raw JSON 不整包写入 DB，只记长度/截断标记 */
function redactProviderResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const json = JSON.stringify(raw);
  if (json.length <= 16_384) return raw;
  return { truncated: true, length: json.length };
}

/** 日志用：统计一批 provider 返回里 url/base64/bytes 数量 */
function providerImageKindCounts(images: ProviderImage[]): Record<string, number> {
  return images.reduce<Record<string, number>>((counts, image) => {
    counts[image.kind] = (counts[image.kind] ?? 0) + 1;
    return counts;
  }, {});
}

/** 多 index 并发完成后按 generationIndex、再按 id 稳定排序落库 */
function sortTaskImages(images: TaskImageAttachment[]): TaskImageAttachment[] {
  return [...images].sort((left, right) => {
    const leftIndex = left.generationIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = right.generationIndex ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.id.localeCompare(right.id);
  });
}

/** 避免把 URL/大段 base64 打进日志 */
function providerImageSummary(image: ProviderImage): Record<string, unknown> {
  if (image.kind === "url") {
    return { kind: image.kind, url: urlSummary(image.url) };
  }
  if (image.kind === "base64") {
    return {
      kind: image.kind,
      mime: image.mime,
      base64Chars: image.data.length
    };
  }
  return {
    kind: image.kind,
    mime: image.mime,
    byteSize: image.bytes.byteLength
  };
}

/** 缩减 WS 广播事件用于 `task.notify`/`broadcast` 旁路日志，避免贴全量图片对象 */
function taskEventSummary(event: TaskEvent): Record<string, unknown> {
  if (event.type === "task.image") {
    return {
      taskEvent: event.type,
      status: event.task.status,
      imageId: event.image.id,
      mime: event.image.mime,
      byteSize: event.image.byteSize
    };
  }
  if (event.type === "task.done") {
    return {
      taskEvent: event.type,
      status: event.task.status,
      imageCount: event.images.length,
      imageIds: event.images.map((image) => image.id)
    };
  }
  if (event.type === "task.failed") {
    return {
      taskEvent: event.type,
      status: event.task.status,
      code: event.error.code,
      message: event.error.message
    };
  }
  return {
    taskEvent: event.type,
    status: event.task.status,
    progress: event.task.progress ?? null
  };
}
