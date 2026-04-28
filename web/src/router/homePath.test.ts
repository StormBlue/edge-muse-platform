import { describe, expect, it } from "vitest";
import { homePath } from "./homePath";

describe("homePath", () => {
  it("sends sysadmin users to the sysadmin dashboard", () => {
    expect(homePath({ isSysadmin: true, generationExperience: null })).toBe("/sysadmin/dashboard");
  });

  it("uses the assigned generation target for regular users", () => {
    expect(
      homePath({
        isSysadmin: false,
        generationExperience: { navTarget: "/ai-image" }
      })
    ).toBe("/ai-image");
  });

  it("falls back to the legacy workspace before an assignment exists", () => {
    expect(homePath({ isSysadmin: false, generationExperience: null })).toBe("/workspace");
  });
});
