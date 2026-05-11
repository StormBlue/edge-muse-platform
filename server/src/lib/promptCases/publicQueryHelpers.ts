import { and, eq, gt, like, lt, or } from "drizzle-orm";
import { z } from "zod";
import { promptCases, type PromptCase, type PublishedPromptCaseListFilters } from "./types";
import { appError } from "../errors";
import { base64UrlDecode, base64UrlEncode } from "./cursorEncoding";

const DEFAULT_PUBLIC_CASE_LIMIT = 60;
const MAX_PUBLIC_CASE_LIMIT = 100;

const promptCaseCursorSchema = z.object({
  v: z.literal(1),
  k: z.string(),
  featured: z.boolean(),
  sortOrder: z.number().int().min(0),
  updatedAt: z.number().int().min(0),
  id: z.string().trim().min(1).max(80)
});

export type PromptCaseCursor = z.infer<typeof promptCaseCursorSchema>;

export function publicPromptCaseConditions(
  filters: PublishedPromptCaseListFilters,
  include: { category?: boolean; mode?: boolean; size?: boolean } = {}
) {
  const includeCategory = include.category ?? true;
  const includeMode = include.mode ?? true;
  const includeSize = include.size ?? true;
  const search = filters.search?.trim();
  return [
    eq(promptCases.status, "published"),
    eq(promptCases.locale, filters.locale),
    includeCategory && filters.category ? eq(promptCases.category, filters.category) : undefined,
    includeMode && filters.mode ? like(promptCases.modes, `%"${filters.mode}"%`) : undefined,
    includeSize && filters.size ? eq(promptCases.recommendedSize, filters.size) : undefined,
    filters.featured !== undefined ? eq(promptCases.featured, filters.featured) : undefined,
    search
      ? or(
          like(promptCases.title, `%${search}%`),
          like(promptCases.promptSummary, `%${search}%`),
          like(promptCases.category, `%${search}%`),
          like(promptCases.tags, `%${search}%`)
        )
      : undefined
  ];
}

export function promptCaseCursorCondition(cursor: PromptCaseCursor) {
  return or(
    lt(promptCases.featured, cursor.featured),
    and(eq(promptCases.featured, cursor.featured), gt(promptCases.sortOrder, cursor.sortOrder)),
    and(
      eq(promptCases.featured, cursor.featured),
      eq(promptCases.sortOrder, cursor.sortOrder),
      lt(promptCases.updatedAt, cursor.updatedAt)
    ),
    and(
      eq(promptCases.featured, cursor.featured),
      eq(promptCases.sortOrder, cursor.sortOrder),
      eq(promptCases.updatedAt, cursor.updatedAt),
      gt(promptCases.id, cursor.id)
    )
  );
}

export function normalizePublicCaseLimit(limit = DEFAULT_PUBLIC_CASE_LIMIT) {
  if (!Number.isFinite(limit)) return DEFAULT_PUBLIC_CASE_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_PUBLIC_CASE_LIMIT);
}

export function encodePromptCaseCursor(row: PromptCase, filters: PublishedPromptCaseListFilters) {
  return base64UrlEncode(
    JSON.stringify({
      v: 1,
      k: promptCaseFiltersKey(filters),
      featured: row.featured,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt,
      id: row.id
    } satisfies PromptCaseCursor)
  );
}

export function parsePromptCaseCursor(
  cursor: string | undefined,
  filters: PublishedPromptCaseListFilters
): PromptCaseCursor | null {
  if (!cursor) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(cursor));
  } catch {
    throw appError("VALIDATION_ERROR", "Invalid prompt case cursor");
  }
  const result = promptCaseCursorSchema.safeParse(parsed);
  if (!result.success) throw appError("VALIDATION_ERROR", "Invalid prompt case cursor");
  if (result.data.k !== promptCaseFiltersKey(filters)) return null;
  return result.data;
}

function promptCaseFiltersKey(filters: PublishedPromptCaseListFilters) {
  return JSON.stringify({
    locale: filters.locale,
    category: filters.category?.trim() ?? "",
    mode: filters.mode ?? "",
    size: filters.size?.trim() ?? "",
    featured: filters.featured ?? null,
    search: filters.search?.trim() ?? ""
  });
}
