import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { experimentEvents } from "../src/db/schema";
import {
  getGenerationExperimentMetrics,
  getGenerationExperimentMetricsWindow,
  recordExperimentEvent,
  recordTaskResultExperimentEvent,
  saveGenerationExperiment
} from "../src/lib/experiments";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import { authUser, seedExperimentUsers, sysadminUser } from "./experimentTestUtils";

describe("generation experiment metrics D1 integration", () => {
  let ctx: D1TestContext;

  beforeEach(async () => {
    ctx = await createD1TestContext();
    await seedExperimentUsers(ctx);
  });

  afterEach(async () => {
    await ctx?.dispose();
  });

  it("records sanitized events and aggregates metrics by assigned variant", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });

    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generation_page_opened",
      route: "/ai-image",
      metadata: {
        mode: "text2image",
        prompt: "不应入库的完整 prompt",
        apiKey: "sk-secret",
        promptLength: 88
      }
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);
    const metrics = await getGenerationExperimentMetrics(ctx.env);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      userId: "usr_1",
      variant: "B",
      eventName: "generation_page_opened",
      route: "/ai-image",
      isSysadminPreview: false
    });
    expect(JSON.parse(events[0].metadata)).toEqual({ mode: "text2image", promptLength: 88 });
    expect(metrics.map((item) => ({ ...item, count: Number(item.count) }))).toEqual([
      { variant: "B", eventName: "generation_page_opened", count: 1 }
    ]);
  });

  it("excludes sysadmin preview events from default metrics", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });

    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generation_page_opened",
      route: "/ai-image",
      metadata: {}
    });
    await recordExperimentEvent(ctx.env, sysadminUser(), {
      eventName: "generation_page_opened",
      route: "/ai-image",
      metadata: {}
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);
    const metrics = await getGenerationExperimentMetrics(ctx.env);

    expect(events).toHaveLength(2);
    expect(events.some((event) => event.isSysadminPreview)).toBe(true);
    expect(metrics.map((item) => ({ ...item, count: Number(item.count) }))).toEqual([
      { variant: "B", eventName: "generation_page_opened", count: 1 }
    ]);
  });

  it("keeps continuous chat out of default image generation funnel metrics", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_legacy",
      trafficPercent: 0,
      scope: { userIds: ["usr_1"] }
    });
    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generate_submitted",
      route: "/workspace",
      taskId: "chat_task",
      metadata: { mode: "chat", size: "1024x1024" }
    });

    await recordTaskResultExperimentEvent(ctx.env, {
      userId: "usr_1",
      taskId: "chat_task",
      eventName: "generate_succeeded",
      metadata: { imageCount: 1 }
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);
    const result = events.find((event) => event.eventName === "generate_succeeded");
    const metrics = await getGenerationExperimentMetrics(ctx.env);

    expect(JSON.parse(result?.metadata ?? "{}")).toMatchObject({
      attributionSource: "generate_submitted",
      mode: "chat"
    });
    expect(metrics.map((item) => ({ ...item, count: Number(item.count) }))).toEqual([
      { variant: "A", eventName: "chat_generate_submitted", count: 1 },
      { variant: "A", eventName: "chat_generate_succeeded", count: 1 }
    ]);
  });

  it("excludes direct-access generation events from default funnel metrics", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_ai",
      trafficPercent: 100,
      scope: { userIds: ["usr_1"] }
    });
    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generate_submitted",
      route: "/workspace",
      taskId: "direct_task",
      metadata: {
        mode: "text2image",
        submitEventSource: "server_generate"
      }
    });

    await recordTaskResultExperimentEvent(ctx.env, {
      userId: "usr_1",
      taskId: "direct_task",
      eventName: "generate_succeeded",
      metadata: { imageCount: 1 }
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);
    const metrics = await getGenerationExperimentMetrics(ctx.env);

    expect(events).toHaveLength(2);
    expect(JSON.parse(events[0].metadata)).toMatchObject({ directAccess: true });
    expect(metrics).toEqual([]);
  });

  it("infers and excludes direct-access AI page events from default funnel metrics", async () => {
    await saveGenerationExperiment(ctx.env, "sys_1", {
      status: "running",
      strategy: "force_legacy",
      trafficPercent: 0,
      scope: { userIds: ["usr_1"] }
    });

    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "generation_page_opened",
      route: "/ai-image",
      metadata: {}
    });
    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "prompt_case_selected",
      route: "/ai-image",
      caseId: "case_direct",
      metadata: { category: "商品与广告" }
    });
    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "assistant_started",
      route: "/ai-image",
      metadata: { mode: "text2image" }
    });
    await recordExperimentEvent(ctx.env, authUser("usr_1"), {
      eventName: "assistant_prompt_filled",
      route: "/ai-image",
      caseId: "case_direct",
      metadata: { promptLength: 48 }
    });

    const events = await getDb(ctx.env).select().from(experimentEvents);
    const metrics = await getGenerationExperimentMetrics(ctx.env);

    expect(events).toHaveLength(4);
    expect(events.map((event) => JSON.parse(event.metadata))).toEqual([
      { directAccess: true },
      { category: "商品与广告", directAccess: true },
      { mode: "text2image", directAccess: true },
      { promptLength: 48, directAccess: true }
    ]);
    expect(metrics).toEqual([]);
  });

  it("limits sysadmin metrics to the configured time window", async () => {
    const referenceTime = 1_900_000_000_000;
    const metricsWindow = getGenerationExperimentMetricsWindow(referenceTime);
    await getDb(ctx.env)
      .insert(experimentEvents)
      .values([
        {
          id: "expevt_old",
          experimentKey: "generation_experience",
          userId: "usr_1",
          variant: "B",
          eventName: "generation_page_opened",
          route: "/ai-image",
          metadata: "{}",
          isSysadminPreview: false,
          createdAt: metricsWindow.since - 1
        },
        {
          id: "expevt_recent",
          experimentKey: "generation_experience",
          userId: "usr_1",
          variant: "B",
          eventName: "generation_page_opened",
          route: "/ai-image",
          metadata: "{}",
          isSysadminPreview: false,
          createdAt: metricsWindow.since
        }
      ]);

    const metrics = await getGenerationExperimentMetrics(ctx.env, { window: metricsWindow });

    expect(metrics.map((item) => ({ ...item, count: Number(item.count) }))).toEqual([
      { variant: "B", eventName: "generation_page_opened", count: 1 }
    ]);
  });
});
