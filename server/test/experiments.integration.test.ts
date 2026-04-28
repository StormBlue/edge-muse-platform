import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { experimentAssignments, experimentEvents, users } from "../src/db/schema";
import {
  getGenerationExperienceForUser,
  getGenerationExperimentMetrics,
  getGenerationExperimentMetricsWindow,
  recordExperimentEvent,
  recordRetrySubmittedExperimentEvent,
  recordTaskResultExperimentEvent,
  saveGenerationExperiment
} from "../src/lib/experiments";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import type { AuthUser } from "../src/types";

describe("generation experiments D1 integration", () => {
  let ctx: D1TestContext;

  beforeEach(async () => {
    ctx = await createD1TestContext();
    await seedUsers(ctx);
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

async function seedUsers(ctx: D1TestContext) {
  await getDb(ctx.env)
    .insert(users)
    .values([
      {
        id: "sys_1",
        email: "sys@example.com",
        username: "sys",
        passwordHash: "hash",
        nickname: "Sysadmin",
        role: "sysadmin",
        status: "active",
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: "adm_1",
        email: "admin@example.com",
        username: "admin",
        passwordHash: "hash",
        nickname: "Admin",
        role: "admin",
        status: "active",
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: "usr_1",
        email: "user1@example.com",
        username: "user1",
        passwordHash: "hash",
        nickname: "User 1",
        role: "user",
        createdBy: "adm_1",
        status: "active",
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: "usr_2",
        email: "user2@example.com",
        username: "user2",
        passwordHash: "hash",
        nickname: "User 2",
        role: "user",
        createdBy: "adm_1",
        status: "active",
        createdAt: 1,
        updatedAt: 1
      }
    ]);
}

function authUser(id: "usr_1" | "usr_2"): AuthUser {
  return {
    id,
    email: `${id}@example.com`,
    username: id,
    nickname: id,
    role: "user",
    status: "active"
  };
}

function sysadminUser(): AuthUser {
  return {
    id: "sys_1",
    email: "sys@example.com",
    username: "sys",
    nickname: "Sysadmin",
    role: "sysadmin",
    status: "active"
  };
}
