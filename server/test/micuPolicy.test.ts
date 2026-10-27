import { describe, expect, it } from "vitest";
import {
  effectiveMicuModel,
  isAllowedMicuModel,
  micuQuotaMultiplier,
  resolveMicuParallelGenerations
} from "../src/providers/micuPolicy";

describe("Micu model routing and tariff contract", () => {
  it.each([
    ["auto", "gpt-image-2"],
    ["1024x1536", "gpt-image-2"],
    ["1536x1024", "gpt-image-2"],
    ["1600x1024", "gpt-image-2-openai"],
    ["2048x2048", "gpt-image-2-openai"],
    ["3840x2160", "gpt-image-2-openai"]
  ])("routes the gpt-image-2 family at %s", (size, expected) => {
    for (const model of ["gpt-image-2", "gpt-image-2-openai"]) {
      expect(effectiveMicuModel(model, size)).toBe(expected);
      expect(micuQuotaMultiplier(model, size)).toBe(expected.endsWith("-openai") ? 2 : 1);
      expect(resolveMicuParallelGenerations(model, size)).toBe(
        expected.endsWith("-openai") ? 1 : 5
      );
    }
  });

  it.each(["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"])(
    "keeps %s at every size and accepts its legacy alias",
    (family) => {
      for (const size of ["auto", "1024x1024", "2048x2048", "3840x2160"]) {
        for (const model of [family, `${family}-openai`]) {
          expect(isAllowedMicuModel(model)).toBe(true);
          expect(effectiveMicuModel(model, size)).toBe(family);
          expect(micuQuotaMultiplier(model, size)).toBe(
            size === "auto" || size === "1024x1024" ? 1 : 2
          );
          expect(resolveMicuParallelGenerations(model, size)).toBe(
            size === "auto" || size === "1024x1024" ? 5 : 1
          );
        }
      }
    }
  );

  it("maps an unknown model through the standard size route", () => {
    expect(isAllowedMicuModel("gpt-image-2-pro")).toBe(false);
    expect(effectiveMicuModel("gpt-image-2-pro", "2048x2048")).toBe("gpt-image-2-openai");
    expect(effectiveMicuModel("gpt-image-2-pro", "1024x1024")).toBe("gpt-image-2");
  });
});
