// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/api/client";
import PromptAssistantPanel from "./PromptAssistantPanel.vue";
import type { AssistantResponse } from "./promptAssistantTypes";

vi.mock("@/api/client", () => ({
  apiFetch: vi.fn()
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
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("resets assistant history when image-to-image reference count changes", async () => {
    mockedApiFetch.mockResolvedValueOnce(assistantResponse("请补充参考图要保留的主体。"));
    const wrapper = mount(PromptAssistantPanel, {
      props: {
        mode: "image2image",
        caseItem: null,
        provider: null,
        referenceCount: 1,
        referenceDescription: "",
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
        provider: null,
        referenceCount: 1,
        referenceDescription: "",
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

  it("emits open when the assistant is focused", async () => {
    const wrapper = mount(PromptAssistantPanel, {
      props: {
        mode: "text2image",
        caseItem: null,
        provider: null,
        referenceCount: 0,
        referenceDescription: "",
        referenceContextKey: ""
      }
    });

    await wrapper.find("textarea").trigger("focusin");

    expect(wrapper.emitted("open")).toHaveLength(1);
  });

  it("sends user reference descriptions to the image-to-image assistant", async () => {
    mockedApiFetch.mockResolvedValueOnce(assistantResponse("先确定产品卖点。"));
    const wrapper = mount(PromptAssistantPanel, {
      props: {
        mode: "image2image",
        caseItem: null,
        provider: null,
        referenceCount: 1,
        referenceDescription: "白色耳机，保留 Logo 和正面角度",
        referenceContextKey: ""
      }
    });

    await wrapper.find("textarea").setValue("我要做一张新品海报");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(mockedApiFetch).toHaveBeenCalledWith("/prompt-assistant/turn", {
      method: "POST",
      body: expect.stringContaining("白色耳机，保留 Logo 和正面角度")
    });
  });

  it("emits the completed assistant turn count when filling the final prompt", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...assistantResponse("Prompt 已整理好。"),
      finalPrompt: "最终 prompt"
    });
    const wrapper = mount(PromptAssistantPanel, {
      props: {
        mode: "text2image",
        caseItem: null,
        provider: null,
        referenceCount: 0,
        referenceDescription: "",
        referenceContextKey: ""
      }
    });

    await wrapper.find("textarea").setValue("我要做一张新品海报");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();
    const buttons = wrapper.findAll("button");
    await buttons[buttons.length - 1]?.trigger("click");

    expect(wrapper.emitted("fill")?.[0]).toEqual([
      { prompt: "最终 prompt", recommendedSize: "1024x1024", turnCount: 1 }
    ]);
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
