import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messages, tasks, users } from "../../db/schema";
import { recordTaskResultGenerationEvent } from "../generationEntry";
import { now } from "../id";
import { parseJson, stringifyJson } from "../json";
import { logError, logInfo, logWarn, promptSummary } from "../log";
import { notifyTaskEvent } from "./events";
import { failGenerateTask } from "./failure";
import { recoverTaskFromPersistedImages } from "./imageRecovery";
import { releaseGenerateTaskSlotNow } from "./queue";
import { resolveTaskRunContext } from "./runContext";
import { runTaskGenerations } from "./runGenerations";
import { resolveParallelGenerationsForRole } from "./runPolicy";
import {
  claimGenerateTask,
  finishRunningTaskIfCurrent,
  isTaskClaimCurrent,
  startTaskHeartbeat
} from "./state";
import { logSlowTask } from "./timing";
import { TaskClaimLostError, type TaskEvent } from "./types";
import type { AppBindings, GenerateParams } from "../../types";

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
  let parallelGenerations = resolveParallelGenerationsForRole(taskUser?.role ?? "user");
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

    const runContext = await resolveTaskRunContext(env, { task, params, baseLogFields });
    parallelGenerations = resolveParallelGenerationsForRole(taskUser?.role ?? "user", {
      requestFormat: runContext.provider.requestFormat,
      model: runContext.model,
      mode: params.mode,
      size: params.size
    });
    logInfo("task.run.execution_plan", {
      ...baseLogFields,
      providerId: runContext.provider.id,
      requestFormat: runContext.provider.requestFormat,
      model: runContext.model,
      mode: params.mode,
      size: params.size,
      imageCount: params.n,
      parallelGenerations
    });
    const {
      errorCode,
      errorMessage,
      failures,
      finalImages,
      finalStatus,
      providerImageCount,
      rawResponses,
      requestIds,
      textResponses
    } = await runTaskGenerations(env, {
      ...runContext,
      baseLogFields,
      notify: send,
      parallelGenerations,
      params,
      startedAt,
      task,
      taskId
    });
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
    try {
      await recordTaskResultGenerationEvent(env, {
        userId: task.userId,
        taskId,
        eventName: finalStatus === "succeeded" ? "generate_succeeded" : "generate_failed",
        metadata: {
          imageCount: finalImages.length,
          failureCount: failures.length,
          providerImageCount
        }
      });
      logInfo("task.finish.generation_event_result_written", {
        ...baseLogFields,
        finalStatus,
        imageCount: finalImages.length
      });
    } catch (error) {
      // 用量事件不能影响任务终态；失败由日志暴露，指标侧会缺少该结果事件。
      logWarn("task.finish.generation_event_result_failed", {
        ...baseLogFields,
        finalStatus,
        message: error instanceof Error ? error.message : "unknown"
      });
    }
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
        },
        images: finalImages
      });
    }
    logInfo("task.finish.notified", {
      ...baseLogFields,
      finalStatus,
      imageCount: finalImages.length
    });
    await releaseGenerateTaskSlotNow(env, {
      taskId,
      providerKeyGroupId: task.providerKeyGroupId
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
