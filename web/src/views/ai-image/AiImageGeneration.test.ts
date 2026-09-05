// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { apiFetch } from "@/api/client";
import AiImageGeneration from "./AiImageGeneration.vue";
import { mountStudio, task } from "./studioTestUtils";

vi.mock("@/api/client", () => ({ apiFetch: vi.fn() }));
let wrapper: VueWrapper;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path.startsWith("/tasks/")) return { summary: task("completed") } as never;
    if (path.startsWith("/prompt-cases"))
      return {
        items: [],
        facets: { categories: [], modes: [], sizes: [] },
        pageInfo: { nextCursor: null, hasMore: false, limit: 60 }
      } as never;
    return undefined as never;
  });
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
});

describe("AI image studio page", () => {
  it("keeps partial results alongside the failure reason and retry action", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      summary: {
        ...task("partial"),
        status: "failed",
        phase: "failed",
        errorMessage: "部分图片生成失败"
      }
    });
    ({ wrapper } = await mountStudio("/ai-image?task=partial", AiImageGeneration));
    expect(wrapper.find('img[src="/api/i/partial-image"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("部分图片生成失败");
    expect(wrapper.findAll("button").some((button) => button.text().includes("重试"))).toBe(true);
  });
  it("opens the editor immediately and switches mobile views without losing typed input", async () => {
    ({ wrapper } = await mountStudio("/ai-image", AiImageGeneration));
    expect(wrapper.get("h1").text()).toBe("AI 图像生成");
    expect(wrapper.find(".studio-editor").exists()).toBe(true);
    const prompt = wrapper.get("textarea");
    await prompt.setValue("A careful product photograph");
    const tabs = wrapper.findAll(".image-studio-mobile-tabs button");
    await tabs[1].trigger("click");
    expect(wrapper.get(".image-studio").classes()).toContain("image-studio--results");
    await tabs[0].trigger("click");
    expect((prompt.element as HTMLTextAreaElement).value).toBe("A careful product photograph");
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("opens cases on demand while keeping the editor in place", async () => {
    ({ wrapper } = await mountStudio("/ai-image", AiImageGeneration));
    const choose = wrapper.findAll("button").find((button) => button.text() === "选择案例")!;
    await choose.trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("选择案例");
    expect(wrapper.find(".studio-editor").exists()).toBe(true);
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path.startsWith("/prompt-cases"))).toBe(
      true
    );
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === "/generate")).toBe(false);
  });
  it("shows restored results and creates a clean URL from the new-creation command", async () => {
    const mounted = await mountStudio("/ai-image?task=completed", AiImageGeneration);
    wrapper = mounted.wrapper;
    expect(wrapper.get(".image-studio").classes()).toContain("image-studio--results");
    expect(wrapper.find('img[src="/api/i/completed-image"]').exists()).toBe(true);
    await wrapper.get('button[aria-label="新建创作"]').trigger("click");
    await flushPromises();
    expect(mounted.router.currentRoute.value.query).toEqual({ mode: "blank" });
    expect(wrapper.get(".image-studio").classes()).toContain("image-studio--create");
  });
});
