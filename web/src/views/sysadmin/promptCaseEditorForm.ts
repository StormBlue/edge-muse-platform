/**
 * 案例编辑表单的纯规则。
 *
 * Vue 组件只负责收集输入；这里集中处理克隆、标签拆分、空字符串转 null 和模式切换，
 * 避免保存前清洗逻辑散在模板组件里难以测试。
 */
import type { PromptCaseFormInput, PromptCaseMode } from "@/types/promptCases";
import { PROMPT_CASE_MODES } from "@/types/promptCases";

export function clonePromptCaseForm(value: PromptCaseFormInput): PromptCaseFormInput {
  return {
    ...value,
    modes: [...value.modes],
    tags: [...value.tags],
    popularity: { ...value.popularity }
  };
}

export function normalizePromptCaseEditorForm(
  value: PromptCaseFormInput,
  tagsText: string
): PromptCaseFormInput {
  return {
    ...value,
    title: value.title.trim(),
    category: value.category.trim(),
    recommendedSize: value.recommendedSize.trim(),
    promptTemplate: value.promptTemplate.trim(),
    promptSummary: value.promptSummary.trim(),
    tags: parseTagsText(tagsText),
    thumbnailUrl: nullIfBlank(value.thumbnailUrl),
    sourceUrl: nullIfBlank(value.sourceUrl),
    sourceAuthor: nullIfBlank(value.sourceAuthor),
    sourceRepo: nullIfBlank(value.sourceRepo),
    sortOrder: Number(value.sortOrder) || 0
  };
}

export function applyPromptCaseModeToggle(
  currentModes: PromptCaseMode[],
  mode: PromptCaseMode,
  checked: boolean
) {
  const next = new Set(currentModes);
  if (checked) next.add(mode);
  if (!checked && next.size > 1) next.delete(mode);
  return PROMPT_CASE_MODES.filter((item) => next.has(item));
}

function parseTagsText(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function nullIfBlank(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
