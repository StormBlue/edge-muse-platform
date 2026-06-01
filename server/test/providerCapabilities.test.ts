import { describe, expect, it } from "vitest";
import { assertProviderSupportsGenerateParams } from "../src/lib/tasks";
import { providerCapabilitiesFromResolvedGroup } from "../src/lib/providerKeyGroups";
import { MICU_IMAGE_SIZE_PRESETS } from "../src/providers/micuPolicy";
import { MicuImagesProvider } from "../src/providers/openai-compatible";
import { OpenAIImagesProvider } from "../src/providers/openai-images";
import type { Provider } from "../src/db/schema";

const cubenceProvider: Provider = {
  id: "prv_cubence",
  name: "Cubence",
  baseUrl: "https://api-dmit.cubence.com",
  defaultModel: "gpt-image-2",
  requestFormat: "openai_images",
  supportedSizes: JSON.stringify(["auto", "1024x1024", "2048x2048"]),
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null
};

const micuProvider: Provider = {
  id: "prv_micu",
  name: "Micu",
  baseUrl: "https://www.micuapi.ai",
  defaultModel: "gpt-image-2",
  requestFormat: "micu_images",
  supportedSizes: JSON.stringify(MICU_IMAGE_SIZE_PRESETS),
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null
};

describe("provider capability validation", () => {
  const providerImpl = new OpenAIImagesProvider();
  const micuImpl = new MicuImagesProvider();

  it("allows supported Cubence text-to-image requests", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(cubenceProvider, providerImpl, {
        prompt: "a cat",
        mode: "text2image",
        size: "2048x2048",
        n: 1
      })
    ).not.toThrow();
  });

  it("declares only text-to-image and image-to-image modes", () => {
    expect(providerImpl.supportedModes).toEqual(["image2image", "text2image"]);
    expect(micuImpl.supportedModes).toEqual(["image2image", "text2image"]);
  });

  it("uses current built-in provider sizes for capability snapshots", () => {
    const capabilities = providerCapabilitiesFromResolvedGroup({
      group: {
        id: "pkg_micu",
        providerId: "prv_micu",
        name: "Micu group",
        description: null,
        enabled: true,
        createdBy: null,
        updatedBy: null,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null
      },
      provider: { ...micuProvider, id: "prv_micu", supportedSizes: JSON.stringify(["1024x1024"]) },
      members: []
    });

    expect(capabilities.supportedSizes[0]).toBe("auto");
    expect(capabilities.supportedSizes).toContain("640x200");
    expect(capabilities.supportedSizes).toContain("1760x2480");
  });

  it("rejects Cubence image-to-image with more than one reference image", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(cubenceProvider, providerImpl, {
        prompt: "replace background",
        mode: "image2image",
        size: "1024x1024",
        n: 1,
        referenceImageIds: ["img_1", "img_2"]
      })
    ).toThrow("Cubence accepts at most 1 reference image");
  });

  it("rejects sizes outside the provider allow-list", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(cubenceProvider, providerImpl, {
        prompt: "a cat",
        mode: "text2image",
        size: "1536x1024",
        n: 1
      })
    ).toThrow("Cubence does not support size 1536x1024");
  });

  it("keeps the WeChat banner size scoped to Micu", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(micuProvider, micuImpl, {
        prompt: "a WeChat official account banner",
        mode: "text2image",
        size: "640x200",
        n: 1
      })
    ).not.toThrow();
    expect(() =>
      assertProviderSupportsGenerateParams(cubenceProvider, providerImpl, {
        prompt: "a WeChat official account banner",
        mode: "text2image",
        size: "640x200",
        n: 1
      })
    ).toThrow();
  });

  it("rejects Micu image-to-image high-resolution sizes before provider billing", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(micuProvider, micuImpl, {
        prompt: "replace background",
        mode: "image2image",
        size: "3840x2160",
        n: 1,
        referenceImageIds: ["img_1"]
      })
    ).toThrow("Micu image-to-image only supports 1K/2K sizes");
  });

  it("allows Cubence Auto size requests", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(cubenceProvider, providerImpl, {
        prompt: "a cat",
        mode: "text2image",
        size: "auto",
        n: 1
      })
    ).not.toThrow();
  });

  it("allows Micu custom 16-aligned text-to-image sizes", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(micuProvider, micuImpl, {
        prompt: "a cat",
        mode: "text2image",
        size: "1504x1504",
        n: 1
      })
    ).not.toThrow();
  });

  it("allows Micu A-series preset sizes", () => {
    expect(MICU_IMAGE_SIZE_PRESETS[0]).toBe("auto");
    expect(MICU_IMAGE_SIZE_PRESETS).toContain("1760x2480");
    expect(() =>
      assertProviderSupportsGenerateParams(micuProvider, micuImpl, {
        prompt: "a poster",
        mode: "text2image",
        size: "1760x2480",
        n: 1
      })
    ).not.toThrow();
  });

  it("normalizes legacy Micu 8-aligned preset sizes before validation", () => {
    const params = {
      prompt: "a poster",
      mode: "text2image" as const,
      size: "1752x2480",
      n: 1
    };

    expect(() =>
      assertProviderSupportsGenerateParams(micuProvider, micuImpl, params)
    ).not.toThrow();
    expect(params.size).toBe("1760x2480");
  });

  it("allows Micu Auto size requests", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(micuProvider, micuImpl, {
        prompt: "a cat",
        mode: "text2image",
        size: "auto",
        n: 1
      })
    ).not.toThrow();
  });

  it("rejects Micu non-16-aligned custom sizes", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(micuProvider, micuImpl, {
        prompt: "a cat",
        mode: "text2image",
        size: "1512x1512",
        n: 1
      })
    ).toThrow("divisible by 16");
    expect(() =>
      assertProviderSupportsGenerateParams(micuProvider, micuImpl, {
        prompt: "a cat",
        mode: "text2image",
        size: "1501x1001",
        n: 1
      })
    ).toThrow("divisible by 16");
  });

  it("rejects Micu high-resolution multi-image tasks before provider billing", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(micuProvider, micuImpl, {
        prompt: "a cat",
        mode: "text2image",
        size: "2048x2048",
        n: 2
      })
    ).toThrow("Micu 2K/4K generation supports one image per task");
  });
});
