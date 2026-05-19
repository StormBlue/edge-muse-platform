// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ChatInput from "./ChatInput.vue";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key
  })
}));

describe("ChatInput", () => {
  it("defaults new generation size to Auto and exposes a compact size selector", async () => {
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

    expect(wrapper.findAll(".generation-size-choice")).toHaveLength(2);
    expect(wrapper.find(".generation-size-more-select").exists()).toBe(true);
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

  it("submits the selected generation target", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        mode: "text2image",
        generationTargets: [
          { id: "default", label: "默认生成", experimental: false },
          { id: "micu_grok", label: "米醋 Grok 图像", experimental: true }
        ],
        sizeOptions: [{ value: "1024x1024", ratio: "1:1", label: "1024 x 1024" }]
      }
    });

    await wrapper.get("select#task-generation-target").setValue("micu_grok");
    await wrapper.get("textarea").setValue("实验目标生图");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      prompt: "实验目标生图",
      generationTargetId: "micu_grok"
    });
  });
});
