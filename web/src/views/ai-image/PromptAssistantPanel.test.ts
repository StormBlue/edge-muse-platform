// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/api/client";
import PromptAssistantPanel from "./PromptAssistantPanel.vue";
import type { AssistantResponse } from "./promptAssistantTypes";
import type { PromptCase } from "@/types/promptCases";

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

  function mountAssistant(currentPrompt = "原始提示词") {
    return mount(PromptAssistantPanel, {
      props: {
        mode: "text2image",
        caseItem: null,
        provider: null,
        referenceCount: 0,
        referenceDescription: "",
        referenceContextKey: "",
        currentPrompt,
        creativeBrief: "必须保留品牌标志"
      }
    });
  }

  it("requires renewed confirmation when the prompt changes in flight or while confirming", async () => {
    let resolve!: (response: AssistantResponse) => void;
    mockedApiFetch.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const wrapper = mountAssistant();
    await wrapper.find("textarea").setValue("优化构图");
    await wrapper.find("form").trigger("submit.prevent");
    await wrapper.setProps({ currentPrompt: "用户在等待期间新增的重要要求" });
    resolve({ ...assistantResponse("完成"), finalPrompt: "建议内容" });
    await flushPromises();
    expect(wrapper.emitted("fill")).toBeUndefined();
    await wrapper.get('[data-testid="apply-assistant"]').trigger("click");
    expect(wrapper.emitted("fill")).toBeUndefined();
    expect(wrapper.text()).toContain("用户在等待期间新增的重要要求");
    await wrapper.setProps({ currentPrompt: "再次修改" });
    await wrapper.get('[data-testid="apply-assistant"]').trigger("click");
    expect(wrapper.emitted("fill")).toBeUndefined();
    await wrapper.get('[data-testid="apply-assistant"]').trigger("click");
    expect(wrapper.emitted("fill")).toHaveLength(1);
  });

  it("appends only selected paragraphs to the latest prompt", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...assistantResponse("完成"),
      finalPrompt: "保留主体\n\n柔和侧光\n背景留白"
    });
    const wrapper = mountAssistant();
    await wrapper.get('[data-testid="finalize-assistant-prompt"]').trigger("click");
    await flushPromises();
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true);
    await wrapper.setProps({ currentPrompt: "最新要求" });
    await wrapper.get('[data-testid="append-assistant"]').trigger("click");
    expect(wrapper.emitted("fill")?.[0]?.[0]).toMatchObject({
      prompt: "最新要求\n\n柔和侧光",
      recommendedSize: "",
      auto: false
    });
  });

  it("preserves failed input for retry without duplicate conversation entries", async () => {
    mockedApiFetch.mockRejectedValueOnce({ error: { message: "暂时不可用" } });
    mockedApiFetch.mockResolvedValueOnce(assistantResponse("继续完善"));
    const wrapper = mountAssistant();
    await wrapper.find("textarea").setValue("保留这个输入");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(wrapper.find("textarea").element.value).toBe("保留这个输入");
    expect(wrapper.text()).toContain("暂时不可用");
    await wrapper.get('[data-testid="retry-assistant"]').trigger("click");
    await flushPromises();
    const request = JSON.parse(String(mockedApiFetch.mock.calls[1]?.[1]?.body));
    expect(
      request.messages.filter((message: { content: string }) => message.content === "保留这个输入")
    ).toHaveLength(1);
    expect(request.messages[0].content).toContain("原始提示词");
    expect(request.messages[0].content).toContain("必须保留品牌标志");
  });

  it.each(["referenceContextKey", "accountContextKey"] as const)(
    "suppresses pending replies after %s changes even when disabled",
    async (key) => {
      let resolve!: (response: AssistantResponse) => void;
      mockedApiFetch.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      const wrapper = mountAssistant();
      await wrapper.get('[data-testid="finalize-assistant-prompt"]').trigger("click");
      await wrapper.setProps({ [key]: "new-context", disabled: true });
      resolve({ ...assistantResponse("过时回复"), finalPrompt: "过时内容" });
      await flushPromises();
      expect(wrapper.text()).not.toContain("过时回复");
      expect(wrapper.find('[data-testid="assistant-suggestion"]').exists()).toBe(false);
      expect(wrapper.emitted("fill")).toBeUndefined();
    }
  );

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
      signal: expect.any(AbortSignal),
      body: expect.stringContaining("白色耳机，保留 Logo 和正面角度")
    });
  });

  it("sends enriched prompt case context to the assistant", async () => {
    mockedApiFetch.mockResolvedValueOnce(assistantResponse("先确认商品主体。"));
    const wrapper = mount(PromptAssistantPanel, {
      props: {
        mode: "text2image",
        caseItem: promptCase(),
        provider: null,
        referenceCount: 0,
        referenceDescription: "",
        referenceContextKey: ""
      }
    });

    await wrapper.find("textarea").setValue("我要做一张新品咖啡海报");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    const request = mockedApiFetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      caseId: "case-product-poster",
      caseTitle: "新品商品海报",
      casePromptSummary: "清爽夏日棚拍风格，突出新品卖点和留白文案区",
      casePromptTemplate: "生成一张适合电商投放的商品海报，主体清晰，背景干净。",
      caseCategory: "商品广告",
      caseTags: ["电商", "清爽"],
      caseRecommendedSize: "3:4"
    });
  });

  it("sends with Enter and keeps Ctrl or Shift Enter for new lines", async () => {
    mockedApiFetch.mockResolvedValueOnce(assistantResponse("先确认商品主体。"));
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

    await wrapper.find("textarea").setValue("普通 Enter 发送");
    await wrapper.find("textarea").trigger("keydown.enter");
    await flushPromises();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    mockedApiFetch.mockReset();
    await wrapper.find("textarea").setValue("需要保留换行");
    await wrapper.find("textarea").trigger("keydown.enter", { ctrlKey: true });
    await wrapper.find("textarea").trigger("keydown.enter", { shiftKey: true });
    await flushPromises();

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("only applies the editable suggestion on explicit acceptance", async () => {
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

    expect(wrapper.emitted("fill")).toBeUndefined();
    await wrapper.get('[data-testid="assistant-suggestion"]').setValue("手动确认的 prompt");
    await wrapper.get('[data-testid="apply-assistant"]').trigger("click");
    expect(wrapper.emitted("fill")?.[0]).toEqual([
      { prompt: "手动确认的 prompt", recommendedSize: "", turnCount: 1, auto: false }
    ]);
  });

  it("keeps fallback warnings with the final prompt instead of showing the degraded chat footer", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...assistantResponse("信息已经足够，我先给你一版可直接生成的专业描述。"),
      readiness: "ready",
      finalPrompt: "最终 prompt",
      warnings: ["请人工确认文字和品牌元素。"],
      degraded: true
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

    await wrapper.find("textarea").setValue("按照模板来就行");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("review.title");
    expect(wrapper.text()).toContain("请人工确认文字和品牌元素。");
    expect(wrapper.text()).not.toContain("aiImage.assistantDegraded");
  });

  it("force-finalizes a prompt from the current case context", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...assistantResponse("Prompt 已生成。"),
      readiness: "ready",
      finalPrompt: "根据当前案例生成的 prompt",
      recommendedSize: "1024x1536"
    });
    const wrapper = mount(PromptAssistantPanel, {
      props: {
        mode: "text2image",
        caseItem: promptCase(),
        provider: null,
        referenceCount: 0,
        referenceDescription: "",
        referenceContextKey: ""
      }
    });

    await wrapper.get('[data-testid="finalize-assistant-prompt"]').trigger("click");
    await flushPromises();

    const request = mockedApiFetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      forceFinalize: true,
      turnIndex: 0,
      messages: [],
      caseId: "case-product-poster"
    });
    expect(wrapper.emitted("fill")).toBeUndefined();
    await wrapper.get('[data-testid="apply-assistant"]').trigger("click");
    expect(wrapper.emitted("fill")?.[0]).toEqual([
      {
        prompt: "根据当前案例生成的 prompt",
        recommendedSize: "",
        turnCount: 1,
        auto: false
      }
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

function promptCase(): PromptCase {
  return {
    id: "case-product-poster",
    title: "新品商品海报",
    category: "商品广告",
    modes: ["text2image"],
    recommendedSize: "3:4",
    tags: ["电商", "清爽"],
    promptTemplate: "生成一张适合电商投放的商品海报，主体清晰，背景干净。",
    promptSummary: "清爽夏日棚拍风格，突出新品卖点和留白文案区",
    thumbnailUrl: null,
    sourceUrl: null,
    sourceAuthor: null,
    sourceLicense: "internal",
    sourceRepo: null,
    popularity: {},
    status: "published",
    featured: true,
    sortOrder: 0,
    locale: "zh-CN",
    createdBy: null,
    updatedBy: null,
    createdAt: 1,
    updatedAt: 1
  };
}
