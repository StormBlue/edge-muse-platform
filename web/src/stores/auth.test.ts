import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { apiFetch } from "@/api/client";
import { useAuthStore, type GenerationExperience } from "./auth";

vi.mock("@/api/client", () => ({
  apiFetch: vi.fn()
}));

const mockedApiFetch = vi.mocked(apiFetch);

const generationExperience: GenerationExperience = {
  experimentKey: "generation_experience",
  status: "running",
  strategy: "ab_test",
  variant: "B",
  navTarget: "/ai-image",
  showLegacy: false,
  showAi: true
};

describe("auth store generation experience", () => {
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
      generationExperience,
      promptAssistantEnabled: false
    });

    const auth = useAuthStore();
    await auth.bootstrap();

    expect(mockedApiFetch).toHaveBeenCalledWith("/me");
    expect(auth.generationExperience).toEqual(generationExperience);
    expect(auth.promptAssistantEnabled).toBe(false);
    expect(auth.loaded).toBe(true);
  });

  it("clears generation assignment when logout resets local auth state", async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const auth = useAuthStore();
    auth.generationExperience = generationExperience;
    auth.promptAssistantEnabled = false;

    await auth.logout();

    expect(auth.generationExperience).toBeNull();
    expect(auth.promptAssistantEnabled).toBe(true);
    expect(auth.user).toBeNull();
  });
});
