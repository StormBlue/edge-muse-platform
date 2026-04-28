import { describe, expect, it } from "vitest";
import { resolveAiImageRecommendedSize } from "./aiImageSizeFallback";
import type { SizeOption } from "@/views/workspace/workspaceOptions";

const options: SizeOption[] = [
  { value: "1024x1024", ratio: "1:1", label: "1024 x 1024" },
  { value: "1024x1536", ratio: "2:3", label: "1024 x 1536" }
];

describe("ai image size fallback", () => {
  it("maps case ratios to provider-supported concrete sizes", () => {
    expect(resolveAiImageRecommendedSize("1:1", options, "1024x1536")).toEqual({
      size: "1024x1024",
      fallback: null
    });
  });

  it("keeps the current valid size and reports fallback when recommended size is unsupported", () => {
    expect(resolveAiImageRecommendedSize("3:4", options, "1024x1536")).toEqual({
      size: "1024x1536",
      fallback: { recommendedSize: "3:4", actualSize: "1024x1536" }
    });
  });
});
