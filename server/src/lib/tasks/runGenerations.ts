import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messages, type Provider, type Task } from "../../db/schema";
import { ProviderError, type ImageProvider } from "../../providers/types";
import { stringifyJson } from "../json";
import { logInfo, logWarn } from "../log";
import { mapWithConcurrency } from "./concurrency";
import {
  persistProviderImage,
  providerImageKindCounts,
  providerImageSummary,
  redactProviderResponse
} from "./providerImages";
import { summarizeTaskGenerationRun, type TaskGenerationRunResult } from "./runGenerationSummary";
import { generationFailureFromError } from "./runPolicy";
import { assertTaskClaimCurrent, touchTaskHeartbeat } from "./state";
import { sortTaskImages } from "./taskImages";
import type { ProviderImage } from "../../providers/types";
import type {
  GenerationFailure,
  GenerationResult,
  GenerationSettledResult,
  TaskEvent,
  TaskImageAttachment
} from "./types";
import type { AppBindings, GenerateParams } from "../../types";

export type { TaskGenerationRunResult } from "./runGenerationSummary";

export async function runTaskGenerations(
  env: AppBindings,
  input: {
    apiKey: string;
    baseLogFields: Record<string, unknown>;
    model: string;
    notify: (event: TaskEvent) => Promise<void>;
    parallelGenerations: number;
    params: GenerateParams;
    provider: Provider;
    providerImpl: ImageProvider;
    referenceImages: Array<{ bytes: Uint8Array; mime: string }>;
    startedAt: number;
    task: Task;
    taskId: string;
  }
): Promise<TaskGenerationRunResult> {
  const db = getDb(env);
  const {
    apiKey,
    baseLogFields,
    model,
    notify,
    parallelGenerations,
    params,
    provider,
    providerImpl,
    referenceImages,
    startedAt,
    task,
    taskId
  } = input;
  const images: TaskImageAttachment[] = [];
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
      referenceImageCount: referenceImages.length
    });
    const response = await providerImpl.generate({
      prompt: params.prompt,
      mode: params.mode,
      size: params.size,
      model,
      apiKey,
      baseUrl: provider.baseUrl,
      referenceImages,
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
    if (response.images.length === 0) {
      const redactedRaw = redactProviderResponse(response.raw);
      logWarn("task.generation.no_usable_image", {
        ...baseLogFields,
        generationIndex: index,
        providerRequestId: response.requestId ?? null,
        mode: params.mode,
        rawResponse: redactedRaw
      });
      throw new ProviderError("PROVIDER_ERROR", "No usable image was generated", {
        body: response.raw
      });
    }
    const generatedRawResponses = [redactProviderResponse(response.raw)];
    if (response.images.length === 0 && response.text) {
      generatedRawResponses.push({ text: response.text });
    }
    completedGenerations += 1;
    await notify({
      type: "task.update",
      task: {
        id: taskId,
        status: "running",
        progress: 0.1 + (completedGenerations / params.n) * 0.75
      }
    });
    const persistedGenerationImages: TaskImageAttachment[] = [];
    const persistenceFailures: GenerationFailure[] = [];
    const acceptedProviderImageIndexes = acceptedImageIndexesForGenerationSlot(response.images);
    if (response.images.length > acceptedProviderImageIndexes.size) {
      logWarn("task.generation.extra_provider_images_saved_for_audit", {
        ...baseLogFields,
        generationIndex: index,
        requestedImagesForProviderCall: 1,
        providerImageCount: response.images.length,
        acceptedImageCount: acceptedProviderImageIndexes.size,
        auditOnlyImageCount: response.images.length - acceptedProviderImageIndexes.size
      });
    }
    for (const [providerImageIndex, image] of response.images.entries()) {
      try {
        const acceptedForUser = acceptedProviderImageIndexes.has(providerImageIndex);
        await assertTaskClaimCurrent(env, taskId, startedAt);
        logInfo("task.image.persist_started", {
          ...baseLogFields,
          generationIndex: index,
          providerImageIndex,
          acceptedForUser,
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
        if (acceptedForUser) {
          images.push(attachment);
          persistedGenerationImages.push(attachment);
        }
        persistedImages += 1;
        if (acceptedForUser) {
          await queueMessageAttachmentUpdate("image_persisted");
          await notify({
            type: "task.image",
            task: { id: taskId, status: "running" },
            image: attachment
          });
          await notify({
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
        }
        logInfo("task.image.persisted", {
          ...baseLogFields,
          generationIndex: index,
          providerImageIndex,
          imageId: stored.id,
          mime: stored.mime,
          byteSize: stored.byteSize,
          acceptedForUser,
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

  const settledGenerationResults = await mapWithConcurrency(
    Array.from({ length: params.n }, (_, index) => index),
    parallelGenerations,
    async (index): Promise<GenerationSettledResult> => {
      try {
        return { ok: true, value: await generateOne(index) };
      } catch (error) {
        completedGenerations += 1;
        await touchTaskHeartbeat(env, taskId, startedAt).catch(() => undefined);
        await notify({
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

  return summarizeTaskGenerationRun({
    baseLogFields,
    generationFailures,
    generationResults,
    messageAttachmentUpdate,
    requestedGenerations: params.n
  });
}

/**
 * 任务层已经把 `params.n` 拆成 n 次 provider 调用，且每次 provider 请求体都写 `n: 1`。
 * 若上游偶发返回多张图，只采纳第一张，避免单次一键生成突破产品层的张数语义。
 */
export function acceptImagesForGenerationSlot(images: ProviderImage[]): ProviderImage[] {
  return images.filter((_, index) => acceptedImageIndexesForGenerationSlot(images).has(index));
}

function acceptedImageIndexesForGenerationSlot(images: ProviderImage[]): Set<number> {
  return new Set(images.length > 0 ? [0] : []);
}
