import { describe, expect, it } from "vitest";
import { orderRowsByImageIds } from "../src/lib/tasks";

describe("reference image ordering", () => {
  it("preserves the requested image id order instead of database row order", () => {
    const rows = [
      { id: "img_5", label: "5" },
      { id: "img_2", label: "2" },
      { id: "img_7", label: "7" }
    ];

    expect(orderRowsByImageIds(rows, ["img_7", "img_2", "img_5"]).map((row) => row.label)).toEqual([
      "7",
      "2",
      "5"
    ]);
  });

  it("skips missing rows while keeping the remaining requested order", () => {
    const rows = [
      { id: "img_2", label: "2" },
      { id: "img_7", label: "7" }
    ];

    expect(orderRowsByImageIds(rows, ["img_7", "img_missing", "img_2"])).toEqual([
      { id: "img_7", label: "7" },
      { id: "img_2", label: "2" }
    ]);
  });
});
