// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AiImagePromptPanel from "./AiImagePromptPanel.vue";
import type { ProviderCapabilities } from "@/stores/auth";
import type { ImageAttachment } from "@/stores/session";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";
import type { SizeOption } from "@/views/workspace/workspaceOptions";

type PanelProps = {
  caseItem: PromptCase | null;
  assistantEnabled: boolean;
  canResetPrompt: boolean;
  selectedCaseTitle: string;
  prompt: string;
  mode: PromptCaseMode;
  supportedModes: PromptCaseMode[];
  size: string;
  sizeFallbackNotice: string;
  sizeOptions: SizeOption[];
  provider: ProviderCapabilities | null;
  referenceCount: number;
  previews: Array<{ file: File; url: string }>;
  resultImages: ImageAttachment[];
  activeFailed: boolean;
  failedTitle: string;
  failedMessage: string;
  generationProgress: number;
  generationPrompt: string;
  generationStatusLabel: string;
  submitting: boolean;
  hasRunningTask: boolean;
  workflowExpanded: boolean;
};

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key
  })
}));

vi.mock("./AiImageFailurePanel.vue", () => ({
  default: { template: '<section data-testid="failure-panel"></section>' }
}));

vi.mock("./AiImageReferenceInput.vue", () => ({
  default: { template: '<section data-testid="reference-input"></section>' }
}));

vi.mock("./PromptAssistantPanel.vue", () => ({
  default: { template: '<section data-testid="assistant-panel"></section>' }
}));

vi.mock("./PromptCaseThumbnail.vue", () => ({
  default: {
    props: ["src", "alt", "fit", "iconClass"],
    template: '<div data-testid="case-thumbnail" :data-fit="fit">{{ alt }}</div>'
  }
}));

describe("AiImagePromptPanel", () => {
  it("uses the case title directly and lets the preview image fill its frame", () => {
    const wrapper = mount(AiImagePromptPanel, {
      props: panelProps({
        caseItem: promptCase({ title: "九宫格写真组图", thumbnailUrl: "/case.png" }),
        selectedCaseTitle: "九宫格写真组图"
      })
    });

    expect(wrapper.text()).toContain("九宫格写真组图");
    expect(wrapper.text()).not.toContain("aiImage.selectedCase");
    expect(wrapper.get('[data-testid="case-thumbnail"]').attributes("data-fit")).toBe("cover");
  });

  it("keeps long running prompts inside the progress layout", () => {
    const longPrompt = "一幅充满奇幻色彩的电影场景，".repeat(20);
    const wrapper = mount(AiImagePromptPanel, {
      props: panelProps({
        generationPrompt: longPrompt,
        generationProgress: 42,
        hasRunningTask: true
      })
    });

    expect(wrapper.get(".ai-generation-progress").attributes("role")).toBe("status");
    expect(wrapper.get(".ai-generation-progress-track").attributes("role")).toBe("progressbar");
    expect(wrapper.get(".ai-generation-progress-track").attributes("aria-valuenow")).toBe("42");
    expect(wrapper.get(".ai-generation-progress-prompt").text()).toBe(longPrompt);
    expect(wrapper.find(".ai-generation-progress-prompt.truncate").exists()).toBe(false);
  });
});

function panelProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    activeFailed: false,
    assistantEnabled: true,
    canResetPrompt: false,
    caseItem: null,
    failedMessage: "",
    failedTitle: "",
    generationProgress: 6,
    generationPrompt: "",
    generationStatusLabel: "排队中",
    hasRunningTask: false,
    mode: "image2image" as PromptCaseMode,
    previews: [],
    prompt: "prompt",
    provider: null as ProviderCapabilities | null,
    referenceCount: 0,
    resultImages: [] as ImageAttachment[],
    selectedCaseTitle: "案例名称",
    size: "1024x1024",
    sizeFallbackNotice: "",
    sizeOptions: [{ value: "1024x1024", ratio: "1:1", label: "1024 x 1024" }] as SizeOption[],
    submitting: false,
    supportedModes: ["image2image", "text2image"] as PromptCaseMode[],
    workflowExpanded: true,
    ...overrides
  };
}

function promptCase(overrides: Partial<PromptCase> = {}): PromptCase {
  return {
    id: "case_1",
    title: "案例名称",
    category: "人像与摄影",
    modes: ["image2image", "text2image"],
    recommendedSize: "2:3",
    tags: [],
    promptTemplate: "prompt",
    promptSummary: "summary",
    thumbnailUrl: null,
    sourceUrl: null,
    sourceAuthor: null,
    sourceLicense: "internal",
    sourceRepo: null,
    popularity: {},
    status: "published",
    featured: false,
    sortOrder: 1,
    locale: "zh-CN",
    createdBy: null,
    updatedBy: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}
