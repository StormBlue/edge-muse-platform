import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROMPT_ASSISTANT_MODEL,
  PROMPT_ASSISTANT_MODEL_OPTIONS,
  getPromptAssistantModelSettings,
  promptAssistantModelSchema,
  resolvePromptAssistantModel,
  savePromptAssistantModelSettings
} from "../src/lib/aiModelSettings";
import { promptAssistantTurnSchema, runPromptAssistantTurn } from "../src/lib/promptAssistant";
import { getDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import type { AppBindings, AuthUser } from "../src/types";

describe("AI model settings", () => {
  let ctx: D1TestContext;
  const sysadmin = user({ id: "usr_sysadmin", role: "sysadmin" });

  beforeEach(async () => {
    ctx = await createD1TestContext();
    await insertUser(ctx, sysadmin);
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it("defaults the prompt assistant model to Qwen when no setting exists", async () => {
    await expect(getPromptAssistantModelSettings(ctx.env)).resolves.toMatchObject({
      model: DEFAULT_PROMPT_ASSISTANT_MODEL,
      source: "default",
      updatedBy: null,
      updatedAt: 0
    });
  });

  it("uses the environment model before a database setting is saved", async () => {
    const env = {
      ...ctx.env,
      PROMPT_ASSISTANT_MODEL: "@cf/meta/llama-3.1-8b-instruct-fp8"
    } as AppBindings;

    await expect(getPromptAssistantModelSettings(env)).resolves.toMatchObject({
      model: "@cf/meta/llama-3.1-8b-instruct-fp8",
      source: "environment"
    });
  });

  it("persists a prompt assistant model and lets D1 override the environment fallback", async () => {
    await savePromptAssistantModelSettings(
      ctx.env,
      sysadmin.id,
      "@cf/meta/llama-3.1-8b-instruct-fp8"
    );
    const env = {
      ...ctx.env,
      PROMPT_ASSISTANT_MODEL: DEFAULT_PROMPT_ASSISTANT_MODEL
    } as AppBindings;

    await expect(getPromptAssistantModelSettings(env)).resolves.toMatchObject({
      model: "@cf/meta/llama-3.1-8b-instruct-fp8",
      source: "database",
      updatedBy: sysadmin.id
    });
    await expect(resolvePromptAssistantModel(env)).resolves.toBe(
      "@cf/meta/llama-3.1-8b-instruct-fp8"
    );
  });

  it("rejects unsupported model ids at the schema boundary", () => {
    expect(promptAssistantModelSchema.safeParse("@cf/unknown/model").success).toBe(false);
    expect(promptAssistantModelSchema.safeParse("openai/gpt-5.5-pro").success).toBe(false);
  });

  it("accepts Cloudflare-documented proxied prompt assistant model ids", () => {
    expect(promptAssistantModelSchema.safeParse("google/gemini-3-flash").success).toBe(true);
    expect(promptAssistantModelSchema.safeParse("google/gemini-3.1-flash-lite").success).toBe(true);
    expect(promptAssistantModelSchema.safeParse("google/gemini-3.1-pro").success).toBe(true);
    expect(promptAssistantModelSchema.safeParse("openai/gpt-5.5").success).toBe(true);

    expect(PROMPT_ASSISTANT_MODEL_OPTIONS.map((option) => option.id)).toEqual(
      expect.arrayContaining([
        "google/gemini-3-flash",
        "google/gemini-3.1-flash-lite",
        "google/gemini-3.1-pro",
        "openai/gpt-5.5"
      ])
    );
  });

  it("runs the prompt assistant with the persisted model", async () => {
    await savePromptAssistantModelSettings(
      ctx.env,
      sysadmin.id,
      "@cf/meta/llama-3.1-8b-instruct-fp8"
    );
    const calls: string[] = [];
    const env = {
      ...ctx.env,
      AI: {
        run: async (model: string) => {
          calls.push(model);
          return {
            response: JSON.stringify({
              assistantMessage: "我还需要确认发布渠道。",
              readiness: "collecting",
              brief: { subject: "咖啡新品海报" },
              finalPrompt: null,
              recommendedSize: "1024x1024",
              warnings: []
            })
          };
        }
      }
    } as unknown as AppBindings;
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 0,
      messages: [{ role: "user", content: "做一张咖啡新品海报" }]
    });

    const result = await runPromptAssistantTurn(env, input);

    expect(calls).toEqual(["@cf/meta/llama-3.1-8b-instruct-fp8"]);
    expect(result.model).toBe("@cf/meta/llama-3.1-8b-instruct-fp8");
    expect(result.degraded).toBe(false);
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
  const id = overrides.id ?? "usr_1";
  return {
    id,
    email: `${id}@example.com`,
    username: id,
    nickname: "User",
    role: "user",
    status: "active",
    preferredProviderKeyId: null,
    ...overrides
  };
}
