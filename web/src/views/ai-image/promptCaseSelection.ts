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
  supportedModes?: PromptCaseMode[];
};

export type PromptCaseApplyResult = {
  prompt: string;
  mode: PromptCaseMode;
};

const PROMPT_CASE_CATEGORY_ORDER = [
  "人像与摄影",
  "商品与广告",
  "海报与插画",
  "角色与世界观",
  "UI 与社媒截图",
  "信息图与知识卡",
  "视频感关键帧"
];
const PROMPT_CASE_CATEGORY_INDEX = new Map(
  PROMPT_CASE_CATEGORY_ORDER.map((category, index) => [category, index])
);

export function promptCaseCategories(items: PromptCase[]) {
  return uniqueSorted(
    items.map((item) => item.category),
    comparePromptCaseCategories
  );
}

export function promptCaseSizes(items: PromptCase[]) {
  return uniqueSorted(items.map((item) => item.recommendedSize));
}

export function filterPromptCases(items: PromptCase[], filters: PromptCaseSelectionFilters) {
  const keyword = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    // Provider 可能只开放文生图或图生图，先排除无法提交的案例，避免用户选中后才失败。
    if (filters.supportedModes) {
      if (filters.mode && !filters.supportedModes.includes(filters.mode)) return false;
      const hasSupportedMode = item.modes.some((mode) => filters.supportedModes?.includes(mode));
      if (!hasSupportedMode) return false;
    }
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
  currentMode: "" | PromptCaseMode,
  supportedModes?: PromptCaseMode[]
): PromptCaseApplyResult {
  const itemSupportedModes = supportedModes
    ? item.modes.filter((mode) => supportedModes.includes(mode))
    : item.modes;
  const supportedMode =
    currentMode && itemSupportedModes.includes(currentMode) ? currentMode : null;
  return {
    prompt: item.promptTemplate,
    mode: supportedMode || itemSupportedModes[0] || "text2image"
  };
}

function comparePromptCaseCategories(left: string, right: string) {
  const leftIndex = PROMPT_CASE_CATEGORY_INDEX.get(left);
  const rightIndex = PROMPT_CASE_CATEGORY_INDEX.get(right);
  if (leftIndex !== undefined || rightIndex !== undefined) {
    return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER);
  }
  return left.localeCompare(right, "zh-CN");
}

function uniqueSorted(values: string[], compare = (a: string, b: string) => a.localeCompare(b)) {
  return Array.from(new Set(values)).sort(compare);
}
