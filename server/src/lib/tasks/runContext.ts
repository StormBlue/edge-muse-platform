import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../db/client";
import { providerKeys, providers, type Task } from "../../db/schema";
import { getProvider } from "../../providers/registry";
import { decryptString } from "../crypto";
import { appError } from "../errors";
import { logInfo, logWarn, urlSummary } from "../log";
import { assertProviderSupportsGenerateParams } from "./providerParams";
import { loadReferenceImages } from "./references";
import type { AppBindings, GenerateParams } from "../../types";

export async function resolveTaskRunContext(
  env: AppBindings,
  input: {
    task: Task;
    params: GenerateParams;
    baseLogFields: Record<string, unknown>;
  }
) {
  const db = getDb(env);
  const { task, params, baseLogFields } = input;
  if (!task.providerKeyId) {
    logWarn("task.provider_key_unassigned", baseLogFields);
    throw appError("PROVIDER_ERROR", "Provider key not assigned");
  }
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

  return {
    apiKey,
    model,
    provider,
    providerImpl,
    referenceImages
  };
}
