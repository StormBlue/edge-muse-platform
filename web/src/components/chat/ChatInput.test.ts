// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ChatInput from "./ChatInput.vue";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key
  })
}));
vi.mock("@/utils/referenceImageFiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/referenceImageFiles")>()),
  prepareReferenceImageFiles: async (files: File[]) => files
}));

describe("ChatInput", () => {
  it("blocks incomplete source recipes until explicit confirmation", async () => {
    const reference = {
      id: "available",
      url: "/images/available",
      mime: "image/png",
      byteSize: 100
    };
    const wrapper = mount(ChatInput, {
      props: {
        mode: "image2image",
        initialPrompt: "保留两张参考图的主体",
        initialReferenceImages: [reference],
        initialReferenceCount: 2
      }
    });
    expect(wrapper.get('[role="alert"]').text()).toContain("recreate.missingReferences:1");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toBeUndefined();
    await wrapper.get('[data-testid="confirm-current-references"]').trigger("click");
    expect(wrapper.emitted("submit")).toBeUndefined();
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({ referenceImages: [reference] });
    wrapper.unmount();
  });

  it("allows replacement uploads to complete the source recipe without a waiver", async () => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:replacement", revokeObjectURL: vi.fn() });
    const reference = {
      id: "available",
      url: "/images/available",
      mime: "image/png",
      byteSize: 100
    };
    const wrapper = mount(ChatInput, {
      props: {
        mode: "image2image",
        initialPrompt: "双参考图",
        initialReferenceImages: [reference],
        initialReferenceCount: 2
      }
    });
    const replacement = new File(["image"], "replacement.png", { type: "image/png" });
    const upload = wrapper.get('input[type="file"]');
    Object.defineProperty(upload.element, "files", { value: [replacement], configurable: true });
    await upload.trigger("change");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted("submit")).toBeUndefined();
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      files: [replacement],
      referenceImages: [reference]
    });
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("still requires an image after accepting a recipe with no surviving references", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        mode: "image2image",
        initialPrompt: "主体",
        initialReferenceImages: [],
        initialReferenceCount: 1
      }
    });
    await wrapper.get('[data-testid="confirm-current-references"]').trigger("click");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toBeUndefined();
    wrapper.unmount();
  });
  it("loads reusable references and requires explicit submission, with removable references", async () => {
    const reference = {
      id: "generated-image",
      url: "/images/generated-image",
      mime: "image/png",
      byteSize: 100
    };
    const wrapper = mount(ChatInput, {
      props: {
        mode: "image2image",
        initialPrompt: "沿用原图主体",
        initialReferenceImages: [reference]
      }
    });
    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(wrapper.get("textarea").element.value).toBe("沿用原图主体");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      prompt: "沿用原图主体",
      files: [],
      referenceImages: [reference]
    });
    await wrapper.get('button[aria-label="common.delete"]').trigger("click");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toHaveLength(1);
    wrapper.unmount();
  });
  it("defaults new generation size to Auto and exposes all canvas sizes", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        mode: "text2image",
        sizeOptions: [
          { value: "auto", ratio: "Auto", label: "Auto" },
          { value: "1536x1024", ratio: "3:2", label: "1536 x 1024" },
          { value: "1024x1024", ratio: "1:1", label: "1024 x 1024" },
          { value: "1024x1536", ratio: "2:3", label: "1024 x 1536" }
        ]
      }
    });

    const textarea = wrapper.get("textarea");
    await textarea.setValue("默认 auto 尺寸");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.findAll(".generation-size-choice")).toHaveLength(4);
    expect(wrapper.find(".generation-size-more-select").exists()).toBe(false);
    expect(wrapper.find(".task-size-grid").exists()).toBe(false);
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      prompt: "默认 auto 尺寸",
      size: "auto"
    });
  });

  it("keeps the task prompt after submit so failed creation can be retried", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        mode: "text2image",
        sizeOptions: [{ value: "1024x1024", ratio: "1:1", label: "1024 x 1024" }]
      }
    });

    const textarea = wrapper.get("textarea");
    await textarea.setValue("不要在失败时丢掉这个提示词");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("submit")).toEqual([
      [
        {
          prompt: "不要在失败时丢掉这个提示词",
          generationTargetId: "default",
          mode: "text2image",
          size: "1024x1024",
          n: 1,
          files: []
        }
      ]
    ]);
    expect((textarea.element as HTMLTextAreaElement).value).toBe("不要在失败时丢掉这个提示词");
  });

  it("locks Micu high-resolution generation to one image", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        mode: "text2image",
        allowCustomCount: true,
        initialCount: 20,
        initialSize: "2048x2048",
        limitHighResolutionCount: true,
        sizeOptions: [{ value: "2048x2048", ratio: "1:1", label: "2048 x 2048" }]
      }
    });

    const textarea = wrapper.get("textarea");
    await textarea.setValue("生成一张现代产品海报");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("submit")).toEqual([
      [
        {
          prompt: "生成一张现代产品海报",
          generationTargetId: "default",
          mode: "text2image",
          size: "2048x2048",
          n: 1,
          files: []
        }
      ]
    ]);
    expect((textarea.element as HTMLTextAreaElement).value).toBe("生成一张现代产品海报");
  });

  it("allows typing multi-digit custom image counts", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        mode: "text2image",
        allowCustomCount: true,
        sizeOptions: [{ value: "1024x1024", ratio: "1:1", label: "1024 x 1024" }]
      }
    });

    await wrapper.get("textarea").setValue("生成多张贴纸候选");
    const countInput = wrapper.get('input[type="number"]');
    await countInput.setValue("12");
    await wrapper.get("form").trigger("submit");

    expect((countInput.element as HTMLInputElement).value).toBe("12");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      prompt: "生成多张贴纸候选",
      n: 12
    });
  });

  it("clamps custom image counts to the configured user limit", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        mode: "text2image",
        allowCustomCount: true,
        maxCustomCount: 3,
        sizeOptions: [{ value: "1024x1024", ratio: "1:1", label: "1024 x 1024" }]
      }
    });

    await wrapper.get("textarea").setValue("生成三张候选");
    const countInput = wrapper.get('input[type="number"]');
    await countInput.setValue("12");
    await wrapper.get("form").trigger("submit");

    expect((countInput.element as HTMLInputElement).value).toBe("3");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({ n: 3 });
  });

  it("normalizes a blank custom image count before submit", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        mode: "text2image",
        allowCustomCount: true,
        initialCount: 12,
        sizeOptions: [{ value: "1024x1024", ratio: "1:1", label: "1024 x 1024" }]
      }
    });

    await wrapper.get("textarea").setValue("生成默认张数");
    const countInput = wrapper.get('input[type="number"]');
    await countInput.setValue("");
    await wrapper.get("form").trigger("submit");

    expect((countInput.element as HTMLInputElement).value).toBe("1");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({ n: 1 });
  });

  it("submits the selected generation target", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        mode: "text2image",
        initialGenerationTargetId: "micu_grok",
        generationTargets: [
          { id: "default", label: "默认生成", experimental: false },
          { id: "micu_grok", label: "米醋 Grok 图像", experimental: true }
        ],
        sizeOptions: [{ value: "1024x1024", ratio: "1:1", label: "1024 x 1024" }]
      }
    });

    await wrapper.get("textarea").setValue("实验目标生图");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      prompt: "实验目标生图",
      generationTargetId: "micu_grok"
    });
  });
});
