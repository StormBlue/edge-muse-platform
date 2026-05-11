import { promptCases, type PromptCase } from "../../db/schema";
import { parseJson } from "../json";

export const PROMPT_CASE_MODES = ["image2image", "text2image"] as const;
export const PROMPT_CASE_STATUSES = ["draft", "published", "hidden", "archived"] as const;
export const PROMPT_CASE_LOCALES = ["zh-CN", "en-US"] as const;
export const PROMPT_CASE_LICENSES = ["CC BY 4.0", "original", "internal"] as const;

export type PromptCaseMode = (typeof PROMPT_CASE_MODES)[number];
export type PromptCaseStatus = (typeof PROMPT_CASE_STATUSES)[number];
export type PromptCaseLocale = (typeof PROMPT_CASE_LOCALES)[number];
export type PromptCaseLicense = (typeof PROMPT_CASE_LICENSES)[number];

export function normalizePromptCaseModes(modes: readonly PromptCaseMode[]) {
  const modeSet = new Set(modes.filter((mode) => PROMPT_CASE_MODES.includes(mode)));
  return PROMPT_CASE_MODES.filter((mode) => modeSet.has(mode));
}

export type PromptCaseDto = {
  id: string;
  title: string;
  category: string;
  modes: PromptCaseMode[];
  recommendedSize: string;
  tags: string[];
  promptTemplate: string;
  promptSummary: string;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  sourceLicense: PromptCaseLicense;
  sourceRepo: string | null;
  popularity: { likes?: number; views?: number };
  status: PromptCaseStatus;
  featured: boolean;
  sortOrder: number;
  locale: PromptCaseLocale;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PromptCaseListItemDto = {
  id: string;
  title: string;
  category: string;
  modes: PromptCaseMode[];
  recommendedSize: string;
  tags: string[];
  promptSummary: string;
  thumbnailUrl: string | null;
  sourceAuthor: string | null;
  sourceLicense: PromptCaseLicense;
  sourceRepo: string | null;
  featured: boolean;
  sortOrder: number;
  locale: PromptCaseLocale;
};

export type PromptCaseFacet = {
  value: string;
  count: number;
};

export type PromptCaseFacets = {
  categories: PromptCaseFacet[];
  sizes: PromptCaseFacet[];
  modes: PromptCaseFacet[];
};

export type PromptCasePageInfo = {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
};

export type PromptCasePageDto = {
  items: PromptCaseListItemDto[];
  pageInfo: PromptCasePageInfo;
  facets: PromptCaseFacets;
};

export type PromptCaseListFilters = {
  category?: string;
  mode?: PromptCaseMode;
  locale?: PromptCaseLocale;
  status?: PromptCaseStatus;
  featured?: boolean;
  search?: string;
  includeArchived?: boolean;
};

export type PublishedPromptCaseListFilters = {
  category?: string;
  mode?: PromptCaseMode;
  size?: string;
  locale: PromptCaseLocale;
  featured?: boolean;
  search?: string;
  limit?: number;
  cursor?: string;
};

export function promptCaseToDto(row: PromptCase): PromptCaseDto {
  return {
    ...row,
    modes: normalizePromptCaseModes(parseJson<PromptCaseMode[]>(row.modes, [])),
    tags: parseJson<string[]>(row.tags, []),
    popularity: parseJson<{ likes?: number; views?: number }>(row.popularity, {}),
    sourceLicense: row.sourceLicense as PromptCaseLicense,
    status: row.status as PromptCaseStatus,
    locale: row.locale as PromptCaseLocale
  };
}

export function promptCaseToListItemDto(row: PromptCase): PromptCaseListItemDto {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    modes: normalizePromptCaseModes(parseJson<PromptCaseMode[]>(row.modes, [])),
    recommendedSize: row.recommendedSize,
    tags: parseJson<string[]>(row.tags, []),
    promptSummary: row.promptSummary,
    thumbnailUrl: row.thumbnailUrl,
    sourceAuthor: row.sourceAuthor,
    sourceLicense: row.sourceLicense as PromptCaseLicense,
    sourceRepo: row.sourceRepo,
    featured: row.featured,
    sortOrder: row.sortOrder,
    locale: row.locale as PromptCaseLocale
  };
}

export { promptCases };
export type { PromptCase };
