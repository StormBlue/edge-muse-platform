import { describe, expect, it } from "vitest";
import { canSubmitAiImage, getAiImageSubmitBlockReason } from "./aiImageSubmitValidation";

const validInput = {
  prompt: "生成一张专业产品图",
  submitting: false,
  hasRunningTask: false,
  mode: "text2image" as const,
  supportedModes: ["text2image", "image2image"] as Array<"text2image" | "image2image">,
  size: "1024x1024",
  sizeOptions: [{ value: "1024x1024" }],
  referenceImageCount: 0
};

describe("ai image submit validation", () => {
  it("allows valid text to image submissions", () => {
    expect(canSubmitAiImage(validInput)).toBe(true);
    expect(getAiImageSubmitBlockReason(validInput)).toBeNull();
  });

  it("blocks invalid submission states with stable reasons", () => {
    expect(getAiImageSubmitBlockReason({ ...validInput, prompt: " " })).toBe("empty_prompt");
    expect(getAiImageSubmitBlockReason({ ...validInput, submitting: true })).toBe("submitting");
    expect(getAiImageSubmitBlockReason({ ...validInput, hasRunningTask: true })).toBe(
      "running_task"
    );
    expect(
      getAiImageSubmitBlockReason({
        ...validInput,
        supportedModes: ["image2image"] as Array<"text2image" | "image2image">
      })
    ).toBe("mode_unsupported");
    expect(getAiImageSubmitBlockReason({ ...validInput, size: "2048x2048" })).toBe(
      "size_unsupported"
    );
  });

  it("requires reference images for image to image", () => {
    expect(
      getAiImageSubmitBlockReason({
        ...validInput,
        mode: "image2image",
        referenceImageCount: 0
      })
    ).toBe("reference_required");
    expect(
      getAiImageSubmitBlockReason({
        ...validInput,
        mode: "image2image",
        referenceImageCount: 1
      })
    ).toBeNull();
  });
});
