import { describe, expect, it } from "vitest";
import {
  emptyCreativeBrief,
  formatCreativeBrief,
  mergeStudioTask,
  studioConcurrentLimit,
  studioImageLimit,
  studioSizeOptions,
  studioSubmitIssue
} from "./studioForm";
import { capabilities, task } from "./studioTestUtils";

const valid: Parameters<typeof studioSubmitIssue>[0] = {
  prompt: "A landscape",
  mode: "text2image",
  supportedModes: ["text2image", "image2image"],
  size: "1024x1024",
  sizes: [{ value: "1024x1024" }],
  count: 1,
  countLimit: 4,
  referenceCount: 0,
  referenceLimit: 5,
  remaining: 10,
  activeCount: 0,
  concurrentLimit: 5
};

describe("studio generation policy", () => {
  it.each([
    [{ supportedModes: [] }, "noCapabilities"],
    [{ prompt: "  " }, "empty_prompt"],
    [{ prompt: "a".repeat(4001) }, "promptTooLong"],
    [{ size: "500x500" }, "size_unsupported"],
    [{ count: 0 }, "generationBlocked"],
    [{ count: 1.5 }, "generationBlocked"],
    [{ count: 5 }, "generationBlocked"],
    [{ mode: "image2image" }, "reference_required"],
    [{ mode: "image2image", referenceCount: 6 }, "referencesExceeded"],
    [{ count: 2, remaining: 1 }, "quotaInsufficient"],
    [{ activeCount: 5 }, "concurrentLimit"]
  ] as Array<[Partial<typeof valid>, string]>)("rejects %j with %s", (override, expected) => {
    expect(studioSubmitIssue({ ...valid, ...override })).toBe(expected);
  });

  it("accepts exact limits and ignores dormant references in text-to-image", () => {
    expect(
      studioSubmitIssue({ ...valid, count: 4, remaining: 4, activeCount: 4, referenceCount: 8 })
    ).toBeNull();
    expect(
      studioSubmitIssue({
        ...valid,
        mode: "image2image",
        referenceCount: 5,
        remaining: null,
        concurrentLimit: null,
        activeCount: 200
      })
    ).toBeNull();
  });

  it("restricts Micu image-to-image large dimensions while retaining text-to-image sizes", () => {
    expect(
      studioSizeOptions(capabilities, "image2image").map((entry) => entry.value)
    ).not.toContain("3840x2160");
    expect(studioSizeOptions(capabilities, "text2image").map((entry) => entry.value)).toContain(
      "3840x2160"
    );
    expect(
      studioSizeOptions({ ...capabilities, requestFormat: "openai_images" }, "image2image").map(
        (entry) => entry.value
      )
    ).toContain("3840x2160");
  });

  it("uses configured role limits and formats only populated creative requirements", () => {
    const user = {
      id: "u",
      email: "u",
      username: "u",
      nickname: "u",
      role: "user" as const,
      status: "active"
    };
    expect(studioImageLimit({ ...user, maxImagesPerGeneration: 100 })).toBe(20);
    expect(studioImageLimit({ ...user, role: "sysadmin" })).toBe(200);
    expect(studioConcurrentLimit({ ...user, role: "sysadmin" })).toBeNull();
    expect(studioConcurrentLimit({ ...user, maxConcurrentTasks: 3 })).toBe(3);
    expect(
      formatCreativeBrief(
        { ...emptyCreativeBrief(), subject: "  bottle  ", preserve: "logo" },
        (key) => key
      )
    ).toBe("subject: bottle\npreserve: logo");
  });

  it("does not regress task terminal state or lose an already observed refund", () => {
    const completed = task("one");
    expect(mergeStudioTask(completed, task("one", "queued"))).toBe(completed);
    expect(mergeStudioTask(completed, task("one", "failed"))).toBe(completed);
    const refunded = {
      ...task("one", "cancelled"),
      quota: { precharged: 1, refunded: 1, consumed: 0 }
    };
    expect(mergeStudioTask(refunded, task("one", "cancelled")).quota).toEqual(refunded.quota);
    expect(mergeStudioTask(completed, task("different", "queued")).id).toBe("different");
  });
});
