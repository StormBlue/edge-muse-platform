import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertGenerationRouteEnabledForUser,
  assertRetryGenerationRouteEnabledForUser,
  generationEntryPatchSchema,
  getGenerationEntryForUser,
  getGenerationEntrySettings,
  getGenerationPageUsageMetrics,
  getGenerationUsageWindow,
  recordGenerationEvent,
  saveGenerationEntrySettings
} from "../src/lib/generationEntry";
import { getDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import type { AuthUser } from "../src/types";

describe("generation entry settings and usage", () => {
  let ctx: D1TestContext;

  beforeEach(async () => {
    ctx = await createD1TestContext();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it("defaults to showing both generation pages and persists switch settings", async () => {
    await expect(getGenerationEntrySettings(ctx.env)).resolves.toMatchObject({
      showWorkspace: true,
      showAiImage: true,
      updatedBy: null
    });
    await insertUser(ctx, user({ id: "usr_admin", role: "sysadmin" }));

    const settings = await saveGenerationEntrySettings(ctx.env, "usr_admin", {
      showWorkspace: false,
      showAiImage: true
    });

    expect(settings).toMatchObject({
      showWorkspace: false,
      showAiImage: true,
      updatedBy: "usr_admin"
    });
    await expect(getGenerationEntryForUser(ctx.env, user({ role: "user" }))).resolves.toEqual({
      showWorkspace: false,
      showAiImage: true,
      navTarget: "/ai-image"
    });
  });

  it("rejects settings that hide both generation pages", () => {
    expect(
      generationEntryPatchSchema.safeParse({ showWorkspace: false, showAiImage: false }).success
    ).toBe(false);
  });

  it("blocks regular users from server-side generation routes that are disabled", async () => {
    await insertUser(ctx, user({ id: "usr_admin", role: "sysadmin" }));
    const regular = user({ id: "usr_regular", role: "user" });
    await saveGenerationEntrySettings(ctx.env, "usr_admin", {
      showWorkspace: false,
      showAiImage: true
    });

    await expect(
      assertGenerationRouteEnabledForUser(ctx.env, regular, "/workspace")
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      details: { route: "/workspace", navTarget: "/ai-image" }
    });
    await expect(assertGenerationRouteEnabledForUser(ctx.env, regular, "/ai-image")).resolves.toBe(
      "/ai-image"
    );
    await expect(assertGenerationRouteEnabledForUser(ctx.env, regular)).rejects.toMatchObject({
      code: "FORBIDDEN",
      details: { route: "/workspace" }
    });
  });

  it("allows sysadmin to generate from either route regardless of entry settings", async () => {
    await insertUser(ctx, user({ id: "usr_admin", role: "sysadmin" }));
    const sysadmin = user({ id: "usr_sysadmin", role: "sysadmin" });
    await saveGenerationEntrySettings(ctx.env, "usr_admin", {
      showWorkspace: false,
      showAiImage: true
    });

    await expect(
      assertGenerationRouteEnabledForUser(ctx.env, sysadmin, "/workspace")
    ).resolves.toBe("/workspace");
  });

  it("uses the original submitted route when enforcing retry entry settings", async () => {
    const admin = user({ id: "usr_admin", role: "sysadmin" });
    const regular = user({ id: "usr_regular", role: "user" });
    await insertUser(ctx, admin);
    await insertUser(ctx, regular);
    await recordGenerationEvent(ctx.env, regular, {
      eventName: "generate_submitted",
      route: "/ai-image",
      taskId: "tsk_ai_image",
      metadata: {}
    });
    await saveGenerationEntrySettings(ctx.env, admin.id, {
      showWorkspace: true,
      showAiImage: false
    });

    await expect(
      assertRetryGenerationRouteEnabledForUser(ctx.env, regular, {
        sourceTaskId: "tsk_ai_image",
        route: "/workspace"
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      details: { route: "/ai-image", navTarget: "/workspace" }
    });
  });

  it("aggregates regular-user generation usage by page", async () => {
    const regular = user({ id: "usr_regular", role: "user" });
    const sysadmin = user({ id: "usr_sysadmin", role: "sysadmin" });
    await insertUser(ctx, regular);
    await insertUser(ctx, sysadmin);
    await recordGenerationEvent(ctx.env, regular, {
      eventName: "generate_submitted",
      route: "/ai-image",
      taskId: "tsk_1",
      metadata: {}
    });
    await recordGenerationEvent(ctx.env, regular, {
      eventName: "generate_succeeded",
      route: "/ai-image",
      taskId: "tsk_1",
      metadata: {}
    });
    await recordGenerationEvent(ctx.env, sysadmin, {
      eventName: "generate_submitted",
      route: "/workspace",
      taskId: "tsk_preview",
      metadata: {}
    });

    const metrics = await getGenerationPageUsageMetrics(ctx.env, {
      window: getGenerationUsageWindow()
    });

    expect(metrics).toEqual([
      { route: "/workspace", submitted: 0, succeeded: 0, failed: 0 },
      { route: "/ai-image", submitted: 1, succeeded: 1, failed: 0 }
    ]);
  });
});

async function insertUser(ctx: D1TestContext, input: AuthUser) {
  await getDb(ctx.env).insert(users).values({
    id: input.id,
    email: input.email,
    username: input.username,
    passwordHash: "hash",
    nickname: input.nickname,
    role: input.role,
    status: input.status,
    preferredProviderKeyId: input.preferredProviderKeyId,
    createdAt: 1,
    updatedAt: 1
  });
}

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "usr_1",
    email: `${overrides.id ?? "usr_1"}@example.com`,
    username: overrides.id ?? "usr_1",
    nickname: "User",
    role: "user",
    status: "active",
    preferredProviderKeyId: null,
    ...overrides
  };
}
