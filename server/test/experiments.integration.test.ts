import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { experimentAssignments, experimentEvents, users } from "../src/db/schema";
import {
  getGenerationExperienceForUser,
  getGenerationExperimentMetrics,
  recordExperimentEvent,
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
