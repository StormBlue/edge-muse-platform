import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messages } from "../../db/schema";
import { now } from "../id";
import { stringifyJson } from "../json";
import { logInfo, logWarn } from "../log";
import { finishRunningTaskIfCurrent } from "./state";
import { cleanupTaskGeneratedImagesExcept, loadTaskGeneratedImages } from "./taskImages";
import type { AppBindings, GenerateParams, TaskStatus } from "../../types";
import type { TaskEvent } from "./types";

/**
 * 崩溃恢复：D1 已有生成图时直接补终态；数量不足则标记失败但保留已落库图片。
 */
export async function recoverTaskFromPersistedImages(
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
    partialFailure?: { code: string; message: string };
  }
): Promise<boolean> {
  const persistedImages = await loadTaskGeneratedImages(env, input.task.id, input.params.prompt);
  if (persistedImages.length === 0) return false;

  const expectedImageCount = Math.max(input.params.n, 1);
  const hasExpectedImages = persistedImages.length >= expectedImageCount;
  if (!hasExpectedImages) {
    logWarn("task.recovery.partial_images_found", {
      taskId: input.task.id,
      sessionId: input.task.sessionId,
      messageId: input.task.messageId,
      expectedImageCount,
      persistedImageCount: persistedImages.length
    });
  }

  const recoveredAt = now();
  const images = persistedImages
    .slice(-Math.min(persistedImages.length, expectedImageCount))
    .map((image, index) => ({ ...image, generationIndex: index }));
  const status: TaskStatus = hasExpectedImages ? "succeeded" : "failed";
  const partialFailure = input.partialFailure ?? {
    code: "PARTIAL_GENERATION_FAILED",
    message: `Generation interrupted after ${images.length} of ${expectedImageCount} images were saved`
  };
  const finished = await finishRunningTaskIfCurrent(env, {
    taskId: input.task.id,
    startedAt: input.startedAt,
    status,
    errorCode: hasExpectedImages ? null : partialFailure.code,
    errorMsg: hasExpectedImages ? null : partialFailure.message,
    finishedAt: recoveredAt,
    providerRequestId: null,
    providerRawResponse: stringifyJson([
      {
        type: "recovered_from_persisted_images",
        status,
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

  if (hasExpectedImages) {
    await cleanupTaskGeneratedImagesExcept(
      env,
      input.task.id,
      images.map((image) => image.id)
    );
  }
  await getDb(env)
    .update(messages)
    .set({
      status,
      prompt: input.params.prompt,
      attachments: stringifyJson(images)
    })
    .where(eq(messages.id, input.task.messageId));
  logInfo("task.recovery.finalized", {
    taskId: input.task.id,
    sessionId: input.task.sessionId,
    messageId: input.task.messageId,
    status,
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
  if (hasExpectedImages) {
    await input.notify({
      type: "task.done",
      task: { id: input.task.id, status: "succeeded" },
      images
    });
  } else {
    await input.notify({
      type: "task.failed",
      task: { id: input.task.id, status: "failed" },
      error: partialFailure,
      images
    });
  }
  return true;
}
