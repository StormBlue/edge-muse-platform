import { logInfo } from "../log";
import { summarizeGenerationFailures } from "./runPolicy";
import { sortTaskImages } from "./taskImages";
import type { GenerationFailure, GenerationResult, TaskImageAttachment } from "./types";

export type TaskGenerationRunResult = {
  errorCode: string | null;
  errorMessage: string | null;
  failures: GenerationFailure[];
  finalImages: TaskImageAttachment[];
  finalStatus: "succeeded" | "failed";
  providerImageCount: number;
  rawResponses: unknown[];
  requestIds: string[];
  textResponses: string[];
};

export async function summarizeTaskGenerationRun(input: {
  baseLogFields: Record<string, unknown>;
  generationFailures: GenerationFailure[];
  generationResults: GenerationResult[];
  messageAttachmentUpdate: Promise<void>;
  requestedGenerations: number;
}): Promise<TaskGenerationRunResult> {
  const {
    baseLogFields,
    generationFailures,
    generationResults,
    messageAttachmentUpdate,
    requestedGenerations
  } = input;
  const rawResponses: unknown[] = [];
  const requestIds: string[] = [];
  const textResponses: string[] = [];

  logInfo("task.generation.settled", {
    ...baseLogFields,
    requestedGenerations,
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

  const failures = [...generationFailures, ...persistenceFailures].sort(
    (left, right) => left.index - right.index
  );
  rawResponses.push(...failures);
  return {
    errorCode: failures[0]?.code ?? null,
    errorMessage: summarizeGenerationFailures(failures),
    failures,
    finalImages,
    finalStatus: failures.length ? "failed" : "succeeded",
    providerImageCount,
    rawResponses,
    requestIds,
    textResponses
  };
}
