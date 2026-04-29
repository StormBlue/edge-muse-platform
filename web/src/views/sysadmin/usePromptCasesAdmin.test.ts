import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePromptCasesAdmin } from "./usePromptCasesAdmin";
import { promptCaseToForm, type PromptCase } from "@/types/promptCases";

const mocks = vi.hoisted(() => ({
  bulkUpdateCases: vi.fn(),
  createCase: vi.fn(),
  importCases: vi.fn(),
  listCases: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateCase: vi.fn()
}));

vi.mock("@/api/promptCases", () => ({
  bulkUpdateSysadminPromptCases: mocks.bulkUpdateCases,
  createSysadminPromptCase: mocks.createCase,
  importSysadminPromptCases: mocks.importCases,
  listSysadminPromptCases: mocks.listCases,
  updateSysadminPromptCase: mocks.updateCase
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess
  }
}));

describe("usePromptCasesAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads cases and selects the first item when no selection exists", async () => {
    const portrait = promptCase({ id: "pcase_1", category: "人像摄影" });
    const poster = promptCase({ id: "pcase_2", category: "海报插画" });
    mocks.listCases.mockResolvedValueOnce([poster, portrait]);

    const admin = usePromptCasesAdmin();
    await admin.load();

    expect(mocks.listCases).toHaveBeenCalledWith({
      category: "",
      featured: "",
      locale: "zh-CN",
      mode: "",
      search: "",
      source: "",
      status: ""
    });
    expect(admin.items.value).toEqual([poster, portrait]);
    expect(admin.selectedId.value).toBe("pcase_2");
    expect(admin.selected.value?.id).toBe("pcase_2");
    expect(admin.categories.value).toEqual(
      ["人像摄影", "海报插画"].sort((a, b) => a.localeCompare(b))
    );
  });

  it("resets stale selection after a filter reload", async () => {
    const first = promptCase({ id: "pcase_1" });
    const second = promptCase({ id: "pcase_2" });
    const filtered = promptCase({ id: "pcase_3" });
    mocks.listCases.mockResolvedValueOnce([first, second]).mockResolvedValueOnce([filtered]);

    const admin = usePromptCasesAdmin();
    await admin.load();
    admin.selectedId.value = "pcase_2";
    await admin.load();

    expect(admin.selectedId.value).toBe("pcase_3");
    expect(admin.selected.value?.id).toBe("pcase_3");
  });

  it("opens create mode, saves a new case, then reloads the list", async () => {
    const created = promptCase({ id: "pcase_created", title: "新案例" });
    const input = promptCaseToForm(created);
    mocks.createCase.mockResolvedValueOnce(created);
    mocks.listCases.mockResolvedValueOnce([created]);

    const admin = usePromptCasesAdmin();
    admin.openCreate();
    await admin.save(input);

    expect(admin.editorOpen.value).toBe(false);
    expect(admin.editing.value).toBeNull();
    expect(admin.selectedId.value).toBe("pcase_created");
    expect(mocks.createCase).toHaveBeenCalledWith(input);
    expect(mocks.listCases).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("promptCases.created");
  });

  it("opens edit mode and patches the selected case through save", async () => {
    const original = promptCase({ id: "pcase_1", title: "旧标题" });
    const updated = promptCase({ id: "pcase_1", title: "新标题" });
    const input = promptCaseToForm(updated);
    mocks.updateCase.mockResolvedValueOnce(updated);
    mocks.listCases.mockResolvedValueOnce([updated]);

    const admin = usePromptCasesAdmin();
    admin.openEdit(original);
    await admin.save(input);

    expect(admin.editorOpen.value).toBe(false);
    expect(admin.editing.value).toBeNull();
    expect(admin.selectedId.value).toBe("pcase_1");
    expect(mocks.updateCase).toHaveBeenCalledWith("pcase_1", input);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("promptCases.updated");
  });

  it("patches status and featured state without allowing duplicate saves", async () => {
    const item = promptCase({ id: "pcase_1", featured: false, status: "draft" });
    const published = promptCase({ id: "pcase_1", featured: false, status: "published" });
    const featured = promptCase({ id: "pcase_1", featured: true, status: "published" });
    mocks.updateCase.mockResolvedValueOnce(published).mockResolvedValueOnce(featured);
    mocks.listCases.mockResolvedValueOnce([published]).mockResolvedValueOnce([featured]);

    const admin = usePromptCasesAdmin();
    await admin.changeStatus(item, "published");
    await admin.toggleFeatured(published);

    expect(mocks.updateCase).toHaveBeenNthCalledWith(1, "pcase_1", { status: "published" });
    expect(mocks.updateCase).toHaveBeenNthCalledWith(2, "pcase_1", { featured: true });
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(2);
  });

  it("bulk updates selected cases and clears the selection after reload", async () => {
    const first = promptCase({ id: "pcase_1", status: "draft" });
    const second = promptCase({ id: "pcase_2", status: "hidden" });
    const published = [
      promptCase({ id: "pcase_1", status: "published" }),
      promptCase({ id: "pcase_2", status: "published" })
    ];
    mocks.listCases.mockResolvedValueOnce([first, second]).mockResolvedValueOnce(published);
    mocks.bulkUpdateCases.mockResolvedValueOnce({ items: published });

    const admin = usePromptCasesAdmin();
    await admin.load();
    admin.toggleSelected("pcase_1", true);
    admin.toggleSelected("pcase_2", true);
    await admin.bulkChangeStatus("published");

    expect(mocks.bulkUpdateCases).toHaveBeenCalledWith({
      ids: ["pcase_1", "pcase_2"],
      patch: { status: "published" }
    });
    expect(admin.selectedCount.value).toBe(0);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('promptCases.bulkUpdated:{"count":2}');
  });

  it("imports valid JSON cases and rejects empty import payloads locally", async () => {
    const imported = promptCase({ id: "pcase_imported", title: "导入案例" });
    mocks.importCases.mockResolvedValueOnce({ imported: [imported], errors: [] });
    mocks.listCases.mockResolvedValueOnce([imported]);

    const admin = usePromptCasesAdmin();
    admin.openImport();
    await admin.submitImport();

    expect(mocks.importCases).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("promptCases.importEmpty");

    admin.importSource.value = "awesome-gpt-image-2-prompts";
    admin.importSourceUrl.value = "https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts";
    admin.importText.value = JSON.stringify([{ title: "导入案例" }]);
    await admin.submitImport();

    expect(mocks.importCases).toHaveBeenCalledWith({
      cases: [expect.objectContaining({ status: "draft", title: "导入案例" })],
      source: "awesome-gpt-image-2-prompts",
      sourceUrl: "https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts"
    });
    expect(admin.importOpen.value).toBe(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('promptCases.imported:{"count":1,"failed":0}');
  });
});

function promptCase(overrides: Partial<PromptCase> = {}): PromptCase {
  const id = overrides.id ?? "pcase_1";
  return {
    id,
    category: "人像摄影",
    createdAt: 1,
    createdBy: "sys_1",
    featured: false,
    locale: "zh-CN",
    modes: ["text2image"],
    popularity: {},
    promptSummary: "用于测试的案例摘要",
    promptTemplate: "专业图片 prompt",
    recommendedSize: "1:1",
    sortOrder: 10,
    sourceAuthor: null,
    sourceLicense: "internal",
    sourceRepo: null,
    sourceUrl: null,
    status: "draft",
    tags: ["测试"],
    thumbnailUrl: null,
    title: id,
    updatedAt: 1,
    updatedBy: "sys_1",
    ...overrides
  };
}
