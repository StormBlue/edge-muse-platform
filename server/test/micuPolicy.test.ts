import { describe, expect, it } from "vitest";
import {
  effectiveMicuModel,
  micuQuotaMultiplier,
  resolveMicuParallelGenerations
} from "../src/providers/micuPolicy";

describe("Micu model routing and tariff contract", () => {
  for (const family of ["gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]) {
    for (const suffix of ["", "-openai"]) {
      it.each([
        ["auto", false],
        ["1024x1536", false],
        ["1536x1024", false],
        ["1600x1024", true],
        ["2048x2048", true],
        ["3840x2160", true]
      ])(`${family}${suffix} resolves %s consistently`, (size, high) => {
        const model = family + suffix;
        expect(effectiveMicuModel(model, size)).toBe(family + (high ? "-openai" : ""));
        expect(micuQuotaMultiplier(model, size)).toBe(high ? 2 : 1);
        expect(resolveMicuParallelGenerations(model, size)).toBe(high ? 1 : 5);
      });
    }
  }
  it("maps the retired pro alias to a supported high resolution model", () => {
    expect(effectiveMicuModel("gpt-image-2-pro", "2048x2048")).toBe("gpt-image-2-openai");
  });
});
