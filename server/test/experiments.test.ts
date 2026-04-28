import { describe, expect, it } from "vitest";
import { experimentEventSchema, sanitizeExperimentEventMetadata } from "../src/lib/experiments";
import { isInGenerationExperimentScope } from "../src/lib/experimentScope";

describe("generation experiment events", () => {
  it("accepts known generation funnel events", () => {
    const input = experimentEventSchema.parse({
      eventName: "assistant_started",
      route: "/ai-image",
      caseId: "pcase_1",
      metadata: { mode: "text2image" }
    });

    expect(input).toMatchObject({
      eventName: "assistant_started",
      route: "/ai-image",
      caseId: "pcase_1"
    });
  });

  it("removes prompts, keys, and reference image payloads from event metadata", () => {
    const metadata = sanitizeExperimentEventMetadata({
      prompt: "完整 prompt 不应进入实验事件",
      finalPrompt: "最终 prompt 不应进入实验事件",
      apiKey: "sk-secret",
      referenceImages: ["r2-object"],
      mode: "image2image",
      promptLength: 2048,
      longText: "x".repeat(200)
    });

    expect(metadata).toEqual({
      mode: "image2image",
      promptLength: 2048,
      longText: "x".repeat(160)
    });
  });
});

describe("generation experiment scope", () => {
  it("treats empty scope as all non-sysadmin users", () => {
    expect(isInGenerationExperimentScope({}, { id: "usr_1", role: "user" })).toBe(true);
    expect(isInGenerationExperimentScope({}, { id: "sys_1", role: "sysadmin" })).toBe(false);
  });

  it("supports user whitelist and exclusion", () => {
    const scope = {
      userIds: ["usr_1", "usr_2"],
      excludeUserIds: ["usr_2"]
    };

    expect(isInGenerationExperimentScope(scope, { id: "usr_1", role: "user" })).toBe(true);
    expect(isInGenerationExperimentScope(scope, { id: "usr_2", role: "user" })).toBe(false);
    expect(isInGenerationExperimentScope(scope, { id: "usr_3", role: "user" })).toBe(false);
  });

  it("supports users created by selected admins", () => {
    const scope = { adminIds: ["adm_1"] };

    expect(
      isInGenerationExperimentScope(scope, { id: "usr_1", role: "user", createdBy: "adm_1" })
    ).toBe(true);
    expect(
      isInGenerationExperimentScope(scope, { id: "usr_2", role: "user", createdBy: "adm_2" })
    ).toBe(false);
  });
});
