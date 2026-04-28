import { describe, expect, it } from "vitest";
import {
  applyGenerationExperimentPreset,
  generationExperimentScopeHasTargetRule,
  type GenerationExperimentForm
} from "./generationExperimentPresets";

const baseForm: GenerationExperimentForm = {
  status: "draft",
  strategy: "parallel",
  trafficPercent: 50,
  scope: {}
};

describe("generation experiment presets", () => {
  it("applies rollback and 25 percent A/B presets without changing scope", () => {
    expect(applyGenerationExperimentPreset(baseForm, "rollback_legacy")).toEqual({
      ...baseForm,
      status: "running",
      strategy: "force_legacy",
      trafficPercent: 0
    });
    expect(
      applyGenerationExperimentPreset({ ...baseForm, scope: { userIds: ["usr_1"] } }, "ab_25")
    ).toEqual({
      status: "running",
      strategy: "ab_test",
      trafficPercent: 25,
      scope: { userIds: ["usr_1"] }
    });
  });

  it("detects target scope rules required by internal force-ai rollout", () => {
    expect(generationExperimentScopeHasTargetRule("{}")).toBe(false);
    expect(generationExperimentScopeHasTargetRule('{"excludeUserIds":["usr_1"]}')).toBe(false);
    expect(generationExperimentScopeHasTargetRule('{"userIds":["usr_1"]}')).toBe(true);
    expect(generationExperimentScopeHasTargetRule('{"adminIds":["adm_1"]}')).toBe(true);
    expect(generationExperimentScopeHasTargetRule("{bad json")).toBe(false);
  });
});
