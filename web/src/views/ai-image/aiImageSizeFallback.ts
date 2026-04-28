/**
 * AI 图像生成页的案例推荐尺寸匹配。
 *
 * 案例库里可能记录 `1024x1024`、`1:1` 或人工标签；这里统一映射到当前 provider 可用尺寸。
 */
import type { SizeOption } from "@/views/workspace/workspaceOptions";

export type AiImageSizeFallback = {
  recommendedSize: string;
  actualSize: string;
};

export type AiImageSizeResolution = {
  size: string;
  fallback: AiImageSizeFallback | null;
};

export function resolveAiImageRecommendedSize(
  recommendedSize: string,
  options: SizeOption[],
  currentSize: string
): AiImageSizeResolution {
  const matched = options.find(
    (option) =>
      option.value === recommendedSize ||
      option.ratio === recommendedSize ||
      option.label === recommendedSize
  );
  if (matched) return { size: matched.value, fallback: null };

  const fallback = options.find((option) => option.value === currentSize) ?? options[0];
  const actualSize = fallback?.value ?? (currentSize || "1024x1024");
  return {
    size: actualSize,
    fallback: recommendedSize ? { recommendedSize, actualSize } : null
  };
}
