import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { experimentAssignments } from "../src/db/schema";
import {
  clearGenerationExperimentAssignmentOverride,
  getGenerationExperienceForUser,
  listGenerationExperimentAssignmentOverrides,
  setGenerationExperimentAssignmentOverride,
  saveGenerationExperiment
} from "../src/lib/experiments";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import { authUser, seedExperimentUsers } from "./experimentTestUtils";

describe("generation experiment assignments D1 integration", () => {
  let ctx: D1TestContext;

  beforeEach(async () => {
    ctx = await createD1TestContext();
    await seedExperimentUsers(ctx);
  });

  afterEach(async () => {
    await ctx?.dispose();
  });

  it("assigns scoped users to B and keeps out-of-scope users on parallel experience", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "ab_test",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });

    const assigned = await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    const outOfScope = await getGenerationExperienceForUser(ctx.env, authUser("usr_2"));
    const assignmentRows = await getDb(ctx.env).select().from(experimentAssignments);

    expect(assigned).toMatchObject({ variant: "B", navTarget: "/ai-image", showAi: true });
    expect(outOfScope).toMatchObject({
      variant: "parallel",
      navTarget: "/workspace",
      showAi: true,
      showLegacy: true
    });
    expect(assignmentRows).toHaveLength(1);
    expect(assignmentRows[0]).toMatchObject({ userId: "usr_1", variant: "B" });
  });

  it("does not apply force strategies while the experiment is paused", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "paused",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });

    const paused = await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    const assignmentRows = await getDb(ctx.env).select().from(experimentAssignments);

    expect(paused).toMatchObject({
      status: "paused",
      variant: "parallel",
      navTarget: "/workspace",
      showAi: true,
      showLegacy: true
    });
    expect(assignmentRows).toHaveLength(0);
  });

  it("keeps existing A/B assignments while paused without assigning new users", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "ab_test",
      trafficPercent: 100,
      scope: { userIds: ["usr_1", "usr_2"] }
    });
    await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "paused",
      strategy: "ab_test",
      trafficPercent: 0,
      scope: { userIds: ["usr_1", "usr_2"] }
    });

    const existing = await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    const newUser = await getGenerationExperienceForUser(ctx.env, authUser("usr_2"));
    const assignmentRows = await getDb(ctx.env).select().from(experimentAssignments);

    expect(existing).toMatchObject({ status: "paused", variant: "B", navTarget: "/ai-image" });
    expect(newUser).toMatchObject({
      status: "paused",
      variant: "parallel",
      navTarget: "/workspace",
      showAi: true,
      showLegacy: true
    });
    expect(assignmentRows).toHaveLength(1);
    expect(assignmentRows[0]).toMatchObject({ userId: "usr_1", variant: "B" });
  });

  it("recomputes non-manual A/B assignments when running traffic changes", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "ab_test",
      trafficPercent: 0,
      scope: { userIds: ["usr_1"] }
    });
    const initiallyA = await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "ab_test",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });

    const expandedToB = await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    const assignmentRows = await getDb(ctx.env).select().from(experimentAssignments);

    expect(initiallyA).toMatchObject({ variant: "A", navTarget: "/workspace" });
    expect(expandedToB).toMatchObject({ variant: "B", navTarget: "/ai-image" });
    expect(assignmentRows).toHaveLength(1);
    expect(assignmentRows[0]).toMatchObject({ userId: "usr_1", variant: "B" });
  });

  it("keeps manual A/B assignment overrides when running traffic changes", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "ab_test",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });
    await getDb(ctx.env).insert(experimentAssignments).values({
      id: "expasn_manual",
      experimentKey: "generation_experience",
      userId: "usr_1",
      variant: "A",
      manualOverride: true,
      assignedAt: 1,
      updatedAt: 1
    });

    const assigned = await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    const assignmentRows = await getDb(ctx.env).select().from(experimentAssignments);

    expect(assigned).toMatchObject({ variant: "A", navTarget: "/workspace" });
    expect(assignmentRows).toHaveLength(1);
    expect(assignmentRows[0]).toMatchObject({ variant: "A", manualOverride: true });
  });

  it("lets sysadmin set and clear manual A/B assignment overrides", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "ab_test",
      trafficPercent: 0,
      scope: { userIds: ["usr_2"] }
    });

    await setGenerationExperimentAssignmentOverride(ctx.env, "sys_1", {
      userId: "usr_1",
      variant: "B"
    });

    const overridden = await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    const overrides = await listGenerationExperimentAssignmentOverrides(ctx.env);
    expect(overridden).toMatchObject({ variant: "B", navTarget: "/ai-image" });
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({
      userId: "usr_1",
      variant: "B",
      manualOverride: true
    });

    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "ab_test",
      trafficPercent: 0,
      scope: { userIds: ["usr_1"] }
    });
    await clearGenerationExperimentAssignmentOverride(ctx.env, "usr_1");

    const recomputed = await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    const clearedOverrides = await listGenerationExperimentAssignmentOverrides(ctx.env);
    const assignmentRows = await getDb(ctx.env).select().from(experimentAssignments);
    expect(recomputed).toMatchObject({ variant: "A", navTarget: "/workspace" });
    expect(clearedOverrides).toHaveLength(0);
    expect(assignmentRows).toHaveLength(1);
    expect(assignmentRows[0]).toMatchObject({
      userId: "usr_1",
      variant: "A",
      manualOverride: false
    });
  });

  it("keeps a non-manual A/B assignment when a manual override is cleared while paused", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "ab_test",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });
    const initiallyAssigned = await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    await setGenerationExperimentAssignmentOverride(ctx.env, "sys_1", {
      userId: "usr_1",
      variant: "A"
    });
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "paused",
      strategy: "ab_test",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });

    await clearGenerationExperimentAssignmentOverride(ctx.env, "usr_1");

    const afterClear = await getGenerationExperienceForUser(ctx.env, authUser("usr_1"));
    const overrides = await listGenerationExperimentAssignmentOverrides(ctx.env);
    const assignmentRows = await getDb(ctx.env).select().from(experimentAssignments);
    expect(initiallyAssigned).toMatchObject({ variant: "B", navTarget: "/ai-image" });
    expect(afterClear).toMatchObject({
      status: "paused",
      variant: "B",
      navTarget: "/ai-image"
    });
    expect(overrides).toHaveLength(0);
    expect(assignmentRows).toHaveLength(1);
    expect(assignmentRows[0]).toMatchObject({
      userId: "usr_1",
      variant: "B",
      manualOverride: false
    });
  });
});
