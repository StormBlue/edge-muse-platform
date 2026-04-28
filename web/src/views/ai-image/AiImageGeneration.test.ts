// @vitest-environment happy-dom
import { computed, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiImageGeneration from "./AiImageGeneration.vue";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";
import type { SizeOption } from "@/views/workspace/workspaceOptions";

const mocks = vi.hoisted(() => ({
  generation: null as unknown,
  cases: null as unknown,
  trackExperimentEvent: vi.fn()
}));

vi.mock("@/api/experiments", () => ({
  trackExperimentEvent: mocks.trackExperimentEvent
}));

vi.mock("@/components/layout/AppShell.vue", () => ({
  default: { template: "<main><slot /></main>" }
}));

vi.mock("./PromptCaseGallery.vue", () => ({
  default: {
    props: ["items", "loading", "selectedId"],
    template: '<section data-testid="gallery"></section>'
  }
}));

vi.mock("./PromptCaseDetail.vue", () => ({
  default: {
    props: ["item"],
    emits: ["apply"],
    template: '<section data-testid="detail"></section>'
  }
}));

vi.mock("./PromptCaseMobileSheet.vue", () => ({
  default: {
    props: ["item", "open"],
    emits: ["apply", "close"],
    template: '<section data-testid="sheet"></section>'
  }
}));

vi.mock("./AiImagePromptPanel.vue", () => ({
  default: {
    name: "AiImagePromptPanel",
    props: ["mode", "size", "sizeFallbackNotice"],
    emits: [
      "addFiles",
      "clearPrompt",
      "copyPrompt",
      "fillAssistant",
      "removeFile",
      "submit",
      "update:mode",
      "update:prompt",
      "update:size"
    ],
    template: '<section data-testid="prompt-panel">{{ mode }}|{{ sizeFallbackNotice }}</section>'
  }
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    quota: { allocatedQuota: null, usedQuota: 0, remainingQuota: null },
    providerCapabilities: null
  })
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key
  })
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock("./useAiImageGenerationSubmit", () => ({
  useAiImageGenerationSubmit: () => mocks.generation
}));

vi.mock("./useAiImageCases", () => ({
  useAiImageCases: () => mocks.cases
}));

describe("AiImageGeneration", () => {
  beforeEach(() => {
    mocks.trackExperimentEvent.mockReset();
    mocks.generation = generationState();
    mocks.cases = casesState();
  });

  it("syncs generation mode and size fallback when selected case context changes", async () => {
    const wrapper = mount(AiImageGeneration);
    const generation = mocks.generation as ReturnType<typeof generationState>;
    const cases = mocks.cases as ReturnType<typeof casesState>;

    cases.selected.value = promptCase({ modes: ["image2image", "text2image"] });
    cases.selectedMode.value = "image2image";
    await nextTick();
    await nextTick();

    expect(generation.mode.value).toBe("image2image");
    expect(generation.size.value).toBe("1024x1024");
    expect(wrapper.text()).toContain("aiImage.sizeFallback:3:4|1024x1024");

    generation.supportedModes.value = ["text2image"];
    cases.selectedMode.value = "text2image";
    await nextTick();
    await nextTick();

    expect(generation.mode.value).toBe("text2image");
  });

  it("does not attribute user-written prompts to the selected case", async () => {
    const wrapper = mount(AiImageGeneration);
    const generation = mocks.generation as ReturnType<typeof generationState>;
    const cases = mocks.cases as ReturnType<typeof casesState>;
    const selected = promptCase({ id: "case_user_context", title: "案例标题" });
    cases.selected.value = selected;
    cases.finalPrompt.value = "用户手写 prompt";
    cases.finalPromptSource.value = "user";

    await wrapper.findComponent({ name: "AiImagePromptPanel" }).vm.$emit("submit");

    expect(generation.submit).toHaveBeenCalledWith("用户手写 prompt", undefined, {
      route: "/ai-image",
      caseId: undefined,
      metadata: {
        mode: "text2image",
        size: "1024x1024",
        referenceImageCount: 0,
        promptSource: "user",
        caseContextId: "case_user_context",
        directAccess: false
      }
    });
  });
});

function generationState() {
  const supportedModes = ref<PromptCaseMode[]>(["image2image", "text2image"]);
  const sizeOptions = ref<SizeOption[]>([{ value: "1024x1024", ratio: "1:1", label: "Square" }]);
  return {
    files: ref([]),
    hasRunningTask: ref(false),
    maxReferenceFiles: ref(5),
    mode: ref<PromptCaseMode>("text2image"),
    previews: ref([]),
    resultImages: ref([]),
    sessions: {},
    size: ref("1024x1024"),
    sizeOptions,
    status: ref("closed"),
    submitting: ref(false),
    supportedModes,
    addFiles: vi.fn(),
    clearFiles: vi.fn(),
    removeFile: vi.fn(),
    submit: vi.fn()
  };
}

function casesState() {
  const selected = ref<PromptCase | null>(null);
  const items = ref<PromptCase[]>([]);
  return {
    availableItems: computed(() => items.value),
    categories: computed(() => []),
    category: ref(""),
    filteredItems: computed(() => items.value),
    finalPrompt: ref(""),
    finalPromptSource: ref<"case" | "assistant" | "user" | null>(null),
    filterMode: ref(""),
    items,
    loading: ref(false),
    search: ref(""),
    selected,
    selectedId: ref(null),
    selectedMode: ref<PromptCaseMode>("text2image"),
    size: ref(""),
    sizes: computed(() => []),
    applyCasePrompt: vi.fn(),
    clearPrompt: vi.fn(),
    load: vi.fn(),
    selectCase: vi.fn(),
    setPrompt: vi.fn()
  };
}

function promptCase(overrides: Partial<PromptCase> = {}): PromptCase {
  return {
    id: "case_1",
    title: "case",
    category: "商业广告",
    modes: ["image2image", "text2image"],
    recommendedSize: "3:4",
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
