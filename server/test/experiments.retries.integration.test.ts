import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { experimentEvents } from "../src/db/schema";
import {
  getGenerationExperimentMetrics,
  recordExperimentEvent,
  recordRetrySubmittedExperimentEvent,
  recordTaskResultExperimentEvent,
  saveGenerationExperiment
} from "../src/lib/experiments";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import { authUser, seedExperimentUsers } from "./experimentTestUtils";

describe("generation experiment retry event recording D1 integration", () => {
  let ctx: D1TestContext;

  beforeEach(async () => {
    ctx = await createD1TestContext();
    await seedExperimentUsers(ctx);
  });

  afterEach(async () => {
    await ctx?.dispose();
  });

  it("inherits source task attribution for retry submissions and terminal events", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_legacy",
      trafficPercent: 0,
      scope: { userIds: ["usr_1"] }
    });
    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generate_submitted",
      route: "/workspace",
      taskId: "task_source",
      metadata: { mode: "text2image" }
    });
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });

    await recordRetrySubmittedExperimentEvent(ctx.env, {
      userId: "usr_1",
      sourceTaskId: "task_source",
      taskId: "task_retry",
      route: "/workspace",
      metadata: {
        mode: "text2image",
        size: "1024x1024",
        referenceImageCount: 0
      }
    });
    await recordTaskResultExperimentEvent(ctx.env, {
      userId: "usr_1",
      taskId: "task_retry",
      eventName: "generate_succeeded",
      metadata: { imageCount: 1 }
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);
    const retrySubmitted = events.find((event) => event.taskId === "task_retry");
    const retryResult = events.find((event) => event.eventName === "generate_succeeded");
    const metrics = await getGenerationExperimentMetrics(ctx.env);

    expect(events.map((event) => ({ eventName: event.eventName, variant: event.variant }))).toEqual(
      [
        { eventName: "generate_submitted", variant: "A" },
        { eventName: "generate_submitted", variant: "A" },
        { eventName: "generate_succeeded", variant: "A" }
      ]
    );
    expect(retrySubmitted).toMatchObject({
      route: "/workspace",
      taskId: "task_retry"
    });
    expect(JSON.parse(retrySubmitted?.metadata ?? "{}")).toEqual({
      attributionSource: "retry_of_generate_submitted",
      isRetry: true,
      mode: "text2image",
      referenceImageCount: 0,
      retryOf: "task_source",
      submitEventSource: "server_retry",
      size: "1024x1024"
    });
    expect(JSON.parse(retryResult?.metadata ?? "{}")).toMatchObject({
      attributionSource: "generate_submitted",
      imageCount: 1,
      isRetry: true,
      resultEventSource: "server_task_terminal"
    });
    expect(metrics.map((item) => ({ ...item, count: Number(item.count) }))).toEqual([
      { variant: "A", eventName: "generate_retry_submitted", count: 1 },
      { variant: "A", eventName: "generate_retry_succeeded", count: 1 },
      { variant: "A", eventName: "generate_submitted", count: 1 }
    ]);
  });

  it("does not create retry experiment metrics for continuous chat mode", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_legacy",
      trafficPercent: 0,
      scope: { userIds: ["usr_1"] }
    });

    await recordRetrySubmittedExperimentEvent(ctx.env, {
      userId: "usr_1",
      sourceTaskId: "chat_source",
      taskId: "chat_retry",
      route: "/workspace",
      metadata: { mode: "chat", isRetry: true }
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);

    expect(events).toHaveLength(0);
  });
});
