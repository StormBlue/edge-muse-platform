import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installErrorHandling } from "../src/middleware/error";
import { adminRoutes } from "../src/routes/admin";
import { generateRoutes } from "../src/routes/generate";
import { sysadminRoutes } from "../src/routes/sysadmin";
import { signJwt } from "../src/lib/jwt";
import { cancelQueuedGenerateTask } from "../src/lib/tasks/state";
import {
  CUBENCE_PROVIDER_ID,
  MICU_GROK_PROVIDER_ID,
  MICU_PROVIDER_ID
} from "../src/providers/catalog";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import type { ApiErrorBody, AppBindings, AppEnv, UserRole } from "../src/types";

const JWT_SECRET = "test-secret";

describe("provider key group API permissions", () => {
  let context: D1TestContext;
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    context = await createD1TestContext();
    await seedPermissionFixture(context.env);
    app = new Hono<AppEnv>();
    installErrorHandling(app);
    app.use("*", async (c, next) => {
      c.set("traceId", "test-trace");
      await next();
    });
    app.route("/api/sysadmin", sysadminRoutes);
    app.route("/api/admin", adminRoutes);
    app.route("/api", generateRoutes);
  });

  afterEach(async () => {
    await context.dispose();
  });

  it("rejects non-sysadmin writes to key group APIs", async () => {
    const response = await app.request(
      "/api/sysadmin/provider-key-groups",
      {
        method: "POST",
        headers: await jsonHeaders("adm_owner"),
        body: JSON.stringify({
          providerId: MICU_PROVIDER_ID,
          name: "Blocked Group",
          keyIds: ["key_perm"]
        })
      },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("lets sysadmin create a key group with sorted members", async () => {
    const response = await app.request(
      "/api/sysadmin/provider-key-groups",
      {
        method: "POST",
        headers: await jsonHeaders("sys_owner"),
        body: JSON.stringify({
          providerId: MICU_PROVIDER_ID,
          name: "Created Group",
          keyIds: ["key_perm_new_b", "key_perm_new_a"]
        })
      },
      context.env
    );
    const body = (await response.json()) as { id: string };

    expect(response.status).toBe(201);
    const members = await context.env.DB.prepare(
      `SELECT provider_key_id, sort_order
       FROM provider_key_group_members
       WHERE group_id = ?1
       ORDER BY sort_order ASC`
    )
      .bind(body.id)
      .all<{ provider_key_id: string; sort_order: number }>();
    expect(members.results).toEqual([
      { provider_key_id: "key_perm_new_b", sort_order: 0 },
      { provider_key_id: "key_perm_new_a", sort_order: 1 }
    ]);
  });

  it("rejects provider keys reused by another key group", async () => {
    const response = await app.request(
      "/api/sysadmin/provider-key-groups",
      {
        method: "POST",
        headers: await jsonHeaders("sys_owner"),
        body: JSON.stringify({
          providerId: MICU_PROVIDER_ID,
          name: "Duplicate Key Group",
          keyIds: ["key_perm"]
        })
      },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("already used");
  });

  it("rejects cross-provider key group members", async () => {
    const response = await app.request(
      "/api/sysadmin/provider-key-groups",
      {
        method: "POST",
        headers: await jsonHeaders("sys_owner"),
        body: JSON.stringify({
          providerId: MICU_PROVIDER_ID,
          name: "Mixed Group",
          keyIds: ["key_perm", "key_other_provider"]
        })
      },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects changing provider for a key that belongs to a group", async () => {
    const response = await app.request(
      "/api/sysadmin/provider-keys/key_perm",
      {
        method: "PATCH",
        headers: await jsonHeaders("sys_owner"),
        body: JSON.stringify({
          providerId: CUBENCE_PROVIDER_ID
        })
      },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("grouped key");
  });

  it("rejects deleting a provider key that belongs to a key group", async () => {
    const response = await app.request(
      "/api/sysadmin/provider-keys/key_perm",
      { method: "DELETE", headers: await jsonHeaders("sys_owner") },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("belongs to a key group");
    expect(body.error.details).toMatchObject({
      reason: "PROVIDER_KEY_IN_GROUP",
      groupId: "grp_perm",
      groupName: "Permission Group"
    });
    const key = await context.env.DB.prepare(
      "SELECT enabled, deleted_at FROM provider_keys WHERE id = 'key_perm'"
    ).first<{ enabled: number; deleted_at: number | null }>();
    expect(key).toEqual({ enabled: 1, deleted_at: null });
  });

  it("rejects disabling the last enabled provider key in a key group", async () => {
    const response = await app.request(
      "/api/sysadmin/provider-keys/key_perm",
      {
        method: "PATCH",
        headers: await jsonHeaders("sys_owner"),
        body: JSON.stringify({ enabled: false })
      },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("at least one enabled key");
    expect(body.error.details).toMatchObject({
      reason: "LAST_ENABLED_PROVIDER_KEY_IN_GROUP",
      groupId: "grp_perm",
      groupName: "Permission Group"
    });
    const key = await context.env.DB.prepare(
      "SELECT enabled FROM provider_keys WHERE id = 'key_perm'"
    ).first<{ enabled: number }>();
    expect(key?.enabled).toBe(1);
  });

  it("allows disabling a grouped provider key when another group member remains enabled", async () => {
    await context.env.DB.prepare(
      `INSERT INTO provider_key_group_members (
         group_id, provider_key_id, sort_order, created_at, updated_at
       ) VALUES ('grp_perm', 'key_perm_extra', 1, ?1, ?1)`
    )
      .bind(1_778_000_000_100)
      .run();

    const response = await app.request(
      "/api/sysadmin/provider-keys/key_perm",
      {
        method: "PATCH",
        headers: await jsonHeaders("sys_owner"),
        body: JSON.stringify({ enabled: false })
      },
      context.env
    );

    expect(response.status).toBe(200);
    const key = await context.env.DB.prepare(
      "SELECT enabled FROM provider_keys WHERE id = 'key_perm'"
    ).first<{ enabled: number }>();
    expect(key?.enabled).toBe(0);
  });

  it("allows an admin to update only a managed user max concurrent task limit", async () => {
    const response = await app.request(
      "/api/admin/users/usr_managed",
      {
        method: "PATCH",
        headers: await jsonHeaders("adm_owner"),
        body: JSON.stringify({ maxConcurrentTasks: 7 })
      },
      context.env
    );

    expect(response.status).toBe(200);
    const user = await context.env.DB.prepare(
      "SELECT max_concurrent_tasks FROM users WHERE id = 'usr_managed'"
    ).first<{ max_concurrent_tasks: number }>();
    expect(user?.max_concurrent_tasks).toBe(7);
  });

  it("rejects admin edits to users outside their tenant", async () => {
    const response = await app.request(
      "/api/admin/users/usr_other",
      {
        method: "PATCH",
        headers: await jsonHeaders("adm_owner"),
        body: JSON.stringify({ maxConcurrentTasks: 6 })
      },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects admin attempts to change a managed user's key group", async () => {
    const response = await app.request(
      "/api/admin/users/usr_managed",
      {
        method: "PATCH",
        headers: await jsonHeaders("adm_owner"),
        body: JSON.stringify({ providerKeyGroupId: "grp_perm" })
      },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("lets sysadmin grant Grok image access only to selected admins", async () => {
    const update = await app.request(
      "/api/sysadmin/generation-features",
      {
        method: "PATCH",
        headers: await jsonHeaders("sys_owner"),
        body: JSON.stringify({ micuGrokAdminIds: ["adm_other"] })
      },
      context.env
    );
    expect(update.status).toBe(200);

    const list = await app.request(
      "/api/sysadmin/generation-features",
      { method: "GET", headers: await jsonHeaders("sys_owner") },
      context.env
    );
    const body = (await list.json()) as {
      micuGrok: { admins: Array<{ id: string; granted: boolean }> };
    };
    expect(body.micuGrok.admins.find((admin) => admin.id === "adm_other")?.granted).toBe(true);
    expect(body.micuGrok.admins.find((admin) => admin.id === "adm_owner")?.granted).toBe(false);
  });

  it("rejects non-sysadmin writes to generation feature grants", async () => {
    const response = await app.request(
      "/api/sysadmin/generation-features",
      {
        method: "PATCH",
        headers: await jsonHeaders("adm_owner"),
        body: JSON.stringify({ micuGrokAdminIds: ["adm_owner"] })
      },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects ungranted admins using the Grok generation target", async () => {
    const response = await app.request(
      "/api/generate",
      {
        method: "POST",
        headers: await jsonHeaders("adm_owner"),
        body: JSON.stringify({
          generationTargetId: "micu_grok",
          prompt: "blocked grok",
          mode: "text2image",
          size: "1024x1024",
          n: 1
        })
      },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("uses the Grok provider group for granted admin generation", async () => {
    await context.env.DB.prepare(
      `INSERT INTO generation_feature_grants (
         feature, user_id, enabled, created_by, updated_by, created_at, updated_at
       ) VALUES ('micu_grok_image', 'adm_owner', 1, 'sys_owner', 'sys_owner', ?1, ?1)`
    )
      .bind(1_778_000_000_100)
      .run();

    const response = await app.request(
      "/api/generate",
      {
        method: "POST",
        headers: await jsonHeaders("adm_owner"),
        body: JSON.stringify({
          generationTargetId: "micu_grok",
          prompt: "grok cat",
          mode: "text2image",
          size: "1024x1024",
          n: 1
        })
      },
      context.env
    );
    const body = (await response.json()) as { taskId: string };

    expect(response.status).toBe(202);
    const task = await context.env.DB.prepare(
      "SELECT provider_key_group_id, provider_key_id, params FROM tasks WHERE id = ?1"
    )
      .bind(body.taskId)
      .first<{ provider_key_group_id: string; provider_key_id: string; params: string }>();
    expect(task?.provider_key_group_id).toBe("grp_grok_perm");
    expect(task?.provider_key_id).toBe("key_grok_perm");
    expect(JSON.parse(task?.params ?? "{}")).toMatchObject({
      generationTargetId: "micu_grok",
      model: "grok-imagine-image-pro"
    });
  });

  it("returns a clear provider error when a generating user has no key group", async () => {
    const response = await app.request(
      "/api/generate",
      {
        method: "POST",
        headers: await jsonHeaders("usr_no_group"),
        body: JSON.stringify({
          prompt: "no group",
          mode: "text2image",
          size: "1024x1024",
          n: 1
        })
      },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("PROVIDER_ERROR");
    expect(body.error.message).toContain("No provider key");
  });

  it("cancels only tasks that are still queued and syncs assistant message status", async () => {
    await seedSessionAndTask(context.env, {
      taskId: "tsk_cancel",
      messageId: "msg_cancel",
      status: "queued"
    });

    const response = await app.request(
      "/api/tasks/tsk_cancel/cancel",
      { method: "POST", headers: await jsonHeaders("usr_managed") },
      context.env
    );

    expect(response.status).toBe(200);
    const row = await context.env.DB.prepare(
      `SELECT tasks.status AS task_status, messages.status AS message_status
       FROM tasks
       INNER JOIN messages ON messages.id = tasks.message_id
       WHERE tasks.id = 'tsk_cancel'`
    ).first<{ task_status: string; message_status: string }>();
    expect(row).toEqual({ task_status: "cancelled", message_status: "cancelled" });
  });

  it("does not cancel a task that changed status after access check", async () => {
    await seedSessionAndTask(context.env, {
      taskId: "tsk_cancel_race",
      messageId: "msg_cancel_race",
      status: "running"
    });

    const response = await app.request(
      "/api/tasks/tsk_cancel_race/cancel",
      { method: "POST", headers: await jsonHeaders("usr_managed") },
      context.env
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const task = await context.env.DB.prepare(
      "SELECT status FROM tasks WHERE id = 'tsk_cancel_race'"
    ).first<{ status: string }>();
    expect(task?.status).toBe("running");
  });

  it("preserves a task that races from queued to running before cancellation is persisted", async () => {
    await seedSessionAndTask(context.env, {
      taskId: "tsk_cancel_stale_snapshot",
      messageId: "msg_cancel_stale_snapshot",
      status: "queued"
    });
    await context.env.DB.prepare(
      `UPDATE tasks
       SET status = 'running', assigned_at = ?1, started_at = ?2, heartbeat_at = ?2
       WHERE id = 'tsk_cancel_stale_snapshot'`
    )
      .bind(1_778_000_000_100, 1_778_000_000_200)
      .run();

    const cancelled = await cancelQueuedGenerateTask(context.env, {
      taskId: "tsk_cancel_stale_snapshot",
      messageId: "msg_cancel_stale_snapshot",
      sessionId: "ses_tsk_cancel_stale_snapshot",
      providerKeyGroupId: "grp_perm"
    });

    expect(cancelled).toBeNull();
    const row = await context.env.DB.prepare(
      `SELECT tasks.status AS task_status, messages.status AS message_status
       FROM tasks
       INNER JOIN messages ON messages.id = tasks.message_id
       WHERE tasks.id = 'tsk_cancel_stale_snapshot'`
    ).first<{ task_status: string; message_status: string }>();
    expect(row).toEqual({ task_status: "running", message_status: "queued" });
  });
});

async function jsonHeaders(userId: string): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${await accessToken(userId)}`,
    "Content-Type": "application/json"
  };
}

async function accessToken(userId: string): Promise<string> {
  const role: UserRole = userId.startsWith("sys")
    ? "sysadmin"
    : userId.startsWith("adm")
      ? "admin"
      : "user";
  return signJwt(
    JWT_SECRET,
    {
      sub: userId,
      email: `${userId}@example.com`,
      role,
      type: "access"
    },
    60 * 15
  );
}

async function seedPermissionFixture(env: AppBindings) {
  const timestamp = 1_778_000_000_000;
  Object.assign(env, {
    JWT_SECRET,
    ENVIRONMENT: "dev",
    KV: {
      get: async () => null,
      put: async () => undefined
    },
    GENERATE_QUEUE: {
      idFromName: (name: string) => ({ name }) as DurableObjectId,
      get: () =>
        ({
          enqueue: async () => undefined,
          release: async () => undefined,
          fetch: async () => new Response(null, { status: 404 }),
          connect: () => {
            throw new Error("connect is not implemented in tests");
          }
        }) as unknown as DurableObjectStub
    }
  });
  await env.DB.prepare(
    `INSERT INTO providers (
       id, name, base_url, default_model, request_format, supported_sizes,
       enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, '米醋API', 'mock:', 'gpt-image-2', 'micu_images', ?2, 1, ?3, ?3, NULL)`
  )
    .bind(MICU_PROVIDER_ID, JSON.stringify(["1024x1024"]), timestamp)
    .run();
  await seedProviderKey(env, "key_perm", timestamp);
  await seedProviderKey(env, "key_perm_extra", timestamp + 1);
  await seedProviderKey(env, "key_perm_new_a", timestamp + 2);
  await seedProviderKey(env, "key_perm_new_b", timestamp + 3);
  await env.DB.prepare(
    `INSERT INTO providers (
       id, name, base_url, default_model, request_format, supported_sizes,
       enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, 'Cubence', 'mock:', 'gpt-image-2', 'openai_images', ?2, 1, ?3, ?3, NULL)`
  )
    .bind(CUBENCE_PROVIDER_ID, JSON.stringify(["1024x1024"]), timestamp)
    .run();
  await seedProviderKey(env, "key_other_provider", timestamp + 4, CUBENCE_PROVIDER_ID);
  await env.DB.prepare(
    `INSERT INTO providers (
       id, name, base_url, default_model, request_format, supported_sizes,
       enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, '米醋 Grok 图像', 'mock:', 'grok-imagine-image-pro', 'micu_grok_images', ?2, 1, ?3, ?3, NULL)`
  )
    .bind(MICU_GROK_PROVIDER_ID, JSON.stringify(["1024x1024"]), timestamp)
    .run();
  await seedProviderKey(
    env,
    "key_grok_perm",
    timestamp + 5,
    MICU_GROK_PROVIDER_ID,
    "grok-imagine-image-pro"
  );
  await env.DB.prepare(
    `INSERT INTO provider_key_groups (
       id, provider_id, name, description, enabled, created_by, updated_by,
       created_at, updated_at, deleted_at
     ) VALUES ('grp_perm', ?1, 'Permission Group', NULL, 1, NULL, NULL, ?2, ?2, NULL)`
  )
    .bind(MICU_PROVIDER_ID, timestamp)
    .run();
  await env.DB.prepare(
    `INSERT INTO provider_key_group_members (
       group_id, provider_key_id, sort_order, created_at, updated_at
     ) VALUES ('grp_perm', 'key_perm', 0, ?1, ?1)`
  )
    .bind(timestamp)
    .run();
  await env.DB.prepare(
    `INSERT INTO provider_key_groups (
       id, provider_id, name, description, enabled, created_by, updated_by,
       created_at, updated_at, deleted_at
     ) VALUES ('grp_grok_perm', ?1, 'Grok Permission Group', NULL, 1, NULL, NULL, ?2, ?2, NULL)`
  )
    .bind(MICU_GROK_PROVIDER_ID, timestamp)
    .run();
  await env.DB.prepare(
    `INSERT INTO provider_key_group_members (
       group_id, provider_key_id, sort_order, created_at, updated_at
     ) VALUES ('grp_grok_perm', 'key_grok_perm', 0, ?1, ?1)`
  )
    .bind(timestamp)
    .run();
  await seedUser(env, {
    id: "sys_owner",
    role: "sysadmin",
    createdBy: null,
    providerKeyGroupId: null,
    maxConcurrentTasks: null
  });
  await seedUser(env, {
    id: "adm_owner",
    role: "admin",
    createdBy: "sys_owner",
    providerKeyGroupId: "grp_perm",
    maxConcurrentTasks: 10
  });
  await seedUser(env, {
    id: "adm_other",
    role: "admin",
    createdBy: "sys_owner",
    providerKeyGroupId: "grp_perm",
    maxConcurrentTasks: 10
  });
  await seedUser(env, {
    id: "usr_managed",
    role: "user",
    createdBy: "adm_owner",
    providerKeyGroupId: "grp_perm",
    maxConcurrentTasks: 5
  });
  await seedUser(env, {
    id: "usr_other",
    role: "user",
    createdBy: "adm_other",
    providerKeyGroupId: "grp_perm",
    maxConcurrentTasks: 5
  });
  await seedUser(env, {
    id: "usr_no_group",
    role: "user",
    createdBy: "adm_owner",
    providerKeyGroupId: null,
    maxConcurrentTasks: 5
  });
}

async function seedProviderKey(
  env: AppBindings,
  id: string,
  timestamp: number,
  providerId = MICU_PROVIDER_ID,
  model = "gpt-image-2"
) {
  await env.DB.prepare(
    `INSERT INTO provider_keys (
       id, provider_id, label, model, encrypted_key, key_hint,
       allocated_quota, used_quota, max_concurrency, owner_admin_id,
       enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, ?2, ?3, ?4, 'encrypted', 'test', NULL, 0, 1, NULL, 1, ?5, ?5, NULL)`
  )
    .bind(id, providerId, id, model, timestamp)
    .run();
}

async function seedUser(
  env: AppBindings,
  input: {
    id: string;
    role: UserRole;
    createdBy: string | null;
    providerKeyGroupId: string | null;
    maxConcurrentTasks: number | null;
  }
) {
  const timestamp = 1_778_000_000_000;
  await env.DB.prepare(
    `INSERT INTO users (
       id, email, username, password_hash, nickname, role, created_by,
       preferred_provider_key_id, provider_key_group_id, max_concurrent_tasks,
       locale, status, created_at, updated_at, last_login_at
     ) VALUES (?1, ?2, ?1, 'hash', ?1, ?3, ?4, NULL, ?5, ?6, 'zh-CN', 'active', ?7, ?7, NULL)`
  )
    .bind(
      input.id,
      `${input.id}@example.com`,
      input.role,
      input.createdBy,
      input.providerKeyGroupId,
      input.maxConcurrentTasks,
      timestamp
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO quotas (user_id, allocated_quota, used_quota, updated_at)
     VALUES (?1, 100, 0, ?2)`
  )
    .bind(input.id, timestamp)
    .run();
}

async function seedSessionAndTask(
  env: AppBindings,
  input: { taskId: string; messageId: string; status: "queued" | "running" }
) {
  const timestamp = 1_778_000_000_000;
  const sessionId = `ses_${input.taskId}`;
  await env.DB.prepare(
    `INSERT INTO sessions (
       id, user_id, title, mode, provider_key_id, provider_key_group_id,
       settings, created_at, updated_at, last_message_at, archived, deleted_at
     ) VALUES (?1, 'usr_managed', ?1, 'text2image', 'key_perm', 'grp_perm',
       ?2, ?3, ?3, ?3, 0, NULL)`
  )
    .bind(sessionId, JSON.stringify({ size: "1024x1024", n: 1 }), timestamp)
    .run();
  await env.DB.prepare(
    `INSERT INTO messages (
       id, session_id, role, prompt, reference_image_ids, attachments,
       task_id, status, created_at, deleted_at
     ) VALUES (?1, ?2, 'assistant', 'prompt', '[]', '[]', ?3, ?4, ?5, NULL)`
  )
    .bind(input.messageId, sessionId, input.taskId, input.status, timestamp)
    .run();
  await env.DB.prepare(
    `INSERT INTO tasks (
       id, session_id, message_id, user_id, provider_key_id, provider_key_group_id,
       status, mode, params, error_code, error_msg, provider_request_id,
       provider_raw_response, queued_at, assigned_at, started_at, heartbeat_at,
       finished_at, retry_of
     ) VALUES (?1, ?2, ?3, 'usr_managed', 'key_perm', 'grp_perm', ?4, 'text2image',
       ?5, NULL, NULL, NULL, NULL, ?6, ?7, ?8, ?8, NULL, NULL)`
  )
    .bind(
      input.taskId,
      sessionId,
      input.messageId,
      input.status,
      JSON.stringify({ prompt: "prompt", mode: "text2image", size: "1024x1024", n: 1 }),
      timestamp,
      input.status === "running" ? timestamp : null,
      input.status === "running" ? timestamp + 1 : null
    )
    .run();
}
