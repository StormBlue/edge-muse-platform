import { describe, expect, it } from "vitest";
import type { PromptCase } from "@/types/promptCases";
import {
  filterPromptCases,
  promptCaseApplyResult,
  promptCaseCategories,
  promptCaseSizes
} from "./promptCaseSelection";

const cases: PromptCase[] = [
  {
    id: "case_a",
    title: "电商产品海报",
    category: "商业广告",
    modes: ["text2image"],
    recommendedSize: "1:1",
    tags: ["产品", "海报"],
    promptTemplate: "专业棚拍产品图",
    promptSummary: "用于商品主图和社媒广告",
    thumbnailUrl: null,
    sourceUrl: null,
    sourceAuthor: null,
    sourceLicense: "internal",
    sourceRepo: null,
    popularity: {},
    status: "published",
    featured: true,
    sortOrder: 1,
    locale: "zh-CN",
    createdBy: null,
    updatedBy: null,
    createdAt: 1,
    updatedAt: 1
  },
  {
    id: "case_b",
    title: "角色设定草图",
    category: "角色设计",
    modes: ["image2image", "text2image"],
    recommendedSize: "3:4",
    tags: ["角色", "参考图"],
    promptTemplate: "保留参考图轮廓，生成角色设定",
    promptSummary: "适合上传参考图后生成角色方案",
    thumbnailUrl: null,
    sourceUrl: "https://example.com",
    sourceAuthor: "Example",
    sourceLicense: "CC BY 4.0",
    sourceRepo: null,
    popularity: {},
    status: "published",
    featured: false,
    sortOrder: 2,
    locale: "zh-CN",
    createdBy: null,
    updatedBy: null,
    createdAt: 2,
    updatedAt: 2
  }
];

describe("prompt case selection", () => {
  it("builds unique sorted category and size options", () => {
    expect(promptCaseCategories(cases)).toEqual(["角色设计", "商业广告"]);
    expect(promptCaseSizes(cases)).toEqual(["1:1", "3:4"]);
  });

  it("filters cases by category, mode, size and keyword", () => {
    const filtered = filterPromptCases(cases, {
      category: "角色设计",
      mode: "image2image",
      size: "3:4",
      search: "参考图"
    });

    expect(filtered.map((item) => item.id)).toEqual(["case_b"]);
  });

  it("filters cases by provider supported modes before user filters", () => {
    expect(
      filterPromptCases(cases, {
        category: "",
        mode: "",
        size: "",
        search: "",
        supportedModes: ["image2image"]
      }).map((item) => item.id)
    ).toEqual(["case_b"]);

    expect(
      filterPromptCases(cases, {
        category: "",
        mode: "",
        size: "",
        search: "",
        supportedModes: []
      })
    ).toEqual([]);
  });

  it("keeps current mode when applying a case and falls back to the case default", () => {
    expect(promptCaseApplyResult(cases[1], "text2image")).toEqual({
      prompt: "保留参考图轮廓，生成角色设定",
      mode: "text2image"
    });
    expect(promptCaseApplyResult(cases[1], "")).toEqual({
      prompt: "保留参考图轮廓，生成角色设定",
      mode: "image2image"
    });
    expect(promptCaseApplyResult(cases[0], "image2image")).toEqual({
      prompt: "专业棚拍产品图",
      mode: "text2image"
    });
    expect(promptCaseApplyResult(cases[1], "image2image", ["text2image"])).toEqual({
      prompt: "保留参考图轮廓，生成角色设定",
      mode: "text2image"
    });
  });
});
