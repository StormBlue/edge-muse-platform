import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import { installErrorHandling } from "../src/middleware/error";
import { registerSessionCrudRoutes } from "../src/routes/sessions/crud";
import type { AppEnv } from "../src/types";

const user = {
  id: "usr_delete",
  email: "delete@example.com",
  username: "delete_user",
  nickname: "Delete User",
  role: "user" as const,
  status: "active" as const
};

describe("session deletion", () => {
  let context: D1TestContext;
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    context = await createD1TestContext();
    await seedAccount(context);
    app = new Hono<AppEnv>();
    installErrorHandling(app);
    app.use("*", async (c, next) => {
      c.set("user", user);
      await next();
    });
    registerSessionCrudRoutes(app);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await context.dispose();
  });

  it("soft-deletes generated sessions once every task is succeeded or failed", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
    await seedSession(context, {
      sessionId: "ses_done",
      taskStatuses: ["succeeded", "failed"]
    });

    const response = await app.request("/ses_done", { method: "DELETE" }, context.env);

    expect(response.status).toBe(200);
    await expectDeletedAt(context, "ses_done", Date.now());
  });

  it("rejects sessions with active tasks", async () => {
    await seedSession(context, {
      sessionId: "ses_running",
      taskStatuses: ["succeeded", "running"]
    });

    const response = await app.request("/ses_running", { method: "DELETE" }, context.env);
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    await expectDeletedAt(context, "ses_running", null);
  });

  it("rejects empty sessions without generated tasks", async () => {
    await seedSession(context, { sessionId: "ses_empty", taskStatuses: [] });

    const response = await app.request("/ses_empty", { method: "DELETE" }, context.env);

    expect(response.status).toBe(400);
    await expectDeletedAt(context, "ses_empty", null);
  });
});

async function seedAccount(context: D1TestContext) {
  const timestamp = Date.now();
  await context.env.DB.prepare(
    `INSERT INTO users (
       id, email, username, password_hash, nickname, role, created_by,
       preferred_provider_key_id, locale, status, created_at, updated_at, last_login_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7, ?8, ?9, ?10, NULL)`
  )
    .bind(
      user.id,
      user.email,
      user.username,
      "hash",
      user.nickname,
      user.role,
      "zh-CN",
      user.status,
      timestamp,
      timestamp
    )
    .run();
  await context.env.DB.prepare(
    `INSERT INTO providers (
       id, name, base_url, default_model, request_format, supported_sizes,
       enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, NULL)`
  )
    .bind(
      "prv_delete",
      "Delete Provider",
      "mock:",
      "gpt-image-2",
      "openai_compatible",
      JSON.stringify(["1024x1024"]),
      timestamp,
      timestamp
    )
    .run();
  await context.env.DB.prepare(
    `INSERT INTO provider_keys (
       id, provider_id, label, model, encrypted_key, key_hint,
       allocated_quota, used_quota, owner_admin_id, enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 0, NULL, 1, ?7, ?8, NULL)`
  )
    .bind(
      "key_delete",
      "prv_delete",
      "Delete Key",
      "gpt-image-2",
      "encrypted",
      "test",
      timestamp,
      timestamp
    )
    .run();
}

async function seedSession(
  context: D1TestContext,
  input: {
    sessionId: string;
    taskStatuses: Array<"queued" | "running" | "succeeded" | "failed" | "cancelled">;
  }
) {
  const timestamp = Date.now();
  await context.env.DB.prepare(
    `INSERT INTO sessions (
       id, user_id, title, mode, provider_key_id, settings, created_at,
       updated_at, last_message_at, archived, deleted_at
     ) VALUES (?1, ?2, ?3, 'text2image', ?4, ?5, ?6, ?7, ?8, 0, NULL)`
  )
    .bind(
      input.sessionId,
      user.id,
      input.sessionId,
      "key_delete",
      JSON.stringify({ size: "1024x1024", n: 1 }),
      timestamp,
      timestamp,
      timestamp
    )
    .run();

  for (const [index, status] of input.taskStatuses.entries()) {
    const messageId = `msg_${input.sessionId}_${index}`;
    const taskId = `tsk_${input.sessionId}_${index}`;
    await context.env.DB.prepare(
      `INSERT INTO messages (
         id, session_id, role, prompt, reference_image_ids, attachments,
         task_id, status, created_at, deleted_at
       ) VALUES (?1, ?2, 'assistant', ?3, '[]', '[]', ?4, ?5, ?6, NULL)`
    )
      .bind(messageId, input.sessionId, "prompt", taskId, status, timestamp + index)
      .run();
    await context.env.DB.prepare(
      `INSERT INTO tasks (
         id, session_id, message_id, user_id, provider_key_id, status, mode,
         params, error_code, error_msg, provider_request_id, provider_raw_response,
         queued_at, started_at, heartbeat_at, finished_at, retry_of
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'text2image', ?7, NULL, NULL, NULL, NULL, ?8, NULL, NULL, ?9, NULL)`
    )
      .bind(
        taskId,
        input.sessionId,
        messageId,
        user.id,
        "key_delete",
        status,
        JSON.stringify({ prompt: "prompt", mode: "text2image", size: "1024x1024", n: 1 }),
        timestamp + index,
        status === "succeeded" || status === "failed" || status === "cancelled"
          ? timestamp + index + 10
          : null
      )
      .run();
  }
}

async function expectDeletedAt(context: D1TestContext, sessionId: string, expected: number | null) {
  const row = await context.env.DB.prepare("SELECT deleted_at FROM sessions WHERE id = ?1")
    .bind(sessionId)
    .first<{ deleted_at: number | null }>();
  expect(row?.deleted_at ?? null).toBe(expected);
}
