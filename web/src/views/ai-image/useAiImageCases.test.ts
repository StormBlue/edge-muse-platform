// @vitest-environment happy-dom
import { nextTick, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "@/stores/ui";
import { useAiImageCases } from "./useAiImageCases";
import type {
  PromptCase,
  PromptCaseListItem,
  PromptCaseMode,
  PromptCasePage
} from "@/types/promptCases";

const mocks = vi.hoisted(() => ({
  getPublishedPromptCase: vi.fn(),
  listPublishedPromptCasePage: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn()
}));

vi.mock("@/api/promptCases", () => ({
  getPublishedPromptCase: mocks.getPublishedPromptCase,
  listPublishedPromptCasePage: mocks.listPublishedPromptCasePage
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

  it("loads the first published case page with the current UI locale", async () => {
    const ui = useUiStore();
    ui.setLocale("en-US");
    mocks.listPublishedPromptCasePage.mockResolvedValueOnce(promptCasePage([]));

    const cases = useAiImageCases();
    await cases.load();

    expect(mocks.listPublishedPromptCasePage).toHaveBeenCalledWith({
      category: "",
      cursor: null,
      limit: 60,
      locale: "en-US",
      mode: undefined,
      search: "",
      size: ""
    });
  });

  it("loads more cases by appending the next cursor page", async () => {
    mocks.listPublishedPromptCasePage
      .mockResolvedValueOnce(
        promptCasePage([promptCaseListItem({ id: "first" })], {
          hasMore: true,
          nextCursor: "cursor-1"
        })
      )
      .mockResolvedValueOnce(promptCasePage([promptCaseListItem({ id: "second" })]));

    const cases = useAiImageCases();
    await cases.load();
    await cases.loadMore();

    expect(cases.items.value.map((item) => item.id)).toEqual(["first", "second"]);
    expect(mocks.listPublishedPromptCasePage).toHaveBeenLastCalledWith({
      category: "",
      cursor: "cursor-1",
      limit: 60,
      locale: "zh-CN",
      mode: undefined,
      search: "",
      size: ""
    });
  });

  it("reloads from the first page when category changes", async () => {
    vi.useFakeTimers();
    try {
      mocks.listPublishedPromptCasePage
        .mockResolvedValueOnce(promptCasePage([promptCaseListItem({ id: "first" })]))
        .mockResolvedValueOnce(promptCasePage([promptCaseListItem({ id: "poster" })]));

      const cases = useAiImageCases();
      await cases.load();
      cases.category.value = "商品与广告";
      await nextTick();
      await vi.runAllTimersAsync();

      expect(mocks.listPublishedPromptCasePage).toHaveBeenLastCalledWith({
        category: "商品与广告",
        cursor: null,
        limit: 60,
        locale: "zh-CN",
        mode: undefined,
        search: "",
        size: ""
      });
      expect(cases.items.value.map((item) => item.id)).toEqual(["poster"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("debounces search reloads and keeps stale responses from overwriting newer filters", async () => {
    vi.useFakeTimers();
    try {
      let resolveOldSearch: (page: PromptCasePage) => void = () => undefined;
      mocks.listPublishedPromptCasePage
        .mockResolvedValueOnce(promptCasePage([promptCaseListItem({ id: "initial" })]))
        .mockImplementationOnce(
          () =>
            new Promise<PromptCasePage>((resolve) => {
              resolveOldSearch = resolve;
            })
        )
        .mockResolvedValueOnce(promptCasePage([promptCaseListItem({ id: "new" })]));

      const cases = useAiImageCases();
      await cases.load();
      cases.search.value = "旧";
      await nextTick();
      await vi.advanceTimersByTimeAsync(250);
      cases.search.value = "新";
      await nextTick();
      await vi.advanceTimersByTimeAsync(250);
      resolveOldSearch(promptCasePage([promptCaseListItem({ id: "old" })]));
      await nextTick();

      expect(cases.items.value.map((item) => item.id)).toEqual(["new"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("defaults the selected mode to image to image", () => {
    const cases = useAiImageCases();

    expect(cases.selectedMode.value).toBe("image2image");
  });

  it("keeps case mode filters independent from the initially selected case", async () => {
    mocks.listPublishedPromptCasePage.mockResolvedValueOnce(
      promptCasePage([
        promptCaseListItem({ id: "txt", modes: ["text2image"] }),
        promptCaseListItem({ id: "img", modes: ["image2image"] })
      ])
    );

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

  it("handles empty filtered pages without clearing an existing non-case prompt", async () => {
    mocks.listPublishedPromptCasePage.mockResolvedValueOnce(promptCasePage([]));
    const cases = useAiImageCases();
    cases.setPrompt("用户手写 prompt", "user");

    await cases.load();

    expect(cases.selectedId.value).toBeNull();
    expect(cases.finalPrompt.value).toBe("用户手写 prompt");
    expect(cases.finalPromptSource.value).toBe("user");
  });

  it("hides cases unsupported by the current provider capabilities", () => {
    const providerModes = ref<PromptCaseMode[]>(["text2image"]);
    const cases = useAiImageCases({ supportedModes: providerModes });
    cases.items.value = [
      promptCaseListItem({ id: "txt", modes: ["text2image"] }),
      promptCaseListItem({ id: "img", modes: ["image2image"] }),
      promptCaseListItem({ id: "mixed", modes: ["image2image", "text2image"] })
    ];

    expect(cases.availableItems.value.map((item) => item.id)).toEqual(["txt", "mixed"]);
    expect(cases.filteredItems.value.map((item) => item.id)).toEqual(["txt", "mixed"]);
  });

  it("recalculates selected mode when provider capabilities shrink but the case remains usable", async () => {
    const providerModes = ref<PromptCaseMode[]>(["image2image", "text2image"]);
    const mixed = promptCase({ id: "mixed", modes: ["image2image", "text2image"] });
    const cases = useAiImageCases({ supportedModes: providerModes });
    cases.items.value = [promptCaseListItem(mixed)];

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
    cases.items.value = [promptCaseListItem(imageCase)];

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
    cases.items.value = [promptCaseListItem({ id: "img", modes: ["image2image"] })];
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
    cases.items.value = [promptCaseListItem(mixed)];
    cases.filterMode.value = "text2image";

    const result = cases.selectCase(mixed);

    expect(result.mode).toBe("text2image");
    expect(cases.selectedMode.value).toBe("text2image");
    expect(cases.filterMode.value).toBe("text2image");
  });

  it("loads and caches details when previewing a list item", async () => {
    const listItem = promptCaseListItem({ id: "case_detail" });
    const detail = promptCase({ id: "case_detail", promptTemplate: "详情 prompt" });
    mocks.getPublishedPromptCase.mockResolvedValueOnce(detail);
    const cases = useAiImageCases();
    cases.items.value = [listItem];

    cases.previewCase(listItem, { userSelected: true });
    await nextTick();
    await nextTick();

    expect(mocks.getPublishedPromptCase).toHaveBeenCalledWith("case_detail", { locale: "zh-CN" });
    expect(cases.selectedDetail.value?.promptTemplate).toBe("详情 prompt");
    cases.previewCase(listItem, { userSelected: true });
    expect(mocks.getPublishedPromptCase).toHaveBeenCalledTimes(1);
  });

  it("applies prompt only after list item detail is loaded", async () => {
    const listItem = promptCaseListItem({ id: "case_apply", modes: ["text2image"] });
    mocks.getPublishedPromptCase.mockResolvedValueOnce(
      promptCase({ id: "case_apply", promptTemplate: "案例模板 prompt", modes: ["text2image"] })
    );
    const cases = useAiImageCases();
    cases.items.value = [listItem];

    const result = await cases.applyCasePrompt(listItem);

    expect(result).toEqual({ prompt: "案例模板 prompt", mode: "text2image" });
    expect(cases.finalPrompt.value).toBe("案例模板 prompt");
    expect(cases.finalPromptSource.value).toBe("case");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("aiImage.promptFilled");
  });

  it("keeps automatic previews out of assistant case context until the user selects a case", () => {
    const first = promptCaseListItem({ id: "first" });
    const second = promptCaseListItem({ id: "second" });
    const cases = useAiImageCases();
    cases.items.value = [first, second];

    cases.previewCase(first);
    expect(cases.selectedId.value).toBe("first");
    expect(cases.caseContext.value).toBeNull();

    cases.previewCase(second, { userSelected: true });
    expect(cases.selectedId.value).toBe("second");
    expect(cases.caseContext.value?.id).toBe("second");
  });

  it("can reset user edits back to the applied case prompt", () => {
    const item = promptCase({ id: "case_reset", promptTemplate: "案例模板 prompt" });
    const cases = useAiImageCases();
    cases.items.value = [promptCaseListItem(item)];

    cases.selectCase(item);
    cases.setPrompt("用户改过的 prompt", "user");

    expect(cases.canResetPrompt.value).toBe(true);

    cases.resetPrompt();

    expect(cases.finalPrompt.value).toBe("案例模板 prompt");
    expect(cases.finalPromptSource.value).toBe("case");
    expect(cases.canResetPrompt.value).toBe(false);
  });

  it("can reset user edits back to the assistant prompt", () => {
    const cases = useAiImageCases();

    cases.setPrompt("助手生成 prompt", "assistant");
    cases.setPrompt("用户微调 prompt", "user");

    expect(cases.canResetPrompt.value).toBe(true);

    cases.resetPrompt();

    expect(cases.finalPrompt.value).toBe("助手生成 prompt");
    expect(cases.finalPromptSource.value).toBe("assistant");
  });
});

function promptCasePage(
  items: PromptCaseListItem[],
  pageInfo: Partial<PromptCasePage["pageInfo"]> = {}
): PromptCasePage {
  return {
    items,
    pageInfo: {
      hasMore: false,
      limit: 60,
      nextCursor: null,
      ...pageInfo
    },
    facets: {
      categories: [
        { value: "商业广告", count: 1 },
        { value: "角色设计", count: 1 }
      ],
      modes: [{ value: "text2image", count: 2 }],
      sizes: [{ value: "1024x1024", count: 2 }]
    }
  };
}

function promptCaseListItem(
  overrides: Partial<PromptCaseListItem | PromptCase> = {}
): PromptCaseListItem {
  const full = promptCase(overrides as Partial<PromptCase>);
  return {
    id: full.id,
    title: full.title,
    category: full.category,
    modes: full.modes,
    recommendedSize: full.recommendedSize,
    tags: full.tags,
    promptSummary: full.promptSummary,
    thumbnailUrl: full.thumbnailUrl,
    sourceAuthor: full.sourceAuthor,
    sourceLicense: full.sourceLicense,
    sourceRepo: full.sourceRepo,
    featured: full.featured,
    sortOrder: full.sortOrder,
    locale: full.locale
  };
}

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
