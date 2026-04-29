import { describe, expect, it } from "vitest";
import { promptAssistantLocaleFromUiLocale } from "./promptAssistantLocale";

describe("prompt assistant locale", () => {
  it("maps supported UI locales to prompt assistant locales", () => {
    expect(promptAssistantLocaleFromUiLocale("zh-CN")).toBe("zh-CN");
    expect(promptAssistantLocaleFromUiLocale("en-US")).toBe("en-US");
  });

  it("falls back to Chinese for unknown locales", () => {
    expect(promptAssistantLocaleFromUiLocale("ja-JP")).toBe("zh-CN");
  });
});
