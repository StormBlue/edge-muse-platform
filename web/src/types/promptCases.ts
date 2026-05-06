/**
 * AI 图像生成案例在前端的共享类型。
 *
 * 这些枚举与 server/src/lib/promptCases.ts 保持一致；前端集中声明后，
 * sysadmin 管理页、用户端案例库和 AI 图像生成页都复用同一套类型。
 */
export const PROMPT_CASE_MODES = ["image2image", "text2image"] as const;
export const PROMPT_CASE_STATUSES = ["draft", "published", "hidden", "archived"] as const;
export const PROMPT_CASE_LOCALES = ["zh-CN", "en-US"] as const;
export const PROMPT_CASE_LICENSES = ["CC BY 4.0", "original", "internal"] as const;

export type PromptCaseMode = (typeof PROMPT_CASE_MODES)[number];
export type PromptCaseStatus = (typeof PROMPT_CASE_STATUSES)[number];
export type PromptCaseLocale = (typeof PROMPT_CASE_LOCALES)[number];
export type PromptCaseLicense = (typeof PROMPT_CASE_LICENSES)[number];

export type PromptCasePopularity = {
  likes?: number;
  views?: number;
};

export type PromptCase = {
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
  popularity: PromptCasePopularity;
  status: PromptCaseStatus;
  featured: boolean;
  sortOrder: number;
  locale: PromptCaseLocale;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PromptCaseFilters = {
  status: "" | PromptCaseStatus;
  category: string;
  mode: "" | PromptCaseMode;
  locale: "" | PromptCaseLocale;
  source: "" | "external" | "internal";
  featured: "" | "0" | "1";
  search: string;
};

export type PromptCaseFormInput = {
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
  popularity: PromptCasePopularity;
  status: PromptCaseStatus;
  featured: boolean;
  sortOrder: number;
  locale: PromptCaseLocale;
};

export type PromptCaseBulkPatchInput = {
  category?: string;
  status?: PromptCaseStatus;
  featured?: boolean;
};

export function emptyPromptCaseForm(): PromptCaseFormInput {
  return {
    title: "",
    category: "",
    modes: ["image2image"],
    recommendedSize: "1:1",
    tags: [],
    promptTemplate: "",
    promptSummary: "",
    thumbnailUrl: null,
    sourceUrl: null,
    sourceAuthor: null,
    sourceLicense: "internal",
    sourceRepo: null,
    popularity: {},
    status: "draft",
    featured: false,
    sortOrder: 0,
    locale: "zh-CN"
  };
}

export function promptCaseToForm(item: PromptCase): PromptCaseFormInput {
  return {
    title: item.title,
    category: item.category,
    modes: [...item.modes],
    recommendedSize: item.recommendedSize,
    tags: [...item.tags],
    promptTemplate: item.promptTemplate,
    promptSummary: item.promptSummary,
    thumbnailUrl: item.thumbnailUrl,
    sourceUrl: item.sourceUrl,
    sourceAuthor: item.sourceAuthor,
    sourceLicense: item.sourceLicense,
    sourceRepo: item.sourceRepo,
    popularity: { ...item.popularity },
    status: item.status,
    featured: item.featured,
    sortOrder: item.sortOrder,
    locale: item.locale
  };
}
