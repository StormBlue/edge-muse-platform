// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PromptCaseThumbnail from "./PromptCaseThumbnail.vue";

describe("PromptCaseThumbnail", () => {
  it("falls back to the placeholder when the thumbnail fails to load", async () => {
    const wrapper = mount(PromptCaseThumbnail, {
      props: { src: "https://example.invalid/thumb.png", alt: "案例图" }
    });

    expect(wrapper.get("img").attributes("loading")).toBe("lazy");
    expect(wrapper.get("img").attributes("decoding")).toBe("async");

    await wrapper.find("img").trigger("error");

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find("svg").exists()).toBe(true);
  });
});
