import { describe, expect, it } from "vitest";
import type { GenerationExperience } from "@/stores/auth";
import {
  buildGenerationEntryExposureEvents,
  buildGenerationHistoryReturnEvents,
  buildGenerationRouteOpenEvents,
  generationTargetForPath,
  generationVariantForPath,
  isDirectGenerationAccess
} from "./generationExperimentEvents";

const legacyExperience: GenerationExperience = {
  experimentKey: "generation_experience",
  status: "running",
  strategy: "ab_test",
  variant: "A",
  navTarget: "/workspace",
  showLegacy: true,
  showAi: false
};

describe("generation experiment events", () => {
  it("maps generation paths to stable A/B targets", () => {
    expect(generationTargetForPath("/workspace/tasks")).toBe("/workspace");
    expect(generationVariantForPath("/workspace")).toBe("A");
    expect(generationTargetForPath("/ai-image/create")).toBe("/ai-image");
    expect(generationVariantForPath("/ai-image")).toBe("B");
    expect(generationTargetForPath("/history")).toBeNull();
    expect(generationVariantForPath("/history")).toBeNull();
  });

  it("builds exposure events only for generation entries", () => {
    const events = buildGenerationEntryExposureEvents([
      { to: "/ai-image", label: "AI 图像生成" },
      { to: "/workspace", label: "图像生成" },
      { to: "/history", label: "历史记录" }
    ]);

    expect(events).toEqual([
      {
        eventName: "generation_entry_exposed",
        route: "/ai-image",
        metadata: { variant: "B", navLabel: "AI 图像生成" }
      },
      {
        eventName: "generation_entry_exposed",
        route: "/workspace",
        metadata: { variant: "A", navLabel: "图像生成" }
      }
    ]);
  });

  it("marks user direct access when opening the non-assigned generation page", () => {
    const openedKeys = new Set<string>();
    const directKeys = new Set<string>();

    const events = buildGenerationRouteOpenEvents(
      "/ai-image",
      "/ai-image?from=manual",
      legacyExperience,
      false,
      openedKeys,
      directKeys
    );

    expect(events).toEqual([
      {
        eventName: "generation_page_opened",
        route: "/ai-image",
        metadata: { variant: "B", directAccess: true }
      },
      {
        eventName: "variant_switched_directly",
        route: "/ai-image",
        metadata: { fromVariant: "A", toVariant: "B" }
      }
    ]);
  });

  it("does not treat sysadmin generation access as direct switching", () => {
    const sysadminExperience: GenerationExperience = {
      ...legacyExperience,
      variant: "sysadmin",
      showAi: true
    };
    const events = buildGenerationRouteOpenEvents(
      "/ai-image",
      "/ai-image",
      sysadminExperience,
      true,
      new Set<string>(),
      new Set<string>()
    );

    expect(events).toEqual([
      {
        eventName: "generation_page_opened",
        route: "/ai-image",
        metadata: { variant: "B", directAccess: false }
      }
    ]);
  });

  it("does not treat parallel entry navigation as direct switching", () => {
    const parallelExperience: GenerationExperience = {
      ...legacyExperience,
      strategy: "parallel",
      variant: "parallel",
      navTarget: "/workspace",
      showAi: true,
      showLegacy: true
    };

    const events = buildGenerationRouteOpenEvents(
      "/ai-image",
      "/ai-image",
      parallelExperience,
      false,
      new Set<string>(),
      new Set<string>()
    );

    expect(events).toEqual([
      {
        eventName: "generation_page_opened",
        route: "/ai-image",
        metadata: { variant: "B", directAccess: false }
      }
    ]);
  });

  it("marks direct switching for paused A/B users with existing assignments", () => {
    const pausedExperience: GenerationExperience = {
      ...legacyExperience,
      status: "paused"
    };

    const events = buildGenerationRouteOpenEvents(
      "/ai-image",
      "/ai-image",
      pausedExperience,
      false,
      new Set<string>(),
      new Set<string>()
    );

    expect(events).toEqual([
      {
        eventName: "generation_page_opened",
        route: "/ai-image",
        metadata: { variant: "B", directAccess: true }
      },
      {
        eventName: "variant_switched_directly",
        route: "/ai-image",
        metadata: { fromVariant: "A", toVariant: "B" }
      }
    ]);
  });

  it("reuses the direct access rule for generation submissions", () => {
    expect(isDirectGenerationAccess("/ai-image", legacyExperience, false)).toBe(true);
    expect(isDirectGenerationAccess("/workspace", legacyExperience, false)).toBe(false);
    expect(isDirectGenerationAccess("/ai-image", legacyExperience, true)).toBe(false);
    expect(
      isDirectGenerationAccess("/ai-image", { ...legacyExperience, status: "paused" }, false)
    ).toBe(true);
  });

  it("deduplicates opened and direct events for the same full path and assignment", () => {
    const openedKeys = new Set<string>();
    const directKeys = new Set<string>();

    buildGenerationRouteOpenEvents(
      "/ai-image",
      "/ai-image",
      legacyExperience,
      false,
      openedKeys,
      directKeys
    );
    const events = buildGenerationRouteOpenEvents(
      "/ai-image",
      "/ai-image",
      legacyExperience,
      false,
      openedKeys,
      directKeys
    );

    expect(events).toEqual([]);
  });

  it("tracks returning to history from a generation route once per navigation pair", () => {
    const returnedKeys = new Set<string>();
    const events = buildGenerationHistoryReturnEvents(
      "/ai-image",
      "/ai-image",
      "/history",
      "/history?session=abc",
      legacyExperience,
      false,
      returnedKeys
    );

    expect(events).toEqual([
      {
        eventName: "generation_history_returned",
        route: "/ai-image",
        metadata: {
          variant: "B",
          fromRoute: "/ai-image",
          historyRoute: "/history",
          directAccess: true
        }
      }
    ]);
    expect(
      buildGenerationHistoryReturnEvents(
        "/ai-image",
        "/ai-image",
        "/history",
        "/history?session=abc",
        legacyExperience,
        false,
        returnedKeys
      )
    ).toEqual([]);
  });
});
