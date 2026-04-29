import { describe, expect, it } from "vitest";
import { emptyPromptCaseForm } from "@/types/promptCases";
import {
  applyPromptCaseModeToggle,
  clonePromptCaseForm,
  normalizePromptCaseEditorForm
} from "./promptCaseEditorForm";

describe("prompt case editor form helpers", () => {
  it("deep clones array and object fields before editing", () => {
    const form = {
      ...emptyPromptCaseForm(),
      modes: ["text2image", "image2image"] as ["text2image", "image2image"],
      tags: ["海报"],
      popularity: { likes: 10 }
    };

    const cloned = clonePromptCaseForm(form);
    cloned.tags.push("新增");
    cloned.popularity.likes = 20;

    expect(form.tags).toEqual(["海报"]);
    expect(form.popularity.likes).toBe(10);
  });

  it("normalizes text fields, tags, nullable links, and numeric sort order", () => {
    const normalized = normalizePromptCaseEditorForm(
      {
        ...emptyPromptCaseForm(),
        title: "  商品海报  ",
        category: "  商品广告 ",
        recommendedSize: " 4:5 ",
        promptSummary: "  摘要 ",
        promptTemplate: "  prompt ",
        thumbnailUrl: "   ",
        sourceAuthor: " 作者 ",
        sourceRepo: "",
        sourceUrl: " https://example.com ",
        sortOrder: Number.NaN
      },
      "  商业, 海报\n质感，，"
    );

    expect(normalized).toMatchObject({
      category: "商品广告",
      promptSummary: "摘要",
      promptTemplate: "prompt",
      recommendedSize: "4:5",
      sourceAuthor: "作者",
      sourceRepo: null,
      sourceUrl: "https://example.com",
      sortOrder: 0,
      tags: ["商业", "海报", "质感"],
      thumbnailUrl: null,
      title: "商品海报"
    });
  });

  it("keeps at least one mode while toggling editor checkboxes", () => {
    expect(applyPromptCaseModeToggle(["text2image"], "text2image", false)).toEqual(["text2image"]);
    expect(applyPromptCaseModeToggle(["text2image"], "image2image", true)).toEqual([
      "text2image",
      "image2image"
    ]);
    expect(applyPromptCaseModeToggle(["text2image", "image2image"], "text2image", false)).toEqual([
      "image2image"
    ]);
  });
});
