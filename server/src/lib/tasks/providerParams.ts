import { appError } from "../errors";
import { parseJson } from "../json";
import type { Provider as ProviderRow } from "../../db/schema";
import type { GenerateParams } from "../../types";
import type { ImageProvider } from "../../providers/types";

/**
 * provider 能力校验必须尽量前置到任务创建阶段，避免「写入任务/扣配额/启动 Workflow 后」
 * 才发现当前服务商不支持某个模式。运行阶段也会再校验一次，防止配置在排队期间被修改。
 */
export function assertProviderSupportsGenerateParams(
  provider: ProviderRow,
  providerImpl: ImageProvider,
  params: GenerateParams
): void {
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

  const supportedSizes = parseJson<string[]>(provider.supportedSizes, providerImpl.supportedSizes);
  if (
    supportedSizes.length > 0 &&
    !supportedSizes.includes("*") &&
    !supportedSizes.includes(params.size)
  ) {
    throw appError("VALIDATION_ERROR", `${provider.name} does not support size ${params.size}`);
  }
}

function modeLabel(mode: GenerateParams["mode"]): string {
  if (mode === "text2image") return "text-to-image";
  if (mode === "image2image") return "image-to-image";
  return "chat";
}
