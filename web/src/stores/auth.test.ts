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
      generationEntry,
      promptAssistantEnabled: false
    });

    const auth = useAuthStore();
    await auth.bootstrap();

    expect(mockedApiFetch).toHaveBeenCalledWith("/me");
    expect(auth.generationEntry).toEqual(generationEntry);
    expect(auth.promptAssistantEnabled).toBe(false);
    expect(auth.loaded).toBe(true);
  });

  it("clears generation assignment when logout resets local auth state", async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const auth = useAuthStore();
    auth.generationEntry = generationEntry;
    auth.promptAssistantEnabled = false;

    await auth.logout();

    expect(auth.generationEntry).toBeNull();
    expect(auth.promptAssistantEnabled).toBe(true);
    expect(auth.user).toBeNull();
  });
});
