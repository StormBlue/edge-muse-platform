import { and, asc, desc, eq, inArray, like, ne, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { promptCaseImports } from "../../db/schema";
import { appError } from "../errors";
import { newId, now } from "../id";
import { stringifyJson } from "../json";
import type { AppBindings } from "../../types";
import type {
  PromptCaseBulkUpdateInput,
  PromptCaseCreateInput,
  PromptCasePatchInput,
  promptCaseImportSchema
} from "./schema";
import {
  normalizePromptCaseModes,
  promptCases,
  promptCaseToDto,
  type PromptCase,
  type PromptCaseDto,
  type PromptCaseLicense,
  type PromptCaseListFilters,
  type PromptCaseStatus
} from "./types";

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
