/**
 * 用户端案例库只读接口。
 *
 * 列表只返回卡片展示所需的轻量字段；完整 prompt 模板通过详情接口按需读取。
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getPublishedPromptCase,
  listPublishedPromptCasePage,
  PROMPT_CASE_LOCALES,
  PROMPT_CASE_MODES
} from "../lib/promptCases";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const promptCaseQuerySchema = z.object({
  category: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(PROMPT_CASE_MODES).optional(),
  size: z.string().trim().min(1).max(40).optional(),
  locale: z.enum(PROMPT_CASE_LOCALES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1000).optional(),
  featured: z.enum(["0", "1"]).optional(),
  search: z.string().trim().min(1).max(120).optional()
});

const promptCaseDetailQuerySchema = z.object({
  locale: z.enum(PROMPT_CASE_LOCALES).optional()
});

export const promptCaseRoutes = new Hono<AppEnv>();

promptCaseRoutes.get("/", requireAuth, zValidator("query", promptCaseQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const page = await listPublishedPromptCasePage(c.env, {
    category: query.category,
    mode: query.mode,
    size: query.size,
    locale: query.locale ?? "zh-CN",
    limit: query.limit,
    cursor: query.cursor,
    featured: query.featured === undefined ? undefined : query.featured === "1",
    search: query.search
  });
  return c.json(page);
});

promptCaseRoutes.get(
  "/:id",
  requireAuth,
  zValidator("query", promptCaseDetailQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const item = await getPublishedPromptCase(c.env, c.req.param("id"), query.locale);
    return c.json({ item });
  }
);
