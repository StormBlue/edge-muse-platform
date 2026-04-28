import { describe, expect, it } from "vitest";
import { imageFilesFromFileList, prepareReferenceImageFiles } from "./referenceImageFiles";

describe("reference image files", () => {
  it("keeps only image files from array-like inputs", () => {
    const image = new File(["image"], "sample.png", { type: "image/png" });
    const text = new File(["text"], "note.txt", { type: "text/plain" });

    expect(imageFilesFromFileList([image, text])).toEqual([image]);
  });

  it("returns original image files when browser compression APIs are unavailable", async () => {
    const image = new File(["image"], "sample.png", { type: "image/png" });

    await expect(prepareReferenceImageFiles([image])).resolves.toEqual([image]);
  });
});
