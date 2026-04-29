import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGenerateTask } from "../src/lib/tasks";
import { GENERATE_WORKFLOW_STEP_CONFIG } from "../src/lib/tasks/workflowConfig";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import type { AppBindings, GenerateParams } from "../src/types";

const baseParams: GenerateParams = {
  prompt: "a small studio product photo",
  mode: "text2image",
  size: "1024x1024",
  n: 1
};

describe("generation task creation quota safety", () => {
  let context: D1TestContext;

  beforeEach(async () => {
    context = await createD1TestContext();
  });

  afterEach(async () => {
    await context.dispose();
  });

  it("does not leave recoverable queued work when quota precharge fails", async () => {
    await seedGenerationAccount(context.env, { allocatedQuota: 0, usedQuota: 0 });

    await expect(
      createGenerateTask(context.env, {
        userId: "usr_task",
        params: baseParams
      })
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });

    expect(await countRows(context.env, "sessions")).toBe(0);
    expect(await countRows(context.env, "messages")).toBe(0);
    expect(await countRows(context.env, "tasks")).toBe(0);
    expect(await countRows(context.env, "quota_transactions")).toBe(0);
    await expectQuota(context.env, { usedQuota: 0 });
  });

  it("creates queued work only after quota is charged", async () => {
    await seedGenerationAccount(context.env, { allocatedQuota: 3, usedQuota: 0 });

    const result = await createGenerateTask(context.env, {
      userId: "usr_task",
      params: baseParams
    });

    expect(result.taskId).toMatch(/^tsk_/);
    expect(await countRows(context.env, "tasks")).toBe(1);
    expect(await countRows(context.env, "quota_transactions")).toBe(1);
    await expectQuota(context.env, { usedQuota: 1 });

    const task = await context.env.DB.prepare("SELECT status FROM tasks WHERE id = ?1")
      .bind(result.taskId)
      .first<{ status: string }>();
    expect(task?.status).toBe("queued");
  });

  it("disables Cloudflare Workflow step retries for generation", () => {
    expect(GENERATE_WORKFLOW_STEP_CONFIG.retries).toMatchObject({
      limit: 0,
      delay: 0,
      backoff: "constant"
    });
  });
});

async function seedGenerationAccount(
  env: AppBindings,
  input: { allocatedQuota: number | null; usedQuota: number }
) {
  const timestamp = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (
       id, email, username, password_hash, nickname, role, created_by,
       preferred_provider_key_id, locale, status, created_at, updated_at, last_login_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7, ?8, ?9, ?10, NULL)`
  )
    .bind(
      "usr_task",
      "task@example.com",
      "task_user",
      "hash",
      "Task User",
      "user",
      "zh-CN",
      "active",
      timestamp,
      timestamp
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO providers (
       id, name, base_url, default_model, request_format, supported_sizes,
       enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, NULL)`
  )
    .bind(
      "prv_task",
      "Task Provider",
      "mock:",
      "gpt-image-2",
      "openai_compatible",
      JSON.stringify(["1024x1024"]),
      timestamp,
      timestamp
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO provider_keys (
       id, provider_id, label, model, encrypted_key, key_hint,
       allocated_quota, used_quota, owner_admin_id, enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 0, NULL, 1, ?7, ?8, NULL)`
  )
    .bind(
      "key_task",
      "prv_task",
      "Task Key",
      "gpt-image-2",
      "encrypted",
      "test",
      timestamp,
      timestamp
    )
    .run();
  await env.DB.prepare(
    "INSERT INTO user_provider_keys (user_id, provider_key_id, assigned_at) VALUES (?1, ?2, ?3)"
  )
    .bind("usr_task", "key_task", timestamp)
    .run();
  await env.DB.prepare(
    "INSERT INTO quotas (user_id, allocated_quota, used_quota, updated_at) VALUES (?1, ?2, ?3, ?4)"
  )
    .bind("usr_task", input.allocatedQuota, input.usedQuota, timestamp)
    .run();
}

async function countRows(env: AppBindings, table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{
    count: number;
  }>();
  return row?.count ?? 0;
}

async function expectQuota(env: AppBindings, expected: { usedQuota: number }) {
  const row = await env.DB.prepare("SELECT used_quota FROM quotas WHERE user_id = ?1")
    .bind("usr_task")
    .first<{ used_quota: number }>();
  expect(row?.used_quota).toBe(expected.usedQuota);
}
