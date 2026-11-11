// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AnnouncementMarkdown from "./AnnouncementMarkdown.vue";

describe("announcement code rendering", () => {
  it.each(["", "text", "not-a-language"])(
    "renders a %s code block without breaking the article",
    (language) => {
      const content = `Before\n\n\`\`\`${language}\n<script>example</script>\n\`\`\`\n\nAfter`;
      const wrapper = mount(AnnouncementMarkdown, { props: { content } });
      expect(wrapper.get("pre code").text()).toBe("<script>example</script>");
      expect(wrapper.text()).toContain("After");
      expect(wrapper.find("script").exists()).toBe(false);
      wrapper.unmount();
    }
  );
});
