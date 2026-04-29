import { describe, expect, it } from "vitest";
import { homePath } from "./homePath";

describe("homePath", () => {
  it("sends sysadmin users to the sysadmin dashboard", () => {
    expect(homePath({ isSysadmin: true, generationEntry: null })).toBe("/sysadmin/dashboard");
  });

  it("uses the assigned generation target for regular users", () => {
    expect(
      homePath({
        isSysadmin: false,
        generationEntry: { navTarget: "/ai-image" }
      })
    ).toBe("/ai-image");
  });

  it("falls back to the workspace before settings load", () => {
    expect(homePath({ isSysadmin: false, generationEntry: null })).toBe("/workspace");
  });
});
