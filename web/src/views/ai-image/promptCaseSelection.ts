/**
 * AI 图像生成案例选择与筛选的纯逻辑。
 *
 * 组件和组合函数只负责状态绑定；筛选规则集中在这里，便于覆盖搜索、模式和尺寸边界。
 */
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";

export type PromptCaseSelectionFilters = {
  category: string;
  mode: "" | PromptCaseMode;
  size: string;
  search: string;
};

export type PromptCaseApplyResult = {
  prompt: string;
  mode: PromptCaseMode;
};

export function promptCaseCategories(items: PromptCase[]) {
  return uniqueSorted(items.map((item) => item.category));
}

export function promptCaseSizes(items: PromptCase[]) {
  return uniqueSorted(items.map((item) => item.recommendedSize));
}

export function filterPromptCases(items: PromptCase[], filters: PromptCaseSelectionFilters) {
  const keyword = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.mode && !item.modes.includes(filters.mode)) return false;
    if (filters.size && item.recommendedSize !== filters.size) return false;
    if (!keyword) return true;

    const searchableText = [
      item.title,
      item.category,
      item.recommendedSize,
      item.promptSummary,
      item.tags.join(" ")
    ]
      .join(" ")
      .toLowerCase();
    return searchableText.includes(keyword);
  });
}

export function promptCaseApplyResult(
  item: PromptCase,
  currentMode: "" | PromptCaseMode
): PromptCaseApplyResult {
  return {
    prompt: item.promptTemplate,
    mode: currentMode || item.modes[0] || "text2image"
  };
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
