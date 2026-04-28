// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PromptCaseEditor from "./PromptCaseEditor.vue";
import PromptCaseImportDialog from "./PromptCaseImportDialog.vue";
import PromptCaseTable from "./PromptCaseTable.vue";
import { emptyPromptCaseForm, type PromptCase } from "@/types/promptCases";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

describe("PromptCaseImportDialog", () => {
  it("updates fields and emits submit from the import form", async () => {
    const wrapper = mount(PromptCaseImportDialog, {
      props: {
        open: true,
        source: "manual",
        sourceUrl: "",
        payload: "",
        saving: false
      }
    });

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("awesome-gpt-image-2-prompts");
    await inputs[1].setValue("https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts");
    await wrapper.find("textarea").setValue('[{"title":"案例"}]');
    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("update:source")?.at(-1)).toEqual(["awesome-gpt-image-2-prompts"]);
    expect(wrapper.emitted("update:sourceUrl")?.at(-1)).toEqual([
      "https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts"
    ]);
    expect(wrapper.emitted("update:payload")?.at(-1)).toEqual(['[{"title":"案例"}]']);
    expect(wrapper.emitted("submit")).toHaveLength(1);
  });
});

describe("PromptCaseEditor", () => {
  it("normalizes form input before emitting save", async () => {
    const initial = {
      ...emptyPromptCaseForm(),
      title: "旧标题",
      category: "商业广告",
      promptSummary: "旧摘要",
      promptTemplate: "旧 prompt",
      tags: ["旧标签"]
    };
    const wrapper = mount(PromptCaseEditor, {
      props: {
        open: true,
        initial,
        saving: false,
        title: "编辑案例"
      }
    });

    const textInputs = wrapper.findAll("input.ui-field");
    await textInputs[0].setValue("  新标题  ");
    await textInputs[1].setValue("  商品海报  ");
    const tagsInput = textInputs.find(
      (input) => (input.element as HTMLInputElement).value === "旧标签"
    );
    if (!tagsInput) throw new Error("Tags input not found");
    await tagsInput.setValue("产品, 海报, 质感");
    await wrapper.findAll("textarea")[0].setValue("  用于商品详情页  ");
    await wrapper.findAll("textarea")[1].setValue("  专业棚拍 prompt  ");
    await wrapper.find("form").trigger("submit");

    const saved = wrapper.emitted("save")?.[0]?.[0];
    expect(saved).toMatchObject({
      title: "新标题",
      category: "商品海报",
      promptSummary: "用于商品详情页",
      promptTemplate: "专业棚拍 prompt",
      tags: ["产品", "海报", "质感"]
    });
  });
});

describe("PromptCaseTable", () => {
  it("emits row selection and row action events", async () => {
    const first = promptCase({ id: "pcase_1", title: "案例一", status: "draft" });
    const second = promptCase({ id: "pcase_2", title: "案例二", featured: true });
    const wrapper = mount(PromptCaseTable, {
      props: {
        items: [first, second],
        loading: false,
        selectedId: "pcase_2",
        selectedIds: new Set(["pcase_2"])
      }
    });

    await wrapper.findAll("tbody tr")[0].trigger("click");
    await wrapper.findAll('input[type="checkbox"]')[1].setValue(true);
    await buttonByText(wrapper, "sysadmin.edit").trigger("click");
    await buttonByText(wrapper, "promptCases.feature").trigger("click");
    await buttonByText(wrapper, "promptCases.publish").trigger("click");

    expect(wrapper.emitted("update:selectedId")?.[0]).toEqual(["pcase_1"]);
    expect(wrapper.emitted("toggleSelected")?.[0]).toEqual(["pcase_1", true]);
    expect(wrapper.emitted("edit")?.[0]).toEqual([first]);
    expect(wrapper.emitted("toggleFeatured")?.[0]).toEqual([first]);
    expect(wrapper.emitted("changeStatus")?.[0]).toEqual([first, "published"]);
  });
});

function buttonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll("button").find((item) => item.text().includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function promptCase(overrides: Partial<PromptCase> = {}): PromptCase {
  const id = overrides.id ?? "pcase_1";
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
    status: "draft",
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
