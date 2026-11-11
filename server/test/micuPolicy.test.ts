import { describe, expect, it } from "vitest";
import {
  MICU_SUPPORTED_MODELS,
  effectiveMicuModel,
  isAllowedMicuModel,
  micuQuotaMultiplier,
  resolveMicuParallelGenerations
} from "../src/providers/micuPolicy";

describe("Micu 2.6 model and tariff contract", () => {
  it("exposes only 2.6 models", () => {
    expect(MICU_SUPPORTED_MODELS).toEqual(["gpt-image-2.6-flare", "gpt-image-2.6-sunburst"]);
  });
  it.each(["gpt-image-2.6-flare", "gpt-image-2.6-sunburst"])("keeps %s at every size", (model) => {
    for (const size of ["auto", "1024x1024", "1600x1024", "2048x2048", "3840x2160"]) {
      expect(isAllowedMicuModel(model)).toBe(true);
      expect(effectiveMicuModel(model, size)).toBe(model);
      const high = size !== "auto" && size !== "1024x1024";
      expect(micuQuotaMultiplier(model, size)).toBe(high ? 2 : 1);
      expect(resolveMicuParallelGenerations(model, size)).toBe(high ? 1 : 5);
    }
  });
  it.each([
    ["gpt-image-2", "gpt-image-2.6-flare"],
    ["gpt-image-2-openai", "gpt-image-2.6-flare"],
    ["gpt-image-2.5-flare", "gpt-image-2.6-flare"],
    ["gpt-image-2.5-flare-openai", "gpt-image-2.6-flare"],
    ["gpt-image-2.5-sunburst", "gpt-image-2.6-sunburst"],
    ["gpt-image-2.5-sunburst-openai", "gpt-image-2.6-sunburst"]
  ])("migrates historical %s to %s", (legacy, model) => {
    expect(isAllowedMicuModel(legacy)).toBe(true);
    expect(effectiveMicuModel(legacy, "1024x1024")).toBe(model);
    expect(effectiveMicuModel(legacy, "3840x2160")).toBe(model);
  });
  it("rejects unknown client models and defaults stale key configuration to Flare", () => {
    expect(isAllowedMicuModel("gpt-image-2-pro")).toBe(false);
    expect(effectiveMicuModel("gpt-image-2-pro", "2048x2048")).toBe("gpt-image-2.6-flare");
  });
});
