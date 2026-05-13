import {
  PROMPT_CASE_MODES,
  type PromptCase,
  type PromptCaseFacets,
  type PromptCaseListItem,
  type PromptCaseMode,
  type PromptCasePageInfo
} from "@/types/promptCases";
import type { ApiError } from "@/api/client";

export const CASE_PAGE_LIMIT = 60;

export const EMPTY_PAGE_INFO: PromptCasePageInfo = {
  nextCursor: null,
  hasMore: false,
  limit: CASE_PAGE_LIMIT
};

export const EMPTY_FACETS: PromptCaseFacets = {
  categories: [],
  sizes: [],
  modes: []
};

export function validPromptCaseModes(modes: readonly PromptCaseMode[]) {
  return modes.filter((mode): mode is PromptCaseMode => PROMPT_CASE_MODES.includes(mode));
}

export function isFullPromptCase(item: PromptCaseListItem | PromptCase): item is PromptCase {
  return "promptTemplate" in item;
}

export function omitKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

export function errorMessage(error: unknown, fallback: string) {
  const maybeApiError = error as Partial<ApiError>;
  return maybeApiError.error?.message || fallback;
}

export function promptCaseListParams(options: {
  category: string;
  filterMode: "" | PromptCaseMode;
  locale: string;
  search: string;
  size: string;
  supportedModes: PromptCaseMode[];
}) {
  return {
    category: options.category,
    mode: effectiveServerMode(options.filterMode, options.supportedModes),
    size: options.size,
    locale: options.locale,
    limit: CASE_PAGE_LIMIT,
    search: options.search
  };
}

function effectiveServerMode(filterMode: "" | PromptCaseMode, supportedModes: PromptCaseMode[]) {
  if (filterMode) return filterMode;
  return supportedModes.length === 1 ? supportedModes[0] : undefined;
}
