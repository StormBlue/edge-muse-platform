import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messages, tasks } from "../../db/schema";
import { now } from "../id";
import { parseJson, stringifyJson } from "../json";
import { logError, logInfo, logWarn } from "../log";
import { recordTaskResultGenerationEvent } from "../generationEntry";
import { refundQuota } from "../quota";
import { notifyTaskEvent } from "./events";
import { releaseGenerateTaskSlotNow } from "./queue";
import { markGenerateTaskFailed } from "./state";
import { loadTaskGeneratedImages } from "./taskImages";
import { logSlowTask } from "./timing";
import type { AppBindings, GenerateParams } from "../../types";
import type { FailureContext, TaskEvent } from "./types";

/**
 * 将任务与助手消息标为失败，保留本任务已落库生成图，必要时**退还配额**（非 PROVIDER_ERROR 类系统失败）。
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
  const preservedImages = await loadTaskGeneratedImages(env, taskId, params.prompt);
  await db
    .update(messages)
    .set({ status: "failed", attachments: stringifyJson(preservedImages) })
    .where(eq(messages.id, task.messageId));
  logWarn("task.fail.persisted", {
    taskId,
    userId: task.userId,
    messageId: task.messageId,
    code,
    message,
    preservedImageCount: preservedImages.length,
    preservedImageIds: preservedImages.map((image) => image.id)
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
  try {
    await recordTaskResultGenerationEvent(env, {
      userId: task.userId,
      taskId,
      eventName: "generate_failed",
      metadata: {
        code,
        preservedImageCount: preservedImages.length
      }
    });
    logInfo("task.fail.generation_event_result_written", {
      taskId,
      userId: task.userId,
      code,
      preservedImageCount: preservedImages.length
    });
  } catch (eventError) {
    // 任务失败状态已经落库，用量事件失败不能再影响业务终态。
    logWarn("task.fail.generation_event_result_failed", {
      taskId,
      userId: task.userId,
      code,
      message: eventError instanceof Error ? eventError.message : "unknown"
    });
  }
  await notifyTaskEvent(taskId, notify, {
    type: "task.failed",
    task: { id: taskId, status: "failed" },
    error: { code, message },
    images: preservedImages
  });
  await releaseGenerateTaskSlotNow(env, {
    taskId,
    providerKeyGroupId: task.providerKeyGroupId
  });
}
