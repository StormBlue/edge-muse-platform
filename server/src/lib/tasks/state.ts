import { now } from "../id";
import { logError, logInfo } from "../log";
import type { AppBindings, TaskStatus } from "../../types";
import {
  TaskClaimLostError,
  TASK_HEARTBEAT_INTERVAL_MS,
  TASK_RECOVERY_THROTTLE_KEY,
  TASK_RECOVERY_THROTTLE_SECONDS
} from "./types";

/**
 * 以「running + 当前 started_at」为条件更新终态，防止旧 worker 覆盖新执行结果（changes=0 即丢租约）。
 */
export async function finishRunningTaskIfCurrent(
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
export async function isTaskClaimCurrent(
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
export async function assertTaskClaimCurrent(
  env: AppBindings,
  taskId: string,
  startedAt: number
): Promise<void> {
  if (await isTaskClaimCurrent(env, taskId, startedAt)) return;
  throw new TaskClaimLostError(taskId);
}

/**
 * 无 expectedStartedAt 时允许结束 queued（罕见）；有则只结束匹配 running 的该轮。
 */
export async function markGenerateTaskFailed(
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

/** 仅当 status=queued 时改为 running 并写 started_at/heartbeat，返回是否抢到 */
export async function claimGenerateTask(
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

/**
 * 定时节拍更新 `tasks.heartbeat_at`，便于外部判断 Worker 是否仍存活；`stop` 在 finally 里调用。
 */
export function startTaskHeartbeat(
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
export async function touchTaskHeartbeat(
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
export async function claimRecoveryWindow(env: AppBindings): Promise<boolean> {
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
