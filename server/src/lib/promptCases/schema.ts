import { z } from "zod";
import {
  normalizePromptCaseModes,
  PROMPT_CASE_LICENSES,
  PROMPT_CASE_LOCALES,
  PROMPT_CASE_MODES,
  PROMPT_CASE_STATUSES
} from "./types";

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
