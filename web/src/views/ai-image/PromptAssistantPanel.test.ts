// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/api/client";
import PromptAssistantPanel from "./PromptAssistantPanel.vue";
import type { AssistantResponse } from "./promptAssistantTypes";

const mocks = vi.hoisted(() => ({
  trackExperimentEvent: vi.fn()
}));

vi.mock("@/api/client", () => ({
  apiFetch: vi.fn()
}));

vi.mock("@/api/experiments", () => ({
  trackExperimentEvent: mocks.trackExperimentEvent
}));

vi.mock("@/stores/ui", () => ({
  useUiStore: () => ({ locale: "zh-CN" })
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key
  })
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("PromptAssistantPanel", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mocks.trackExperimentEvent.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("resets assistant history when image-to-image reference count changes", async () => {
    mockedApiFetch.mockResolvedValueOnce(assistantResponse("请补充参考图要保留的主体。"));
    const wrapper = mount(PromptAssistantPanel, {
      props: {
        mode: "image2image",
        caseItem: null,
        directAccess: false,
        provider: null,
        referenceCount: 1,
        referenceContextKey: "first.png:image/png:100:1"
      }
    });

    await wrapper.find("textarea").setValue("做成电商海报");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("做成电商海报");
    expect(wrapper.text()).toContain("请补充参考图要保留的主体。");

    await wrapper.setProps({
      referenceCount: 2,
      referenceContextKey: "first.png:image/png:100:1|second.png:image/png:120:2"
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("做成电商海报");
    expect(wrapper.text()).not.toContain("请补充参考图要保留的主体。");
    expect(wrapper.text()).toContain("aiImage.assistantEmpty");
  });

  it("resets assistant history when references are replaced with the same count", async () => {
    mockedApiFetch.mockResolvedValueOnce(assistantResponse("请描述新背景。"));
    const wrapper = mount(PromptAssistantPanel, {
      props: {
        mode: "image2image",
        caseItem: null,
        directAccess: false,
        provider: null,
        referenceCount: 1,
        referenceContextKey: "old.png:image/png:100:1"
      }
    });

    await wrapper.find("textarea").setValue("保留人物，替换背景");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("保留人物，替换背景");
    expect(wrapper.text()).toContain("请描述新背景。");

    await wrapper.setProps({ referenceContextKey: "new.png:image/png:100:2" });
    await flushPromises();

    expect(wrapper.text()).not.toContain("保留人物，替换背景");
    expect(wrapper.text()).not.toContain("请描述新背景。");
    expect(wrapper.text()).toContain("aiImage.assistantEmpty");
  });

  it("tracks assistant start with direct-access metadata on the first turn", async () => {
    mockedApiFetch.mockResolvedValueOnce(assistantResponse("先确定产品卖点。"));
    const wrapper = mount(PromptAssistantPanel, {
      props: {
        mode: "text2image",
        caseItem: null,
        directAccess: true,
        provider: null,
        referenceCount: 0,
        referenceContextKey: ""
      }
    });

    await wrapper.find("textarea").setValue("我要做一张新品海报");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(mocks.trackExperimentEvent).toHaveBeenCalledWith({
      eventName: "assistant_started",
      route: "/ai-image",
      caseId: undefined,
      metadata: { mode: "text2image", directAccess: true }
    });
  });
});

function assistantResponse(message: string): AssistantResponse {
  return {
    assistantMessage: message,
    readiness: "collecting",
    brief: {},
    finalPrompt: null,
    recommendedSize: "1024x1024",
    warnings: [],
    degraded: false
  };
}
