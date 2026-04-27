import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messages, providerKeys, providers, tasks, users } from "../../db/schema";
import { getProvider } from "../../providers/registry";
import { decryptString } from "../crypto";
import { appError } from "../errors";
import { now } from "../id";
import { parseJson, stringifyJson } from "../json";
import { logError, logInfo, logWarn, promptSummary, urlSummary } from "../log";
import { buildChatMessages } from "./chat";
import { mapWithConcurrency } from "./concurrency";
import { notifyTaskEvent } from "./events";
import { failGenerateTask } from "./failure";
import { recoverTaskFromPersistedImages } from "./imageRecovery";
import {
  persistProviderImage,
  providerImageKindCounts,
  providerImageSummary,
  redactProviderResponse
} from "./providerImages";
import { assertProviderSupportsGenerateParams } from "./providerParams";
import { loadReferenceImages } from "./references";
import {
  generationFailureFromError,
  resolveParallelGenerationsForRole,
  summarizeGenerationFailures
} from "./runPolicy";
import {
  assertTaskClaimCurrent,
  claimGenerateTask,
  finishRunningTaskIfCurrent,
  isTaskClaimCurrent,
  startTaskHeartbeat,
  touchTaskHeartbeat
} from "./state";
import { sortTaskImages } from "./taskImages";
import { logSlowTask } from "./timing";
import {
  TaskClaimLostError,
  type GenerationFailure,
  type GenerationResult,
  type GenerationSettledResult,
  type TaskEvent,
  type TaskImageAttachment
} from "./types";
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
    assertProviderSupportsGenerateParams(provider, providerImpl, params);
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
        },
        images: finalImages
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
