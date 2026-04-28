/**
 * AI 图像生成页提交前校验。
 *
 * 生成事件和按钮禁用都使用同一套纯规则，避免 UI 显示可点但提交函数又静默返回。
 */
import type { PromptCaseMode } from "@/types/promptCases";

export type AiImageSubmitBlockReason =
  | "empty_prompt"
  | "submitting"
  | "running_task"
  | "mode_unsupported"
  | "size_unsupported"
  | "reference_required";

export type AiImageSubmitValidationInput = {
  prompt: string;
  submitting: boolean;
  hasRunningTask: boolean;
  mode: PromptCaseMode;
  supportedModes: PromptCaseMode[];
  size: string;
  sizeOptions: Array<{ value: string }>;
  referenceImageCount: number;
};

export function getAiImageSubmitBlockReason(
  input: AiImageSubmitValidationInput
): AiImageSubmitBlockReason | null {
  if (!input.prompt.trim()) return "empty_prompt";
  if (input.submitting) return "submitting";
  if (input.hasRunningTask) return "running_task";
  if (!input.supportedModes.includes(input.mode)) return "mode_unsupported";
  if (!input.sizeOptions.some((option) => option.value === input.size)) return "size_unsupported";
  if (input.mode === "image2image" && input.referenceImageCount === 0) {
    return "reference_required";
  }
  return null;
}

export function canSubmitAiImage(input: AiImageSubmitValidationInput) {
  return getAiImageSubmitBlockReason(input) === null;
}
