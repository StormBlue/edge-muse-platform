/**
 * AI 图像生成案例库领域逻辑。
 *
 * 设计要点：
 * - D1 中数组/对象字段存 JSON 字符串，所有路由统一经 DTO 输出结构化数据。
 * - 外部案例发布前必须补齐来源、作者、许可证，避免归因缺失。
 * - 用户端只读 `published`，sysadmin 才能创建、编辑、导入和上下线。
 */
export {
  bulkUpdatePromptCases,
  createPromptCase,
  importPromptCases,
  listPromptCases,
  updatePromptCase
} from "./adminQueries";
export { getPublishedPromptCase, listPublishedPromptCasePage } from "./publicQueries";
export {
  promptCaseBulkPatchSchema,
  promptCaseBulkUpdateSchema,
  promptCaseCreateSchema,
  promptCaseImportSchema,
  promptCasePatchSchema
} from "./schema";
export type {
  PromptCaseBulkUpdateInput,
  PromptCaseCreateInput,
  PromptCasePatchInput
} from "./schema";
export {
  PROMPT_CASE_LICENSES,
  PROMPT_CASE_LOCALES,
  PROMPT_CASE_MODES,
  PROMPT_CASE_STATUSES,
  normalizePromptCaseModes,
  promptCaseToDto,
  promptCaseToListItemDto
} from "./types";
export type {
  PromptCaseDto,
  PromptCaseFacet,
  PromptCaseFacets,
  PromptCaseLicense,
  PromptCaseListFilters,
  PromptCaseListItemDto,
  PromptCaseLocale,
  PromptCaseMode,
  PromptCasePageDto,
  PromptCasePageInfo,
  PromptCaseStatus,
  PublishedPromptCaseListFilters
} from "./types";
