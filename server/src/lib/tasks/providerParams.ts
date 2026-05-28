import { appError } from "../errors";
import { parseJson } from "../json";
import type { Provider as ProviderRow } from "../../db/schema";
import type { GenerateParams } from "../../types";
import type { ImageProvider } from "../../providers/types";
import {
  isMicu4KSize,
  isMicuHighResolutionSize,
  isValidMicuImageSize,
  MICU_MAX_SIZE_EDGE,
  MICU_MIN_SIZE_EDGE,
  MICU_REQUEST_FORMAT,
  MICU_SIZE_ALIGNMENT,
  normalizeMicuImageSize
} from "../../providers/micuPolicy";

/**
 * provider 能力校验必须尽量前置到任务创建阶段，避免「写入任务/扣配额/启动 Workflow 后」
 * 才发现当前服务商不支持某个模式。运行阶段也会再校验一次，防止配置在排队期间被修改。
 */
export function assertProviderSupportsGenerateParams(
  provider: ProviderRow,
  providerImpl: ImageProvider,
  params: GenerateParams
): void {
  normalizeProviderGenerateParams(provider, params);
  if (providerImpl.supportedModes && !providerImpl.supportedModes.includes(params.mode)) {
    throw appError(
      "VALIDATION_ERROR",
      `${provider.name} does not support ${modeLabel(params.mode)} mode`
    );
  }

  const referenceCount =
    params.mode === "image2image" ? (params.referenceImageIds?.length ?? 0) : 0;
  if (
    params.mode === "image2image" &&
    providerImpl.maxReferenceImages !== undefined &&
    referenceCount > providerImpl.maxReferenceImages
  ) {
    throw appError(
      "VALIDATION_ERROR",
      `${provider.name} accepts at most ${providerImpl.maxReferenceImages} reference image`
    );
  }

  const supportedSizes = parseJson<string[]>(
    provider.supportedSizes,
    providerImpl.supportedSizes
  ).map((size) => normalizeProviderSize(provider, size));
  if (
    shouldEnforceSizeAlignment(provider) &&
    params.size !== "auto" &&
    !isValidMicuImageSize(params.size)
  ) {
    throw appError(
      "VALIDATION_ERROR",
      `${provider.name} size must be WxH, each edge ${MICU_MIN_SIZE_EDGE}-${MICU_MAX_SIZE_EDGE}, and divisible by ${MICU_SIZE_ALIGNMENT}`
    );
  }
  if (
    supportedSizes.length > 0 &&
    !supportedSizes.includes("*") &&
    provider.requestFormat !== MICU_REQUEST_FORMAT &&
    !supportedSizes.includes(params.size)
  ) {
    throw appError("VALIDATION_ERROR", `${provider.name} does not support size ${params.size}`);
  }

  if (provider.requestFormat === MICU_REQUEST_FORMAT) {
    if (params.mode === "image2image" && isMicu4KSize(params.size)) {
      throw appError(
        "VALIDATION_ERROR",
        `${provider.name} image-to-image only supports 1K/2K sizes`
      );
    }
    if (params.n > 1 && isMicuHighResolutionSize(params.size)) {
      throw appError(
        "VALIDATION_ERROR",
        `${provider.name} 2K/4K generation supports one image per task`
      );
    }
  }
}

export function normalizeProviderGenerateParams(
  provider: Pick<ProviderRow, "requestFormat">,
  params: GenerateParams
): GenerateParams {
  params.size = normalizeProviderSize(provider, params.size);
  return params;
}

function normalizeProviderSize(provider: Pick<ProviderRow, "requestFormat">, size: string): string {
  if (size === "auto") return size;
  if (!shouldEnforceSizeAlignment(provider)) return size;
  return normalizeMicuImageSize(size);
}

function shouldEnforceSizeAlignment(provider: Pick<ProviderRow, "requestFormat">): boolean {
  return (
    provider.requestFormat === MICU_REQUEST_FORMAT ||
    provider.requestFormat === "openai_compatible" ||
    provider.requestFormat === "openai_images"
  );
}

function modeLabel(mode: GenerateParams["mode"]): string {
  if (mode === "text2image") return "text-to-image";
  return "image-to-image";
}
