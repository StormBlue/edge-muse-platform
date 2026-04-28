// @vitest-environment happy-dom
import { nextTick, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "@/stores/ui";
import { useAiImageCases } from "./useAiImageCases";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";

const mocks = vi.hoisted(() => ({
  listPublishedPromptCases: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn()
}));

vi.mock("@/api/promptCases", () => ({
  listPublishedPromptCases: mocks.listPublishedPromptCases
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess
  }
}));

describe("useAiImageCases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("loads published cases with the current UI locale", async () => {
    const ui = useUiStore();
    ui.setLocale("en-US");
    mocks.listPublishedPromptCases.mockResolvedValueOnce([]);

    const cases = useAiImageCases();
    await cases.load();

    expect(mocks.listPublishedPromptCases).toHaveBeenCalledWith({ locale: "en-US" });
  });

  it("keeps case mode filters independent from the initially selected case", async () => {
    mocks.listPublishedPromptCases.mockResolvedValueOnce([
      promptCase({ id: "txt", modes: ["text2image"] }),
      promptCase({ id: "img", modes: ["image2image"] })
    ]);

    const cases = useAiImageCases();
    await cases.load();

    expect(cases.selectedId.value).toBe("txt");
    expect(cases.selectedMode.value).toBe("text2image");
    expect(cases.caseContext.value).toBeNull();
    expect(cases.finalPrompt.value).toBe("");
    expect(cases.finalPromptSource.value).toBeNull();
    expect(cases.filterMode.value).toBe("");
    expect(cases.filteredItems.value.map((item) => item.id)).toEqual(["txt", "img"]);
  });

  it("hides cases unsupported by the current provider capabilities", () => {
    const providerModes = ref<PromptCaseMode[]>(["text2image"]);
    const cases = useAiImageCases({ supportedModes: providerModes });
    cases.items.value = [
      promptCase({ id: "txt", modes: ["text2image"] }),
      promptCase({ id: "img", modes: ["image2image"] }),
      promptCase({ id: "mixed", modes: ["image2image", "text2image"] })
    ];

    expect(cases.availableItems.value.map((item) => item.id)).toEqual(["txt", "mixed"]);
    expect(cases.filteredItems.value.map((item) => item.id)).toEqual(["txt", "mixed"]);
  });

  it("recalculates selected mode when provider capabilities shrink but the case remains usable", async () => {
    const providerModes = ref<PromptCaseMode[]>(["image2image", "text2image"]);
    const mixed = promptCase({ id: "mixed", modes: ["image2image", "text2image"] });
    const cases = useAiImageCases({ supportedModes: providerModes });
    cases.items.value = [mixed];

    cases.selectCase(mixed);
    providerModes.value = ["text2image"];
    await nextTick();

    expect(cases.selectedId.value).toBe("mixed");
    expect(cases.selectedMode.value).toBe("text2image");
  });

  it("clears stale case prompts when provider capabilities leave no available cases", async () => {
    const providerModes = ref<PromptCaseMode[]>(["image2image"]);
    const cases = useAiImageCases({ supportedModes: providerModes });
    const imageCase = promptCase({ id: "img", modes: ["image2image"] });
    cases.items.value = [imageCase];

    cases.selectCase(imageCase);
    providerModes.value = ["text2image"];
    await nextTick();

    expect(cases.selectedId.value).toBeNull();
    expect(cases.finalPrompt.value).toBe("");
    expect(cases.finalPromptSource.value).toBeNull();
    expect(cases.selectedMode.value).toBe("text2image");
  });

  it("keeps user-written prompts when no provider-compatible cases remain", async () => {
    const providerModes = ref<PromptCaseMode[]>(["image2image"]);
    const cases = useAiImageCases({ supportedModes: providerModes });
    cases.items.value = [promptCase({ id: "img", modes: ["image2image"] })];
    cases.setPrompt("用户手写 prompt", "user");

    providerModes.value = ["text2image"];
    await nextTick();

    expect(cases.selectedId.value).toBeNull();
    expect(cases.finalPrompt.value).toBe("用户手写 prompt");
    expect(cases.finalPromptSource.value).toBe("user");
  });

  it("applies a supported filter mode without polluting the filter itself", () => {
    const mixed = promptCase({ id: "mixed", modes: ["image2image", "text2image"] });
    const cases = useAiImageCases();
    cases.items.value = [mixed];
    cases.filterMode.value = "text2image";

    const result = cases.selectCase(mixed);

    expect(result.mode).toBe("text2image");
    expect(cases.selectedMode.value).toBe("text2image");
    expect(cases.filterMode.value).toBe("text2image");
  });

  it("keeps automatic previews out of assistant case context until the user selects a case", () => {
    const first = promptCase({ id: "first" });
    const second = promptCase({ id: "second" });
    const cases = useAiImageCases();
    cases.items.value = [first, second];

    cases.previewCase(first);
    expect(cases.selectedId.value).toBe("first");
    expect(cases.caseContext.value).toBeNull();

    cases.previewCase(second, { userSelected: true });
    expect(cases.selectedId.value).toBe("second");
    expect(cases.caseContext.value?.id).toBe("second");
  });
});

function promptCase(overrides: Partial<PromptCase> = {}): PromptCase {
  const id = overrides.id ?? "case_1";
  return {
    id,
    title: id,
    category: "商业广告",
    modes: ["text2image"],
    recommendedSize: "1024x1024",
    tags: ["测试"],
    promptTemplate: `${id} prompt`,
    promptSummary: `${id} summary`,
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
