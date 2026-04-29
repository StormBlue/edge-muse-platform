/**
 * sysadmin 案例导入 JSON 解析。
 *
 * 导入入口允许粘贴数组或 `{ cases: [...] }`；外部数据统一落为 draft，避免绕过发布前归因检查。
 */
import {
  emptyPromptCaseForm,
  PROMPT_CASE_LICENSES,
  PROMPT_CASE_MODES,
  type PromptCaseFormInput,
  type PromptCaseLicense,
  type PromptCaseMode
} from "@/types/promptCases";

export function parseImportCases(raw: string): PromptCaseFormInput[] {
  try {
    const parsed = JSON.parse(raw) as { cases?: unknown[] } | unknown[];
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.cases) ? parsed.cases : [];
    return list.map(normalizeImportCase);
  } catch {
    return [];
  }
}

export function normalizeImportCase(value: unknown): PromptCaseFormInput {
  const source = (typeof value === "object" && value ? value : {}) as Partial<PromptCaseFormInput>;
  const fallback = emptyPromptCaseForm();
  const modes = Array.isArray(source.modes) ? source.modes.filter(isPromptCaseMode) : [];
  const tags = Array.isArray(source.tags)
    ? source.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  return {
    ...fallback,
    ...source,
    status: "draft",
    tags,
    modes: modes.length ? modes : ["text2image"],
    thumbnailUrl: source.thumbnailUrl ?? null,
    sourceUrl: source.sourceUrl ?? null,
    sourceAuthor: source.sourceAuthor ?? null,
    sourceLicense: isPromptCaseLicense(source.sourceLicense)
      ? source.sourceLicense
      : fallback.sourceLicense,
    sourceRepo: source.sourceRepo ?? null
  };
}

function isPromptCaseMode(value: unknown): value is PromptCaseMode {
  return typeof value === "string" && PROMPT_CASE_MODES.includes(value as PromptCaseMode);
}

function isPromptCaseLicense(value: unknown): value is PromptCaseLicense {
  return typeof value === "string" && PROMPT_CASE_LICENSES.includes(value as PromptCaseLicense);
}
