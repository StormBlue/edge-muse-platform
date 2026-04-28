/**
 * 用户端案例库只读接口。
 *
 * 只返回 sysadmin 已发布的案例；完整 prompt 模板会返回给前端用于回填，但不记录日志。
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { listPromptCases, PROMPT_CASE_LOCALES, PROMPT_CASE_MODES } from "../lib/promptCases";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const promptCaseQuerySchema = z.object({
  category: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(PROMPT_CASE_MODES).optional(),
  locale: z.enum(PROMPT_CASE_LOCALES).optional(),
  featured: z.enum(["0", "1"]).optional(),
  search: z.string().trim().min(1).max(120).optional()
});

export const promptCaseRoutes = new Hono<AppEnv>();

promptCaseRoutes.get("/", requireAuth, zValidator("query", promptCaseQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const items = await listPromptCases(
    c.env,
    {
      category: query.category,
      mode: query.mode,
      locale: query.locale ?? "zh-CN",
      featured: query.featured === undefined ? undefined : query.featured === "1",
      search: query.search
    },
    true
  );
  return c.json({ items });
});
