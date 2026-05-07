import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { promptCaseImports, users } from "../src/db/schema";
import {
  bulkUpdatePromptCases,
  createPromptCase,
  getPublishedPromptCase,
  importPromptCases,
  listPublishedPromptCasePage,
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

  it("returns lightweight public pages with stable cursor pagination", async () => {
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "精选案例", featured: true, sortOrder: 10 })
    );
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "普通案例一", sortOrder: 1 })
    );
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "普通案例二", sortOrder: 2 })
    );

    const firstPage = await listPublishedPromptCasePage(ctx.env, {
      locale: "zh-CN",
      limit: 2
    });
    const secondPage = await listPublishedPromptCasePage(ctx.env, {
      locale: "zh-CN",
      limit: 2,
      cursor: firstPage.pageInfo.nextCursor ?? undefined
    });

    expect(firstPage.items.map((item) => item.title)).toEqual(["精选案例", "普通案例一"]);
    expect(firstPage.pageInfo.hasMore).toBe(true);
    expect(firstPage.pageInfo.nextCursor).toEqual(expect.any(String));
    expect(firstPage.items[0]).not.toHaveProperty("promptTemplate");
    expect(secondPage.items.map((item) => item.title)).toEqual(["普通案例二"]);
    expect(secondPage.pageInfo.hasMore).toBe(false);
    expect(secondPage.pageInfo.nextCursor).toBeNull();
  });

  it("filters and searches public pages across full data with facets", async () => {
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({
        title: "人像大片",
        category: "人像与摄影",
        modes: ["text2image"],
        recommendedSize: "3:4",
        tags: ["棚拍", "人物"],
        promptSummary: "胶片人像"
      })
    );
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({
        title: "商品海报",
        category: "商品与广告",
        modes: ["image2image", "text2image"],
        recommendedSize: "1:1",
        tags: ["电商", "新品"],
        promptSummary: "新品投放海报"
      })
    );
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({
        title: "英文案例",
        category: "Product",
        locale: "en-US"
      })
    );

    const searched = await listPublishedPromptCasePage(ctx.env, {
      locale: "zh-CN",
      search: "新品",
      limit: 10
    });
    const imageToImage = await listPublishedPromptCasePage(ctx.env, {
      locale: "zh-CN",
      mode: "image2image",
      limit: 10
    });

    expect(searched.items.map((item) => item.title)).toEqual(["商品海报"]);
    expect(searched.facets.categories).toEqual([{ value: "商品与广告", count: 1 }]);
    expect(imageToImage.items.map((item) => item.title)).toEqual(["商品海报"]);
    expect(imageToImage.facets.modes).toEqual(
      expect.arrayContaining([
        { value: "image2image", count: 1 },
        { value: "text2image", count: 2 }
      ])
    );
  });

  it("ignores stale cursors when filters change", async () => {
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "分类 A 一", category: "A", sortOrder: 1 })
    );
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "分类 A 二", category: "A", sortOrder: 2 })
    );
    await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "分类 B 一", category: "B", sortOrder: 1 })
    );

    const firstPage = await listPublishedPromptCasePage(ctx.env, {
      locale: "zh-CN",
      category: "A",
      limit: 1
    });
    const changedFilterPage = await listPublishedPromptCasePage(ctx.env, {
      locale: "zh-CN",
      category: "B",
      limit: 10,
      cursor: firstPage.pageInfo.nextCursor ?? undefined
    });

    expect(changedFilterPage.items.map((item) => item.title)).toEqual(["分类 B 一"]);
  });

  it("returns complete detail only for published visible cases", async () => {
    const published = await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "详情案例", promptTemplate: "完整详情 prompt" })
    );
    const hidden = await createPromptCase(
      ctx.env,
      "sys_1",
      promptCaseInput({ title: "隐藏详情", status: "hidden" })
    );

    await expect(getPublishedPromptCase(ctx.env, published.id, "zh-CN")).resolves.toMatchObject({
      id: published.id,
      promptTemplate: "完整详情 prompt",
      status: "published"
    });
    await expect(getPublishedPromptCase(ctx.env, hidden.id, "zh-CN")).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
    await expect(getPublishedPromptCase(ctx.env, published.id, "en-US")).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
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
