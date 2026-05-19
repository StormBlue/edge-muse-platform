import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { apiFetch } from "@/api/client";
import type { GenerationEntry } from "@/api/generation";
import { useAuthStore } from "./auth";

vi.mock("@/api/client", () => ({
  apiFetch: vi.fn()
}));

const mockedApiFetch = vi.mocked(apiFetch);

const generationEntry: GenerationEntry = {
  navTarget: "/ai-image",
  showWorkspace: false,
  showAiImage: true
};

describe("auth store generation entry", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApiFetch.mockReset();
  });

  it("persists the generation entry assignment returned by /me", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      user: {
        id: "usr_1",
        email: "user@example.com",
        username: "user",
        nickname: "User",
        role: "user",
        status: "active"
      },
      quota: { allocatedQuota: 10, usedQuota: 2, remainingQuota: 8 },
      providerCapabilities: null,
      generationTargets: [
        {
          id: "micu_grok",
          label: "米醋 Grok 图像",
          experimental: true,
          providerCapabilities: {
            providerId: "prv_micu_grok",
            providerName: "米醋 Grok 图像",
            providerKeyId: "key_grok",
            providerKeyGroupId: "grp_grok",
            providerKeyGroupName: "Grok",
            requestFormat: "micu_grok_images",
            model: "grok-imagine-image-pro",
            supportedModes: ["text2image", "image2image"],
            supportedSizes: ["1024x1024"],
            maxReferenceImages: 1
          }
        }
      ],
      generationEntry,
      promptAssistantEnabled: false
    });

    const auth = useAuthStore();
    await auth.bootstrap();

    expect(mockedApiFetch).toHaveBeenCalledWith("/me");
    expect(auth.generationEntry).toEqual(generationEntry);
    expect(auth.generationTargets).toHaveLength(1);
    expect(auth.generationTargets[0]?.id).toBe("micu_grok");
    expect(auth.promptAssistantEnabled).toBe(false);
    expect(auth.loaded).toBe(true);
  });

  it("clears generation assignment when logout resets local auth state", async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const auth = useAuthStore();
    auth.generationEntry = generationEntry;
    auth.generationTargets = [
      {
        id: "micu_grok",
        label: "米醋 Grok 图像",
        experimental: true,
        providerCapabilities: {
          providerId: "prv_micu_grok",
          providerName: "米醋 Grok 图像",
          providerKeyId: "key_grok",
          providerKeyGroupId: "grp_grok",
          providerKeyGroupName: "Grok",
          requestFormat: "micu_grok_images",
          model: "grok-imagine-image-pro",
          supportedModes: ["text2image"],
          supportedSizes: ["1024x1024"],
          maxReferenceImages: 1
        }
      }
    ];
    auth.promptAssistantEnabled = false;

    await auth.logout();

    expect(auth.generationEntry).toBeNull();
    expect(auth.generationTargets).toEqual([]);
    expect(auth.promptAssistantEnabled).toBe(true);
    expect(auth.user).toBeNull();
  });
});
