import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { promptCaseImports, users } from "../src/db/schema";
import {
  bulkUpdatePromptCases,
  createPromptCase,
  importPromptCases,
  listPromptCases,
  type PromptCaseCreateInput,
  promptCaseCreateSchema,
  promptCaseImportSchema
} from "../src/lib/promptCases";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";

describe("prompt cases D1 integration", () => {
  let ctx: D1TestContext;

  beforeEach(async () => {
    ctx = await createD1TestContext();
    await seedSysadmin(ctx);
  });

  afterEach(async () => {
    await ctx?.dispose();
  });

  it("creates cases and lists only published public cases", async () => {
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "公开内部案例", sortOrder: 1 })
    );
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "隐藏案例", status: "hidden" })
    );
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({
        title: "外部图生图案例",
        modes: ["image2image"],
        sourceLicense: "CC BY 4.0",
        sourceUrl: "https://example.com/case",
        sourceAuthor: "Example Author",
        sourceRepo: "example/repo",
        sortOrder: 2
      })
    );

    const publicCases = await listPromptCases(ctx.env, { locale: "zh-CN" }, true);
    expect(publicCases.map((item) => item.title)).toEqual(["公开内部案例", "外部图生图案例"]);

    const imageCases = await listPromptCases(ctx.env, { mode: "image2image" }, true);
    expect(imageCases.map((item) => item.title)).toEqual(["外部图生图案例"]);
  });

  it("rejects publishing external cases without complete attribution", async () => {
    await expect(
      createPromptCase(
        ctx.env,
        "sys_1",
        promptCaseInput({
          sourceLicense: "CC BY 4.0",
          sourceUrl: null,
          sourceAuthor: null
        })
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("imports cases as draft and records the import batch", async () => {
    const input = promptCaseImportSchema.parse({
      source: "awesome-gpt-image-2-prompts",
      sourceUrl: "https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts",
      cases: [
        promptCaseInput({
          title: "导入案例",
          status: "published"
        })
      ]
    });

    const result = await importPromptCases(ctx.env, "sys_1", input);
    const imports = await getDb(ctx.env).select().from(promptCaseImports);

    expect(result.imported[0].status).toBe("draft");
    expect(imports).toMatchObject([
      {
        source: "awesome-gpt-image-2-prompts",
        totalCount: 1,
        importedCount: 1,
        failedCount: 0,
        status: "completed"
      }
    ]);
  });

  it("bulk updates status, category, and featured without touching prompt content", async () => {
    const first = await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "草稿一", status: "draft" })
    );
    const second = await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "草稿二", status: "hidden" })
    );

    const updated = await bulkUpdatePromptCases(ctx.env, "sys_1", {
      ids: [first.id, second.id],
      patch: { status: "published", category: "品牌营销", featured: true }
    });

    expect(updated.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(updated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.id,
          status: "published",
          category: "品牌营销",
          featured: true,
          promptTemplate: first.promptTemplate
        }),
        expect.objectContaining({
          id: second.id,
          status: "published",
          category: "品牌营销",
          featured: true,
          promptTemplate: second.promptTemplate
        })
      ])
    );
  });
});

async function seedSysadmin(ctx: D1TestContext) {
  await getDb(ctx.env).insert(users).values({
    id: "sys_1",
    email: "sys@example.com",
    username: "sys",
    passwordHash: "hash",
    nickname: "Sysadmin",
    role: "sysadmin",
    status: "active",
    createdAt: 1,
    updatedAt: 1
  });
}

function promptCaseInput(overrides: Partial<PromptCaseCreateInput> = {}) {
  return promptCaseCreateSchema.parse({
    title: "公开内部案例",
    category: "商业广告",
    modes: ["text2image"],
    recommendedSize: "1:1",
    tags: ["产品"],
    promptTemplate: "生成一张专业产品海报",
    promptSummary: "面向普通用户的产品海报案例",
    thumbnailUrl: null,
    sourceUrl: null,
    sourceAuthor: null,
    sourceLicense: "internal",
    sourceRepo: null,
    popularity: {},
    status: "published",
    featured: false,
    sortOrder: 0,
    locale: "zh-CN",
    ...overrides
  });
}
