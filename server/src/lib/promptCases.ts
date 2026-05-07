/**
 * AI 图像生成案例库领域逻辑。
 *
 * 设计要点：
 * - D1 中数组/对象字段存 JSON 字符串，所有路由统一经 DTO 输出结构化数据。
 * - 外部案例发布前必须补齐来源、作者、许可证，避免归因缺失。
 * - 用户端只读 `published`，sysadmin 才能创建、编辑、导入和上下线。
 */
import { and, asc, desc, eq, gt, inArray, like, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { promptCaseImports, promptCases, type PromptCase } from "../db/schema";
import { appError } from "./errors";
import { newId, now } from "./id";
import { parseJson, stringifyJson } from "./json";
import type { AppBindings } from "../types";

export const PROMPT_CASE_MODES = ["image2image", "text2image"] as const;
export const PROMPT_CASE_STATUSES = ["draft", "published", "hidden", "archived"] as const;
export const PROMPT_CASE_LOCALES = ["zh-CN", "en-US"] as const;
export const PROMPT_CASE_LICENSES = ["CC BY 4.0", "original", "internal"] as const;

export type PromptCaseMode = (typeof PROMPT_CASE_MODES)[number];
export type PromptCaseStatus = (typeof PROMPT_CASE_STATUSES)[number];
export type PromptCaseLocale = (typeof PROMPT_CASE_LOCALES)[number];
export type PromptCaseLicense = (typeof PROMPT_CASE_LICENSES)[number];

function normalizePromptCaseModes(modes: readonly PromptCaseMode[]) {
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

const optionalTextSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}, z.string().max(1000).nullable());

const shortTextSchema = z.string().trim().min(1).max(120);
const promptTextSchema = z.string().trim().min(1).max(4000);
const modesSchema = z
  .array(z.enum(PROMPT_CASE_MODES))
  .min(1)
  .max(PROMPT_CASE_MODES.length)
  .transform((modes) => normalizePromptCaseModes(modes));

const popularitySchema = z
  .object({
    likes: z.number().int().min(0).optional(),
    views: z.number().int().min(0).optional()
  })
  .default({});

export const promptCaseCreateSchema = z.object({
  title: shortTextSchema,
  category: shortTextSchema,
  modes: modesSchema,
  recommendedSize: z.string().trim().min(1).max(40),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  promptTemplate: promptTextSchema,
  promptSummary: z.string().trim().min(1).max(800),
  thumbnailUrl: optionalTextSchema.optional(),
  sourceUrl: optionalTextSchema.optional(),
  sourceAuthor: optionalTextSchema.optional(),
  sourceLicense: z.enum(PROMPT_CASE_LICENSES).default("internal"),
  sourceRepo: optionalTextSchema.optional(),
  popularity: popularitySchema,
  status: z.enum(PROMPT_CASE_STATUSES).default("draft"),
  featured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  locale: z.enum(PROMPT_CASE_LOCALES).default("zh-CN")
});

export const promptCasePatchSchema = promptCaseCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Patch body cannot be empty");

export const promptCaseBulkPatchSchema = z
  .object({
    category: shortTextSchema.optional(),
    status: z.enum(PROMPT_CASE_STATUSES).optional(),
    featured: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "Bulk patch body cannot be empty");

export const promptCaseBulkUpdateSchema = z.object({
  ids: z
    .array(z.string().trim().min(1).max(80))
    .min(1)
    .max(100)
    .transform((ids) => [...new Set(ids)]),
  patch: promptCaseBulkPatchSchema
});

export const promptCaseImportSchema = z.object({
  source: z.string().trim().min(1).max(80).default("manual"),
  sourceUrl: optionalTextSchema.optional(),
  cases: z.array(promptCaseCreateSchema).min(1).max(100)
});

export type PromptCaseCreateInput = z.infer<typeof promptCaseCreateSchema>;
export type PromptCasePatchInput = z.infer<typeof promptCasePatchSchema>;
export type PromptCaseBulkUpdateInput = z.infer<typeof promptCaseBulkUpdateSchema>;

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

type PromptCaseCursor = z.infer<typeof promptCaseCursorSchema>;

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

export async function listPromptCases(
  env: AppBindings,
  filters: PromptCaseListFilters,
  publicOnly: boolean
): Promise<PromptCaseDto[]> {
  const conditions = [
    publicOnly ? eq(promptCases.status, "published") : undefined,
    filters.status ? eq(promptCases.status, filters.status) : undefined,
    filters.locale ? eq(promptCases.locale, filters.locale) : undefined,
    filters.category ? eq(promptCases.category, filters.category) : undefined,
    filters.featured !== undefined ? eq(promptCases.featured, filters.featured) : undefined,
    filters.mode ? like(promptCases.modes, `%"${filters.mode}"%`) : undefined,
    !publicOnly && !filters.status && !filters.includeArchived
      ? ne(promptCases.status, "archived")
      : undefined,
    filters.search
      ? or(
          like(promptCases.title, `%${filters.search}%`),
          like(promptCases.promptSummary, `%${filters.search}%`),
          like(promptCases.category, `%${filters.search}%`),
          like(promptCases.tags, `%${filters.search}%`)
        )
      : undefined
  ];
  const rows = await getDb(env)
    .select()
    .from(promptCases)
    .where(and(...conditions))
    .orderBy(desc(promptCases.featured), asc(promptCases.sortOrder), desc(promptCases.updatedAt));
  return rows.map(promptCaseToDto);
}

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

export async function createPromptCase(
  env: AppBindings,
  actorId: string,
  input: PromptCaseCreateInput
): Promise<PromptCaseDto> {
  assertPublishable(input);
  const timestamp = now();
  const row: PromptCase = {
    id: newId("pcase"),
    title: input.title,
    category: input.category,
    modes: stringifyJson(normalizePromptCaseModes(input.modes)),
    recommendedSize: input.recommendedSize,
    tags: stringifyJson(input.tags),
    promptTemplate: input.promptTemplate,
    promptSummary: input.promptSummary,
    thumbnailUrl: input.thumbnailUrl ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceAuthor: input.sourceAuthor ?? null,
    sourceLicense: input.sourceLicense,
    sourceRepo: input.sourceRepo ?? null,
    popularity: stringifyJson(input.popularity),
    status: input.status,
    featured: input.featured,
    sortOrder: input.sortOrder,
    locale: input.locale,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await getDb(env).insert(promptCases).values(row);
  return promptCaseToDto(row);
}

export async function updatePromptCase(
  env: AppBindings,
  actorId: string,
  id: string,
  input: PromptCasePatchInput
): Promise<PromptCaseDto> {
  const existing = await getDb(env).query.promptCases.findFirst({
    where: eq(promptCases.id, id)
  });
  if (!existing) throw appError("NOT_FOUND", "Prompt case not found");

  const merged = { ...promptCaseToDto(existing), ...input };
  assertPublishable(merged);
  const patch = toPromptCasePatch(input, actorId);
  await getDb(env).update(promptCases).set(patch).where(eq(promptCases.id, id));
  const updated = await getDb(env).query.promptCases.findFirst({
    where: eq(promptCases.id, id)
  });
  if (!updated) throw appError("NOT_FOUND", "Prompt case not found");
  return promptCaseToDto(updated);
}

export async function bulkUpdatePromptCases(
  env: AppBindings,
  actorId: string,
  input: PromptCaseBulkUpdateInput
): Promise<PromptCaseDto[]> {
  const rows = await getDb(env)
    .select()
    .from(promptCases)
    .where(inArray(promptCases.id, input.ids));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const missingIds = input.ids.filter((id) => !rowsById.has(id));
  if (missingIds.length) {
    throw appError("NOT_FOUND", "Prompt cases not found", { missingIds });
  }

  for (const row of rows) {
    assertPublishable({ ...promptCaseToDto(row), ...input.patch });
  }

  await getDb(env)
    .update(promptCases)
    .set(toPromptCasePatch(input.patch, actorId))
    .where(inArray(promptCases.id, input.ids));
  const updatedRows = await getDb(env)
    .select()
    .from(promptCases)
    .where(inArray(promptCases.id, input.ids));
  const updatedById = new Map(updatedRows.map((row) => [row.id, promptCaseToDto(row)]));
  return input.ids
    .map((id) => updatedById.get(id))
    .filter((item): item is PromptCaseDto => Boolean(item));
}

export async function importPromptCases(
  env: AppBindings,
  actorId: string,
  input: z.infer<typeof promptCaseImportSchema>
): Promise<{ importId: string; imported: PromptCaseDto[]; errors: string[] }> {
  const importId = newId("pcimp");
  const imported: PromptCaseDto[] = [];
  const errors: string[] = [];
  for (const [index, item] of input.cases.entries()) {
    try {
      // 外部导入必须先进入草稿，避免未经人工归因/改写就出现在用户端。
      imported.push(await createPromptCase(env, actorId, { ...item, status: "draft" }));
    } catch (error) {
      errors.push(`case[${index}]: ${error instanceof Error ? error.message : "import failed"}`);
    }
  }
  await getDb(env)
    .insert(promptCaseImports)
    .values({
      id: importId,
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
      status: errors.length === 0 ? "completed" : imported.length ? "partial" : "failed",
      totalCount: input.cases.length,
      importedCount: imported.length,
      failedCount: errors.length,
      errors: stringifyJson(errors),
      createdBy: actorId,
      createdAt: now()
    });
  return { importId, imported, errors };
}

function assertPublishable(input: {
  status?: PromptCaseStatus;
  sourceUrl?: string | null;
  sourceAuthor?: string | null;
  sourceLicense?: PromptCaseLicense;
  sourceRepo?: string | null;
}) {
  if (input.status !== "published") return;
  const hasExternalSource =
    input.sourceLicense !== "internal" ||
    Boolean(input.sourceUrl || input.sourceAuthor || input.sourceRepo);
  if (!hasExternalSource) return;
  if (!input.sourceUrl || !input.sourceAuthor || !input.sourceLicense) {
    throw appError(
      "VALIDATION_ERROR",
      "External prompt cases require source URL, author, and license"
    );
  }
}

function toPromptCasePatch(input: PromptCasePatchInput, actorId: string): Partial<PromptCase> {
  const patch: Partial<PromptCase> = {
    updatedBy: actorId,
    updatedAt: now()
  };
  if (input.title !== undefined) patch.title = input.title;
  if (input.category !== undefined) patch.category = input.category;
  if (input.modes !== undefined) patch.modes = stringifyJson(normalizePromptCaseModes(input.modes));
  if (input.recommendedSize !== undefined) patch.recommendedSize = input.recommendedSize;
  if (input.tags !== undefined) patch.tags = stringifyJson(input.tags);
  if (input.promptTemplate !== undefined) patch.promptTemplate = input.promptTemplate;
  if (input.promptSummary !== undefined) patch.promptSummary = input.promptSummary;
  if (input.thumbnailUrl !== undefined) patch.thumbnailUrl = input.thumbnailUrl;
  if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl;
  if (input.sourceAuthor !== undefined) patch.sourceAuthor = input.sourceAuthor;
  if (input.sourceLicense !== undefined) patch.sourceLicense = input.sourceLicense;
  if (input.sourceRepo !== undefined) patch.sourceRepo = input.sourceRepo;
  if (input.popularity !== undefined) patch.popularity = stringifyJson(input.popularity);
  if (input.status !== undefined) patch.status = input.status;
  if (input.featured !== undefined) patch.featured = input.featured;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.locale !== undefined) patch.locale = input.locale;
  return patch;
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

function publicPromptCaseConditions(
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

function promptCaseCursorCondition(cursor: PromptCaseCursor) {
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

function normalizePublicCaseLimit(limit = DEFAULT_PUBLIC_CASE_LIMIT) {
  if (!Number.isFinite(limit)) return DEFAULT_PUBLIC_CASE_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_PUBLIC_CASE_LIMIT);
}

function encodePromptCaseCursor(row: PromptCase, filters: PublishedPromptCaseListFilters) {
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

function parsePromptCaseCursor(
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

function base64UrlEncode(value: string) {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
