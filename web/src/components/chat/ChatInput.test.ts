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
  it("sends chat composer with Enter and keeps Ctrl or Shift Enter for new lines", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        mode: "chat",
        variant: "chat",
        sizeOptions: [{ value: "1024x1024", ratio: "1:1", label: "1024 x 1024" }]
      }
    });

    const textarea = wrapper.get("textarea");
    await textarea.setValue("生成一张现代产品海报");
    await textarea.trigger("keydown.enter", { ctrlKey: true });
    await textarea.trigger("keydown.enter", { shiftKey: true });

    expect(wrapper.emitted("submit")).toBeUndefined();

    await textarea.trigger("keydown.enter");

    expect(wrapper.emitted("submit")).toEqual([
      [
        {
          prompt: "生成一张现代产品海报",
          mode: "chat",
          size: "1024x1024",
          n: 1,
          files: []
        }
      ]
    ]);
  });
});
