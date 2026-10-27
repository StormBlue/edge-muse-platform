import { describe, expect, it } from "vitest";
import { sizeOptionsForModel, sizeOptionsForProvider, sortSizeValues } from "./workspaceOptions";

describe("workspace size options", () => {
  it("sorts common canvas sizes by usage first and keeps Auto first", () => {
    expect(sortSizeValues(["1760x2480", "3840x2160", "auto", "1024x1024", "1536x1024"])).toEqual([
      "auto",
      "1024x1024",
      "1536x1024",
      "1760x2480",
      "3840x2160"
    ]);
  });

  it("shows every provider size without relying on the provider order", () => {
    const options = sizeOptionsForProvider({
      providerId: "prv_micu",
      providerName: "Micu",
      providerKeyId: "key_micu",
      providerKeyGroupId: "pkg_micu",
      providerKeyGroupName: "Micu group",
      requestFormat: "micu_images",
      model: "gpt-image-2",
      supportedModes: ["image2image", "text2image"],
      supportedSizes: ["3840x2160", "auto", "1760x2480", "640x200", "1024x1024"],
      maxReferenceImages: 5
    });

    expect(options.map((option) => option.value)).toEqual([
      "auto",
      "640x200",
      "1024x1024",
      "1760x2480",
      "3840x2160"
    ]);
    expect(options.find((option) => option.value === "640x200")?.label).toBe(
      "WeChat banner · 640 x 200"
    );
    expect(options.find((option) => option.value === "640x200")?.ratio).toBe("16:5");
    expect(options.find((option) => option.value === "1760x2480")?.label).toBe(
      "A4 portrait · 1760 x 2480"
    );
  });

  it("adds Auto for built-in image providers even when an old capability snapshot omits it", () => {
    const options = sizeOptionsForProvider({
      providerId: "prv_cubence",
      providerName: "Cubence",
      providerKeyId: "key_cubence",
      providerKeyGroupId: "pkg_cubence",
      providerKeyGroupName: "Cubence group",
      requestFormat: "openai_images",
      model: "gpt-image-2",
      supportedModes: ["image2image", "text2image"],
      supportedSizes: ["1024x1024", "2048x2048"],
      maxReferenceImages: 5
    });

    expect(options.map((option) => option.value)).toEqual(["auto", "1024x1024", "2048x2048"]);
  });

  it("normalizes legacy 8-aligned paper and 16:9 sizes to provider-safe values", () => {
    expect(sortSizeValues(["1752x2480", "2480x1752", "1920x1080", "1080x1920"])).toEqual([
      "1760x2480",
      "2480x1760",
      "1920x1088",
      "1088x1920"
    ]);
  });
});

describe("size options by selected Micu model", () => {
  const options = sizeOptionsForProvider({
    providerId: "prv_micu",
    providerName: "Micu",
    providerKeyId: null,
    providerKeyGroupId: null,
    providerKeyGroupName: null,
    requestFormat: "micu_images",
    model: "gpt-image-2.5-flare",
    supportedModes: ["text2image"],
    supportedSizes: ["auto", "1024x1024", "2048x2048", "3840x2160"],
    maxReferenceImages: 5
  });
  it("keeps all sizes in automatic mode", () =>
    expect(sizeOptionsForModel(options, "auto", "micu_images").map((x) => x.value)).toEqual([
      "auto",
      "1024x1024",
      "2048x2048",
      "3840x2160"
    ]));
  it("keeps every size for flare, sunburst, and their legacy aliases", () => {
    for (const model of [
      "gpt-image-2.5-flare",
      "gpt-image-2.5-flare-openai",
      "gpt-image-2.5-sunburst",
      "gpt-image-2.5-sunburst-openai"
    ]) {
      expect(sizeOptionsForModel(options, model, "micu_images").map((x) => x.value)).toEqual([
        "auto",
        "1024x1024",
        "2048x2048",
        "3840x2160"
      ]);
    }
  });
  it("keeps 1K sizes for gpt-image-2 and high resolution sizes for its openai route", () => {
    expect(sizeOptionsForModel(options, "gpt-image-2", "micu_images").map((x) => x.value)).toEqual([
      "auto",
      "1024x1024"
    ]);
    expect(
      sizeOptionsForModel(options, "gpt-image-2-openai", "micu_images").map((x) => x.value)
    ).toEqual(["2048x2048", "3840x2160"]);
  });
  it("does not filter other providers", () =>
    expect(sizeOptionsForModel(options, "gpt-image-2.5-flare", "openai_images")).toBe(options));
});
