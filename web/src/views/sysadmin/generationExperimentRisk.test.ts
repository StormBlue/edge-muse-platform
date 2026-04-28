import { describe, expect, it } from "vitest";
import { generationExperimentRiskSummary } from "./generationExperimentRisk";
import type { GenerationExperimentForm } from "./generationExperimentPresets";

const baseForm: GenerationExperimentForm = {
  status: "running",
  strategy: "parallel",
  trafficPercent: 50,
  scope: {}
};

describe("generation experiment risk summary", () => {
  it("marks invalid scope JSON as dangerous", () => {
    expect(generationExperimentRiskSummary(baseForm, "{bad json")).toMatchObject({
      level: "danger",
      titleKey: "experiments.riskInvalidScopeTitle"
    });
  });

  it("warns when force-ai is running for all users", () => {
    expect(
      generationExperimentRiskSummary({ ...baseForm, strategy: "force_ai" }, "{}")
    ).toMatchObject({
      level: "danger",
      titleKey: "experiments.riskForceAiAllTitle"
    });
  });

  it("treats exclusion-only scope as all-user scope", () => {
    expect(
      generationExperimentRiskSummary(
        { ...baseForm, strategy: "force_ai" },
        '{"excludeUserIds":["usr_1"]}'
      )
    ).toMatchObject({
      level: "danger",
      titleKey: "experiments.riskForceAiAllTitle"
    });
  });

  it("warns for high all-user B traffic but allows 25 percent rollout", () => {
    expect(
      generationExperimentRiskSummary(
        { ...baseForm, strategy: "ab_test", trafficPercent: 50 },
        "{}"
      )
    ).toMatchObject({
      level: "caution",
      titleKey: "experiments.riskHighTrafficTitle"
    });
    expect(
      generationExperimentRiskSummary(
        { ...baseForm, strategy: "ab_test", trafficPercent: 25 },
        "{}"
      )
    ).toMatchObject({
      level: "safe",
      titleKey: "experiments.riskAllTitle"
    });
  });

  it("treats targeted force-ai and rollback as safe", () => {
    expect(
      generationExperimentRiskSummary(
        { ...baseForm, strategy: "force_ai" },
        '{"adminIds":["adm_1"]}'
      )
    ).toMatchObject({
      level: "safe",
      titleKey: "experiments.riskTargetedTitle"
    });
    expect(
      generationExperimentRiskSummary({ ...baseForm, strategy: "force_legacy" }, "{}")
    ).toMatchObject({
      level: "safe",
      titleKey: "experiments.riskRollbackTitle"
    });
  });

  it("honors explicit scope modes used by the backend matcher", () => {
    expect(
      generationExperimentRiskSummary(
        { ...baseForm, strategy: "force_ai" },
        '{"mode":"all","userIds":["usr_1"]}'
      )
    ).toMatchObject({
      level: "danger",
      titleKey: "experiments.riskForceAiAllTitle"
    });
    expect(
      generationExperimentRiskSummary({ ...baseForm, strategy: "force_ai" }, '{"mode":"off"}')
    ).toMatchObject({
      level: "safe",
      titleKey: "experiments.riskScopeOffTitle"
    });
    expect(
      generationExperimentRiskSummary(
        { ...baseForm, strategy: "force_ai" },
        '{"mode":"admin_users"}'
      )
    ).toMatchObject({
      level: "safe",
      titleKey: "experiments.riskTargetedTitle"
    });
  });
});
