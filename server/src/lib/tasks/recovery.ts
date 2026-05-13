import { now } from "../id";
import { parseJson } from "../json";
import { logError, logWarn } from "../log";
import { broadcastTaskEvent, notifyTaskEvent } from "./events";
import { failGenerateTask } from "./failure";
import { recoverTaskFromPersistedImages } from "./imageRecovery";
import { enqueueGenerateTask, enqueueGenerateTaskGroup } from "./queue";
import { resetStaleAssignedQueuedTasks } from "./scheduler";
import { claimRecoveryWindow } from "./state";
import {
  GENERATION_ATTEMPT_TIMEOUT_MS,
  INTERRUPTED_TASK_RECOVERY_LIMIT,
  TaskAttemptTimeoutError,
  type TaskEvent,
  type TaskRecoveryResult,
  type TimedOutSweepResult,
  type TimedOutTaskResult,
  type TimedOutTaskRow,
  type WaitUntilContext
} from "./types";
import type { AppBindings, GenerateParams } from "../../types";

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
          groupIds: result.groupIds,
          resetAssigned: result.resetAssigned,
          timedOut: result.timedOut
        });
      })
      .catch((error) => {
        logError("task.recovery_failed", error);
      })
  );
}

/**
 * 1) KV 节流下跳过重入；2) 扫超时 running；3) 重置孤儿 assigned queued；4) 唤醒 group DO。
 */
export async function recoverInterruptedGenerateTasks(
  env: AppBindings,
  ctx: WaitUntilContext,
  options: { limit?: number; throttle?: boolean } = {}
): Promise<TaskRecoveryResult> {
  const throttled = options.throttle !== false && !(await claimRecoveryWindow(env));
  const emptyTimedOut = { failed: 0, recovered: 0, taskIds: [] };
  if (throttled)
    return {
      scheduled: 0,
      taskIds: [],
      groupIds: [],
      resetAssigned: 0,
      throttled: true,
      timedOut: emptyTimedOut
    };

  const limit = options.limit ?? INTERRUPTED_TASK_RECOVERY_LIMIT;
  const timedOut = await sweepTimedOutGenerateTasks(env, {
    limit,
    notify: (taskId, event) => broadcastTaskEvent(env, taskId, event)
  });
  const resetAssigned = await resetStaleAssignedQueuedTasks(env, { limit });
  const result = await env.DB.prepare(
    `SELECT id, provider_key_group_id, assigned_at
     FROM tasks
     WHERE status = 'queued'
     ORDER BY queued_at ASC
     LIMIT ?1`
  )
    .bind(limit)
    .all<{ id: string; provider_key_group_id: string | null; assigned_at: number | null }>();
  const taskIds = result.results.map((row) => row.id);
  const groupIds = [
    ...new Set(result.results.map((row) => row.provider_key_group_id).filter(Boolean) as string[])
  ];
  for (const groupId of groupIds) {
    enqueueGenerateTaskGroup(env, ctx, groupId);
  }
  for (const row of result.results) {
    if (!row.provider_key_group_id) enqueueGenerateTask(env, ctx, row.id);
  }
  return {
    scheduled: taskIds.length,
    taskIds,
    groupIds,
    resetAssigned,
    throttled: false,
    timedOut: {
      failed: timedOut.failedTaskIds.length,
      recovered: timedOut.recoveredTaskIds.length,
      taskIds: [...timedOut.failedTaskIds, ...timedOut.recoveredTaskIds]
    }
  };
}

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
            provider_key_group_id,
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
            provider_key_group_id,
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
    providerKeyGroupId: row.provider_key_group_id,
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
  const timeoutError = new TaskAttemptTimeoutError(task.id);
  const recovered = await recoverTaskFromPersistedImages(env, {
    task,
    params,
    startedAt: task.startedAt,
    notify: (event) => notifyTaskEvent(task.id, notify, event),
    partialFailure: {
      code: timeoutError.code,
      message: timeoutError.message
    }
  });
  if (recovered) return "recovered";

  await failGenerateTask(env, task.id, timeoutError, notify, {
    task,
    params,
    startedAt: task.startedAt,
    expectedStartedAt: task.startedAt
  });
  return "failed";
}
