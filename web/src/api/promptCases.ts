/**
 * 案例库 API 客户端。
 *
 * 只在这里拼查询参数和请求路径，页面组件保持面向领域类型，避免散落字符串路径。
 */
import { apiFetch } from "@/api/client";
import type {
  PromptCase,
  PromptCaseBulkPatchInput,
  PromptCaseFilters,
  PromptCaseFormInput,
  PromptCaseMode,
  PromptCasePage
} from "@/types/promptCases";

export type PromptCaseListResponse = {
  items: PromptCase[];
};

export type PublishedPromptCaseListParams = {
  category?: string;
  mode?: PromptCaseMode | "";
  size?: string;
  locale?: string;
  limit?: number;
  cursor?: string | null;
  featured?: boolean;
  search?: string;
};

export type PublishedPromptCaseDetailParams = {
  locale?: string;
};

export type PromptCaseWriteResponse = {
  item: PromptCase;
};

export type PromptCaseImportResponse = {
  importId: string;
  imported: PromptCase[];
  errors: string[];
};

export type PromptCaseAssetUploadResponse = {
  asset: {
    url: string;
    key: string;
    mime: string;
    byteSize: number;
    sha256: string;
  };
};

export async function listSysadminPromptCases(filters: PromptCaseFilters) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.category.trim()) params.set("category", filters.category.trim());
  if (filters.mode) params.set("mode", filters.mode);
  if (filters.locale) params.set("locale", filters.locale);
  if (filters.featured) params.set("featured", filters.featured);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.status === "archived") params.set("includeArchived", "1");

  const body = await apiFetch<PromptCaseListResponse>(
    `/sysadmin/prompt-cases${params.size ? `?${params.toString()}` : ""}`
  );
  return filterBySource(body.items, filters.source);
}

export async function listPublishedPromptCases(filters: PublishedPromptCaseListParams) {
  return listPublishedPromptCasePage(filters);
}

export async function listPublishedPromptCasePage(filters: PublishedPromptCaseListParams) {
  const params = new URLSearchParams();
  if (filters.category?.trim()) params.set("category", filters.category.trim());
  if (filters.mode) params.set("mode", filters.mode);
  if (filters.size?.trim()) params.set("size", filters.size.trim());
  if (filters.locale) params.set("locale", filters.locale);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.featured !== undefined) params.set("featured", filters.featured ? "1" : "0");
  if (filters.search?.trim()) params.set("search", filters.search.trim());

  return apiFetch<PromptCasePage>(`/prompt-cases${params.size ? `?${params.toString()}` : ""}`);
}

export async function getPublishedPromptCase(
  id: string,
  filters: PublishedPromptCaseDetailParams = {}
) {
  const params = new URLSearchParams();
  if (filters.locale) params.set("locale", filters.locale);
  const body = await apiFetch<PromptCaseWriteResponse>(
    `/prompt-cases/${encodeURIComponent(id)}${params.size ? `?${params.toString()}` : ""}`
  );
  return body.item;
}

export async function createSysadminPromptCase(input: PromptCaseFormInput) {
  const body = await apiFetch<PromptCaseWriteResponse>("/sysadmin/prompt-cases", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return body.item;
}

export async function updateSysadminPromptCase(id: string, input: Partial<PromptCaseFormInput>) {
  const body = await apiFetch<PromptCaseWriteResponse>(`/sysadmin/prompt-cases/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
  return body.item;
}

export async function bulkUpdateSysadminPromptCases(input: {
  ids: string[];
  patch: PromptCaseBulkPatchInput;
}) {
  return apiFetch<PromptCaseListResponse>("/sysadmin/prompt-cases/bulk", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function importSysadminPromptCases(input: {
  source: string;
  sourceUrl: string | null;
  cases: PromptCaseFormInput[];
}) {
  return apiFetch<PromptCaseImportResponse>("/sysadmin/prompt-cases/import", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function uploadSysadminPromptCaseAsset(input: { file: File; category?: string }) {
  const form = new FormData();
  form.append("file", input.file);
  if (input.category?.trim()) form.append("category", input.category.trim());
  const body = await apiFetch<PromptCaseAssetUploadResponse>("/sysadmin/prompt-cases/assets", {
    method: "POST",
    body: form
  });
  return body.asset;
}

function filterBySource(items: PromptCase[], source: PromptCaseFilters["source"]) {
  if (!source) return items;
  return items.filter((item) => {
    const external =
      item.sourceLicense !== "internal" || Boolean(item.sourceUrl || item.sourceAuthor);
    return source === "external" ? external : !external;
  });
}
