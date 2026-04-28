/**
 * 系统管理员案例管理。
 *
 * 写接口只记录结构化审计信息，不把完整 prompt 模板写入 audit payload。
 */
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { audit } from "../../lib/audit";
import {
  createPromptCase,
  importPromptCases,
  listPromptCases,
  PROMPT_CASE_LOCALES,
  PROMPT_CASE_MODES,
  PROMPT_CASE_STATUSES,
  promptCaseCreateSchema,
  promptCaseImportSchema,
  promptCasePatchSchema,
  updatePromptCase
} from "../../lib/promptCases";
import type { SysadminRouter } from "./common";

const sysadminPromptCaseQuerySchema = z.object({
  category: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(PROMPT_CASE_MODES).optional(),
  locale: z.enum(PROMPT_CASE_LOCALES).optional(),
  status: z.enum(PROMPT_CASE_STATUSES).optional(),
  featured: z.enum(["0", "1"]).optional(),
  includeArchived: z.enum(["0", "1"]).optional(),
  search: z.string().trim().min(1).max(120).optional()
});

export function registerSysadminPromptCaseRoutes(sysadminRoutes: SysadminRouter) {
  sysadminRoutes.get(
    "/prompt-cases",
    zValidator("query", sysadminPromptCaseQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const items = await listPromptCases(
        c.env,
        {
          category: query.category,
          mode: query.mode,
          locale: query.locale,
          status: query.status,
          featured: query.featured === undefined ? undefined : query.featured === "1",
          includeArchived: query.includeArchived === "1",
          search: query.search
        },
        false
      );
      return c.json({ items });
    }
  );

  sysadminRoutes.post("/prompt-cases", zValidator("json", promptCaseCreateSchema), async (c) => {
    const user = c.get("user");
    const item = await createPromptCase(c.env, user.id, c.req.valid("json"));
    await audit(c.env, {
      actorId: user.id,
      action: "sys.prompt_case_create",
      targetType: "prompt_case",
      targetId: item.id,
      payload: auditPayload(item)
    });
    return c.json({ item }, 201);
  });

  sysadminRoutes.patch(
    "/prompt-cases/:id",
    zValidator("json", promptCasePatchSchema),
    async (c) => {
      const user = c.get("user");
      const item = await updatePromptCase(c.env, user.id, c.req.param("id"), c.req.valid("json"));
      await audit(c.env, {
        actorId: user.id,
        action: "sys.prompt_case_update",
        targetType: "prompt_case",
        targetId: item.id,
        payload: auditPayload(item)
      });
      return c.json({ item });
    }
  );

  sysadminRoutes.post(
    "/prompt-cases/import",
    zValidator("json", promptCaseImportSchema),
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");
      const result = await importPromptCases(c.env, user.id, body);
      await audit(c.env, {
        actorId: user.id,
        action: "sys.prompt_case_import",
        targetType: "prompt_case_import",
        targetId: result.importId,
        payload: {
          source: body.source,
          sourceUrl: body.sourceUrl ?? null,
          importedCount: result.imported.length,
          failedCount: result.errors.length
        }
      });
      return c.json(result, 201);
    }
  );
}

type AuditPromptCase = {
  id: string;
  category: string;
  status: string;
  featured: boolean;
  sortOrder: number;
  locale: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  sourceLicense: string;
  sourceRepo: string | null;
};

function auditPayload(item: AuditPromptCase) {
  return {
    category: item.category,
    status: item.status,
    featured: item.featured,
    sortOrder: item.sortOrder,
    locale: item.locale,
    sourceUrl: item.sourceUrl,
    sourceAuthor: item.sourceAuthor,
    sourceLicense: item.sourceLicense,
    sourceRepo: item.sourceRepo
  };
}
