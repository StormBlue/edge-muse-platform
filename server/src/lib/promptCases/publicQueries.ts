import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { appError } from "../errors";
import { parseJson } from "../json";
import type { AppBindings } from "../../types";
import {
  PROMPT_CASE_MODES,
  promptCases,
  promptCaseToDto,
  promptCaseToListItemDto,
  type PromptCaseDto,
  type PromptCaseFacets,
  type PromptCaseLocale,
  type PromptCaseMode,
  type PromptCasePageDto,
  type PublishedPromptCaseListFilters
} from "./types";
import {
  encodePromptCaseCursor,
  normalizePublicCaseLimit,
  parsePromptCaseCursor,
  promptCaseCursorCondition,
  publicPromptCaseConditions
} from "./publicQueryHelpers";

export async function listPublishedPromptCasePage(
  env: AppBindings,
  filters: PublishedPromptCaseListFilters
): Promise<PromptCasePageDto> {
  const limit = normalizePublicCaseLimit(filters.limit);
  const cursor = parsePromptCaseCursor(filters.cursor, filters);
  const conditions = [
    ...publicPromptCaseConditions(filters),
    cursor ? promptCaseCursorCondition(cursor) : undefined
  ];
  const rows = await getDb(env)
    .select()
    .from(promptCases)
    .where(and(...conditions))
    .orderBy(
      desc(promptCases.featured),
      asc(promptCases.sortOrder),
      desc(promptCases.updatedAt),
      asc(promptCases.id)
    )
    .limit(limit + 1);
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const lastRow = pageRows.at(-1);
  return {
    items: pageRows.map(promptCaseToListItemDto),
    pageInfo: {
      nextCursor: hasMore && lastRow ? encodePromptCaseCursor(lastRow, filters) : null,
      hasMore,
      limit
    },
    facets: await listPublishedPromptCaseFacets(env, filters)
  };
}

export async function getPublishedPromptCase(
  env: AppBindings,
  id: string,
  locale?: PromptCaseLocale
): Promise<PromptCaseDto> {
  const row = await getDb(env).query.promptCases.findFirst({
    where: and(
      eq(promptCases.id, id),
      eq(promptCases.status, "published"),
      locale ? eq(promptCases.locale, locale) : undefined
    )
  });
  if (!row) throw appError("NOT_FOUND", "Prompt case not found");
  return promptCaseToDto(row);
}

async function listPublishedPromptCaseFacets(
  env: AppBindings,
  filters: PublishedPromptCaseListFilters
): Promise<PromptCaseFacets> {
  const db = getDb(env);
  const [categoryRows, sizeRows, modeRows] = await Promise.all([
    db
      .select({ value: promptCases.category, count: sql<number>`count(*)` })
      .from(promptCases)
      .where(and(...publicPromptCaseConditions(filters, { category: false })))
      .groupBy(promptCases.category)
      .orderBy(asc(promptCases.category)),
    db
      .select({ value: promptCases.recommendedSize, count: sql<number>`count(*)` })
      .from(promptCases)
      .where(and(...publicPromptCaseConditions(filters, { size: false })))
      .groupBy(promptCases.recommendedSize)
      .orderBy(asc(promptCases.recommendedSize)),
    db
      .select({ modes: promptCases.modes })
      .from(promptCases)
      .where(and(...publicPromptCaseConditions(filters, { mode: false })))
  ]);
  const modeCounts = new Map<PromptCaseMode, number>();
  for (const row of modeRows) {
    for (const mode of parseJson<PromptCaseMode[]>(row.modes, [])) {
      if (!PROMPT_CASE_MODES.includes(mode)) continue;
      modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
    }
  }
  return {
    categories: categoryRows.map((row) => ({ value: row.value, count: row.count })),
    sizes: sizeRows.map((row) => ({ value: row.value, count: row.count })),
    modes: PROMPT_CASE_MODES.map((mode) => ({
      value: mode,
      count: modeCounts.get(mode) ?? 0
    })).filter((item) => item.count > 0)
  };
}
