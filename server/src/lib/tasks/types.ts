import type { GenerateParams, ImageAttachment, TaskStatus } from "../../types";

/** 单任务从 started_at 起算的超时时间；DO alarm 与 sweep 用同一量级做兜底 */
export const GENERATION_ATTEMPT_TIMEOUT_MS = 10 * 60 * 1000;
/** 每次恢复扫描最多「再点火」的 queued 条数，防一次 waitUntil 拖太久 */
export const INTERRUPTED_TASK_RECOVERY_LIMIT = 20;
/** 任务心跳写入间隔（供超时判断与僵尸任务识别，与实现细节相关） */
export const TASK_HEARTBEAT_INTERVAL_MS = 30 * 1000;
/** KV 键：跨请求节流 `recoverInterruptedGenerateTasks`，避免流量高峰重复扫库 */
export const TASK_RECOVERY_THROTTLE_KEY = "tasks:interrupted-recovery";
export const TASK_RECOVERY_THROTTLE_SECONDS = 60;

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
    mode: GenerateParams["mode"];
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
      images?: ImageAttachment[];
    }
  | { type: "task.done"; task: { id: string; status: "succeeded" }; images: ImageAttachment[] };

/** `recoverInterruptedGenerateTasks` 的汇总，供日志与运维 */
export type TaskRecoveryResult = {
  scheduled: number;
  taskIds: string[];
  groupIds: string[];
  resetAssigned: number;
  throttled: boolean;
  timedOut: {
    failed: number;
    recovered: number;
    taskIds: string[];
  };
};

export type WaitUntilContext = Pick<ExecutionContext, "waitUntil">;

export type CancelQueuedTaskResult = {
  taskId: string;
  messageId: string;
  sessionId: string;
  providerKeyGroupId: string | null;
};

/** 并行槽 `mapWithConcurrency` 每一「张」的聚合结果 */
export type GenerationResult = {
  index: number;
  requestId?: string;
  rawResponses: unknown[];
  textResponse?: string;
  images: TaskImageAttachment[];
  providerImageCount: number;
  persistenceFailures: GenerationFailure[];
};

/** 单张失败：来自 provider 或 R2 落库，写入最终 `provider_raw_response` 数组 */
export type GenerationFailure = {
  type: "generation_failure";
  index: number;
  code: string;
  message: string;
  phase: "provider" | "persist";
  createdAt: number;
  raw?: unknown;
};

/** 单槽 settled：成功带 GenerationResult，失败只记 GenerationFailure */
export type GenerationSettledResult =
  | { ok: true; value: GenerationResult }
  | { ok: false; failure: GenerationFailure };

/** 落库到 messages.attachments 与 WS 的图，可带来源槽位 generationIndex */
export type TaskImageAttachment = ImageAttachment & {
  generationIndex?: number | null;
  createdAt?: number;
};

/** 本 worker 的 started_at 与 DB 已不一致，应中止写库/通知（新实例或重复执行） */
export class TaskClaimLostError extends Error {
  constructor(taskId: string) {
    super(`Task claim lost: ${taskId}`);
    this.name = "TaskClaimLostError";
  }
}

/** 单轮生成超过 GENERATION_ATTEMPT_TIMEOUT_MS 仍无终态时由 DO alarm / sweep 使用 */
export class TaskAttemptTimeoutError extends Error {
  readonly code = "GENERATION_TIMEOUT";

  constructor(taskId: string) {
    super(
      `Image generation did not finish within ${GENERATION_ATTEMPT_TIMEOUT_MS / 60_000} minutes`
    );
    this.name = "TaskAttemptTimeoutError";
    this.cause = { taskId };
  }
}

export type TimedOutTaskRow = {
  id: string;
  session_id: string;
  message_id: string;
  user_id: string;
  provider_key_group_id: string | null;
  params: string;
  queued_at: number;
  started_at: number;
};

export type TimedOutSweepResult = {
  failedTaskIds: string[];
  recoveredTaskIds: string[];
};

export type TimedOutTaskResult = "failed" | "recovered" | "skipped";

export type FailureContext = {
  task?: {
    userId: string;
    messageId: string;
    params: string;
    providerKeyGroupId?: string | null;
    startedAt: number | null;
    queuedAt: number;
  };
  params?: GenerateParams;
  startedAt?: number;
  expectedStartedAt?: number;
};
