import { describe, expect, it } from "vitest";
import {
  imageFilesFromDataTransfer,
  imageFilesFromFileList,
  prepareReferenceImageFiles
} from "./referenceImageFiles";

describe("reference image files", () => {
  it("keeps only image files from array-like inputs", () => {
    const image = new File(["image"], "sample.png", { type: "image/png" });
    const text = new File(["text"], "note.txt", { type: "text/plain" });

    expect(imageFilesFromFileList([image, text])).toEqual([image]);
  });

  it("does not duplicate clipboard images exposed through both files and items", () => {
    const file = new File(["image"], "sample.png", { type: "image/png", lastModified: 1 });
    const itemFile = new File(["image"], "sample.png", { type: "image/png", lastModified: 2 });
    const transfer = {
      files: [file],
      items: [{ kind: "file", getAsFile: () => itemFile }]
    } as unknown as DataTransfer;

    expect(imageFilesFromDataTransfer(transfer)).toEqual([file]);
  });

  it("returns original image files when browser compression APIs are unavailable", async () => {
    const image = new File(["image"], "sample.png", { type: "image/png" });

    await expect(prepareReferenceImageFiles([image])).resolves.toEqual([image]);
  });
});
