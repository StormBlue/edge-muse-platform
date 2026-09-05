// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { useImageRecreation } from "./useImageRecreation";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  auth: { isSysadmin: false, generationEntry: { showAiImage: true, showWorkspace: true } }
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));

describe("own result recreation routing", () => {
  it.each([true, false])(
    "selects an enabled destination when AI entry is %s",
    async (showAiImage) => {
      mocks.push.mockReset();
      mocks.auth.generationEntry = { showAiImage, showWorkspace: true };
      const { recreate } = useImageRecreation();
      await recreate({
        image: { id: "image", taskId: "task", url: "/image", mime: "image/png", byteSize: 1 },
        reuse: "reference"
      });
      expect(mocks.push).toHaveBeenCalledWith({
        path: showAiImage ? "/ai-image" : "/workspace",
        query: { mode: "blank", sourceTask: "task", reuse: "reference", image: "image" }
      });
    }
  );
  it("does not navigate when generation is unavailable", async () => {
    mocks.push.mockReset();
    mocks.auth.generationEntry = { showAiImage: false, showWorkspace: false };
    const { recreate, canRecreate } = useImageRecreation();
    expect(canRecreate.value).toBe(false);
    await recreate({
      image: { id: "image", taskId: "task", url: "/image", mime: "image/png", byteSize: 1 },
      reuse: "params"
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
