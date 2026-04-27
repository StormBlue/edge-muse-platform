import { describe, expect, it } from "vitest";
import { assertProviderSupportsGenerateParams } from "../src/lib/tasks";
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

describe("provider capability validation", () => {
  const providerImpl = new OpenAIImagesProvider();

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

  it("rejects Cubence chat before task creation", () => {
    expect(() =>
      assertProviderSupportsGenerateParams(cubenceProvider, providerImpl, {
        prompt: "continue",
        mode: "chat",
        size: "1024x1024",
        n: 1
      })
    ).toThrow("Cubence does not support chat mode");
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
});
