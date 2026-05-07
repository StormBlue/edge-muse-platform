import { describe, expect, it } from "vitest";
import { assertProviderSupportsGenerateParams } from "../src/lib/tasks";
import { MicuImagesProvider } from "../src/providers/openai-compatible";
import { OpenAIImagesProvider } from "../src/providers/openai-images";
import type { Provider } from "../src/db/schema";

const cubenceProvider: Provider = {
  id: "prv_cubence",
  name: "Cubence",
  baseUrl: "https://api-dmit.cubence.com",
  defaultModel: "gpt-image-2",
  requestFormat: "openai_images",
  supportedSizes: JSON.stringify(["1024x1024", "2048x2048"]),
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null
};

const micuProvider: Provider = {
  id: "prv_micu",
  name: "Micu",
  baseUrl: "https://www.openclaudecode.cn",
  defaultModel: "gpt-image-2",
  requestFormat: "micu_images",
  supportedSizes: JSON.stringify(["1024x1024", "2048x2048"]),
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

  it("rejects Micu image-to-image high-resolution sizes before provider billing", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(micuProvider, micuImpl, {
        prompt: "replace background",
        mode: "image2image",
        size: "2048x2048",
        n: 1,
        referenceImageIds: ["img_1"]
      })
    ).toThrow("Micu image-to-image only supports 1K sizes");
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
