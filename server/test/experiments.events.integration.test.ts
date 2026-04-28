import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { experimentEvents } from "../src/db/schema";
import {
  getGenerationExperimentMetrics,
  recordExperimentEvent,
  recordTaskResultExperimentEvent,
  saveGenerationExperiment
} from "../src/lib/experiments";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import { authUser, seedExperimentUsers } from "./experimentTestUtils";

describe("generation experiment event recording D1 integration", () => {
  let ctx: D1TestContext;

  beforeEach(async () => {
    ctx = await createD1TestContext();
    await seedExperimentUsers(ctx);
  });

  afterEach(async () => {
    await ctx?.dispose();
  });

  it("attributes task result events to the submitted variant after experiment changes", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });
    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generate_submitted",
      route: "/ai-image",
      taskId: "task_1",
      metadata: {}
    });
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "paused",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });

    await recordTaskResultExperimentEvent(ctx.env, {
      userId: "usr_1",
      eventName: "generate_succeeded",
      taskId: "task_1",
      metadata: {}
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);
    const metrics = await getGenerationExperimentMetrics(ctx.env);

    expect(events.map((event) => ({ eventName: event.eventName, variant: event.variant }))).toEqual(
      [
        { eventName: "generate_submitted", variant: "B" },
        { eventName: "generate_succeeded", variant: "B" }
      ]
    );
    expect(JSON.parse(events[1].metadata)).toEqual({
      attributionSource: "generate_submitted",
      resultEventSource: "server_task_terminal"
    });
    expect(metrics.map((item) => ({ ...item, count: Number(item.count) }))).toEqual([
      { variant: "B", eventName: "generate_submitted", count: 1 },
      { variant: "B", eventName: "generate_succeeded", count: 1 }
    ]);
  });

  it("marks task result attribution fallback when no submitted event exists", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "paused",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });

    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generate_failed",
      route: "/ai-image",
      taskId: "task_without_submit",
      metadata: {}
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);

    expect(events[0]).toMatchObject({ eventName: "generate_failed", variant: "parallel" });
    expect(JSON.parse(events[0].metadata)).toEqual({
      attributionFallback: true,
      attributionSource: "current_assignment"
    });
  });

  it("records server task result events once and reuses submitted case context", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });
    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generate_submitted",
      route: "/ai-image",
      caseId: "case_1",
      taskId: "task_1",
      metadata: { promptSource: "case" }
    });

    await recordTaskResultExperimentEvent(ctx.env, {
      userId: "usr_1",
      taskId: "task_1",
      eventName: "generate_succeeded",
      metadata: { imageCount: 1 }
    });
    await recordTaskResultExperimentEvent(ctx.env, {
      userId: "usr_1",
      taskId: "task_1",
      eventName: "generate_succeeded",
      metadata: { imageCount: 1 }
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);
    const result = events.find((event) => event.eventName === "generate_succeeded");

    expect(events).toHaveLength(2);
    expect(result).toMatchObject({
      variant: "B",
      route: "/ai-image",
      caseId: "case_1",
      taskId: "task_1"
    });
    expect(JSON.parse(result?.metadata ?? "{}")).toEqual({
      attributionSource: "generate_submitted",
      imageCount: 1,
      promptSource: "case",
      resultEventSource: "server_task_terminal"
    });
  });

  it("does not let legacy client task result events block trusted server terminal metrics", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });
    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generate_submitted",
      route: "/ai-image",
      taskId: "task_1",
      metadata: { submitEventSource: "server_generate" }
    });
    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generate_succeeded",
      route: "/ai-image",
      taskId: "task_1",
      metadata: { imageCount: 0, resultEventSource: "client_ws_legacy" }
    });

    await recordTaskResultExperimentEvent(ctx.env, {
      userId: "usr_1",
      taskId: "task_1",
      eventName: "generate_succeeded",
      metadata: { imageCount: 1 }
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);
    const resultEvents = events.filter((event) => event.eventName === "generate_succeeded");
    const serverResult = resultEvents.find(
      (event) => JSON.parse(event.metadata).resultEventSource === "server_task_terminal"
    );
    const metrics = await getGenerationExperimentMetrics(ctx.env);

    expect(resultEvents).toHaveLength(2);
    expect(JSON.parse(serverResult?.metadata ?? "{}")).toMatchObject({
      imageCount: 1,
      resultEventSource: "server_task_terminal"
    });
    expect(metrics.map((item) => ({ ...item, count: Number(item.count) }))).toEqual([
      { variant: "B", eventName: "generate_submitted", count: 1 },
      { variant: "B", eventName: "generate_succeeded", count: 1 }
    ]);
  });

  it("does not create server task result metrics without a submitted event", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });

    await recordTaskResultExperimentEvent(ctx.env, {
      userId: "usr_1",
      taskId: "task_without_submit",
      eventName: "generate_succeeded",
      metadata: { imageCount: 1 }
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);

    expect(events).toHaveLength(0);
  });
});
