import { describe, expect, it } from "vitest";
import { normalizeImportCase, parseImportCases } from "./promptCaseImportParser";

describe("prompt case import parser", () => {
  it("accepts array and wrapped cases payloads", () => {
    const arrayPayload = parseImportCases(JSON.stringify([{ title: "数组案例" }]));
    const wrappedPayload = parseImportCases(JSON.stringify({ cases: [{ title: "包装案例" }] }));

    expect(arrayPayload[0].title).toBe("数组案例");
    expect(wrappedPayload[0].title).toBe("包装案例");
  });

  it("normalizes imported cases to draft with safe array defaults", () => {
    const item = normalizeImportCase({
      title: "外部案例",
      tags: "not-array",
      modes: [],
      sourceLicense: "unknown",
      sourceUrl: undefined,
      sourceAuthor: "作者"
    });

    expect(item.status).toBe("draft");
    expect(item.tags).toEqual([]);
    expect(item.modes).toEqual(["text2image"]);
    expect(item.sourceLicense).toBe("internal");
    expect(item.sourceUrl).toBeNull();
    expect(item.sourceAuthor).toBe("作者");
  });

  it("keeps only supported mode and string tag values", () => {
    const item = normalizeImportCase({
      tags: ["角色", 1, null],
      modes: ["image2image", "video"],
      sourceLicense: "CC BY 4.0"
    });

    expect(item.tags).toEqual(["角色"]);
    expect(item.modes).toEqual(["image2image"]);
    expect(item.sourceLicense).toBe("CC BY 4.0");
  });

  it("returns an empty list for invalid JSON", () => {
    expect(parseImportCases("{bad json")).toEqual([]);
  });
});
