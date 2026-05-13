import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertNoActiveGenerationTask } from "../src/lib/tasks";
import {
  assignQueuedTaskToProviderKey,
  getNextAvailableProviderKeySlot,
  getNextQueuedTaskForGroup,
  resetStaleAssignedQueuedTasks
} from "../src/lib/tasks/scheduler";
import { claimGenerateTask } from "../src/lib/tasks/state";
import { MICU_PROVIDER_ID } from "../src/providers/catalog";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import type { AppBindings, TaskStatus, UserRole } from "../src/types";

describe("provider key queue scheduler", () => {
  let context: D1TestContext;

  beforeEach(async () => {
    context = await createD1TestContext();
    await seedQueueFixture(context.env);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await context.dispose();
  });

  it("skips a full first key and selects the next sorted key", async () => {
    await seedTask(context.env, {
      id: "tsk_active_key_1",
      providerKeyId: "key_queue_1",
      assignedAt: 1_000,
      status: "running"
    });

    const slot = await getNextAvailableProviderKeySlot(context.env, "grp_queue");

    expect(slot).toMatchObject({
      providerKeyId: "key_queue_2",
      maxConcurrency: 2,
      activeCount: 0
    });
  });

  it("returns no key when every provider key in the group is full", async () => {
    await seedTask(context.env, {
      id: "tsk_active_key_1",
      providerKeyId: "key_queue_1",
      assignedAt: 1_000,
      status: "running"
    });
    await seedTask(context.env, {
      id: "tsk_active_key_2a",
      providerKeyId: "key_queue_2",
      assignedAt: 1_001,
      status: "running"
    });
    await seedTask(context.env, {
      id: "tsk_active_key_2b",
      providerKeyId: "key_queue_2",
      assignedAt: 1_002,
      status: "queued"
    });

    expect(await getNextAvailableProviderKeySlot(context.env, "grp_queue")).toBeNull();
  });

  it("assigns the earliest unassigned queued task idempotently", async () => {
    await seedTask(context.env, { id: "tsk_wait_later", queuedAt: 2_000 });
    await seedTask(context.env, { id: "tsk_wait_first", queuedAt: 1_000 });

    const task = await getNextQueuedTaskForGroup(context.env, "grp_queue");
    expect(task).toEqual({ id: "tsk_wait_first", providerKeyGroupId: "grp_queue" });

    const assigned = await assignQueuedTaskToProviderKey(context.env, {
      taskId: "tsk_wait_first",
      providerKeyId: "key_queue_2",
      assignedAt: 3_000
    });
    const reassigned = await assignQueuedTaskToProviderKey(context.env, {
      taskId: "tsk_wait_first",
      providerKeyId: "key_queue_1",
      assignedAt: 4_000
    });

    expect(assigned).toBe(true);
    expect(reassigned).toBe(false);
    await expectTaskAssignment(context.env, "tsk_wait_first", {
      providerKeyId: "key_queue_2",
      assignedAt: 3_000
    });
  });

  it("treats terminal tasks as released provider key slots", async () => {
    await seedTask(context.env, {
      id: "tsk_done_key_1",
      providerKeyId: "key_queue_1",
      assignedAt: 1_000,
      status: "succeeded"
    });

    const slot = await getNextAvailableProviderKeySlot(context.env, "grp_queue");

    expect(slot?.providerKeyId).toBe("key_queue_1");
    expect(slot?.activeCount).toBe(0);
  });

  it("resets stale assigned queued tasks so they can be dispatched again", async () => {
    await seedTask(context.env, {
      id: "tsk_stale",
      providerKeyId: "key_queue_1",
      assignedAt: 1_000,
      status: "queued"
    });

    const reset = await resetStaleAssignedQueuedTasks(context.env, {
      limit: 10,
      staleBefore: 2_000
    });

    expect(reset).toBe(1);
    await expectTaskAssignment(context.env, "tsk_stale", {
      providerKeyId: "key_queue_1",
      assignedAt: null
    });
    expect(await getNextQueuedTaskForGroup(context.env, "grp_queue")).toEqual({
      id: "tsk_stale",
      providerKeyGroupId: "grp_queue"
    });
  });

  it("does not let a stale workflow claim a queued task after assigned_at was reset", async () => {
    await seedTask(context.env, {
      id: "tsk_stale_claim",
      providerKeyId: "key_queue_1",
      assignedAt: 1_000,
      status: "queued"
    });
    await resetStaleAssignedQueuedTasks(context.env, {
      limit: 10,
      staleBefore: 2_000
    });

    const claimed = await claimGenerateTask(context.env, "tsk_stale_claim", 3_000);

    expect(claimed).toBe(false);
  });

  it("enforces admin/user active task limits while leaving sysadmin unlimited", async () => {
    await seedUser(context.env, {
      id: "usr_admin_limit",
      role: "admin",
      maxConcurrentTasks: 2
    });
    await seedTask(context.env, {
      id: "tsk_admin_1",
      userId: "usr_admin_limit",
      sessionId: "ses_usr_admin_limit",
      messageId: "msg_usr_admin_limit",
      status: "queued"
    });
    await seedTask(context.env, {
      id: "tsk_admin_2",
      userId: "usr_admin_limit",
      sessionId: "ses_usr_admin_limit",
      messageId: "msg_usr_admin_limit_2",
      status: "running",
      providerKeyId: "key_queue_1",
      assignedAt: 2_000
    });

    await expect(
      assertNoActiveGenerationTask(context.env, { userId: "usr_admin_limit", role: "admin" })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      details: expect.objectContaining({ activeCount: 2, limit: 2 })
    });

    await seedUser(context.env, {
      id: "usr_sysadmin_limit",
      role: "sysadmin",
      maxConcurrentTasks: null
    });
    await seedTask(context.env, {
      id: "tsk_sysadmin_1",
      userId: "usr_sysadmin_limit",
      sessionId: "ses_usr_sysadmin_limit",
      messageId: "msg_usr_sysadmin_limit",
      status: "queued"
    });

    await expect(
      assertNoActiveGenerationTask(context.env, {
        userId: "usr_sysadmin_limit",
        role: "sysadmin"
      })
    ).resolves.toBeUndefined();
  });
});

async function seedQueueFixture(env: AppBindings) {
  const timestamp = 1_778_000_000_000;
  await seedProvider(env, timestamp);
  await env.DB.prepare(
    `INSERT INTO provider_key_groups (
       id, provider_id, name, description, enabled, created_by, updated_by,
       created_at, updated_at, deleted_at
     ) VALUES ('grp_queue', ?1, 'Queue Group', NULL, 1, NULL, NULL, ?2, ?2, NULL)`
  )
    .bind(MICU_PROVIDER_ID, timestamp)
    .run();
  await seedProviderKey(env, {
    id: "key_queue_1",
    maxConcurrency: 1,
    createdAt: timestamp
  });
  await seedProviderKey(env, {
    id: "key_queue_2",
    maxConcurrency: 2,
    createdAt: timestamp + 1
  });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO provider_key_group_members (
         group_id, provider_key_id, sort_order, created_at, updated_at
       ) VALUES ('grp_queue', 'key_queue_1', 0, ?1, ?1)`
    ).bind(timestamp),
    env.DB.prepare(
      `INSERT INTO provider_key_group_members (
         group_id, provider_key_id, sort_order, created_at, updated_at
      ) VALUES ('grp_queue', 'key_queue_2', 1, ?1, ?1)`
    ).bind(timestamp)
  ]);
  await seedUser(env, { id: "usr_queue", role: "user", maxConcurrentTasks: 5 });
}

async function seedProvider(env: AppBindings, timestamp: number) {
  await env.DB.prepare(
    `INSERT INTO providers (
       id, name, base_url, default_model, request_format, supported_sizes,
       enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, '米醋API', 'mock:', 'gpt-image-2', 'micu_images', ?2, 1, ?3, ?3, NULL)`
  )
    .bind(MICU_PROVIDER_ID, JSON.stringify(["1024x1024"]), timestamp)
    .run();
}

async function seedProviderKey(
  env: AppBindings,
  input: { id: string; maxConcurrency: number; createdAt: number }
) {
  await env.DB.prepare(
    `INSERT INTO provider_keys (
       id, provider_id, label, model, encrypted_key, key_hint,
       allocated_quota, used_quota, max_concurrency, owner_admin_id,
       enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, ?2, ?3, 'gpt-image-2', 'encrypted', 'test', NULL, 0, ?4, NULL, 1, ?5, ?5, NULL)`
  )
    .bind(
      input.id,
      MICU_PROVIDER_ID,
      input.id.replace("key_", "Key "),
      input.maxConcurrency,
      input.createdAt
    )
    .run();
}

async function seedUser(
  env: AppBindings,
  input: { id: string; role: UserRole; maxConcurrentTasks: number | null }
) {
  const timestamp = 1_778_000_000_000;
  await env.DB.prepare(
    `INSERT INTO users (
       id, email, username, password_hash, nickname, role, created_by,
       preferred_provider_key_id, provider_key_group_id, max_concurrent_tasks,
       locale, status, created_at, updated_at, last_login_at
     ) VALUES (?1, ?2, ?3, 'hash', ?4, ?5, NULL, NULL, 'grp_queue', ?6, 'zh-CN', 'active', ?7, ?7, NULL)`
  )
    .bind(
      input.id,
      `${input.id}@example.com`,
      input.id,
      input.id,
      input.role,
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
  await seedSession(env, {
    id: `ses_${input.id}`,
    userId: input.id,
    providerKeyId: "key_queue_1"
  });
}

async function seedSession(
  env: AppBindings,
  input: { id: string; userId: string; providerKeyId: string | null }
) {
  const timestamp = 1_778_000_000_000;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO sessions (
       id, user_id, title, mode, provider_key_id, provider_key_group_id,
       settings, created_at, updated_at, last_message_at, archived, deleted_at
     ) VALUES (?1, ?2, ?3, 'text2image', ?4, 'grp_queue', ?5, ?6, ?6, ?6, 0, NULL)`
  )
    .bind(
      input.id,
      input.userId,
      input.id,
      input.providerKeyId,
      JSON.stringify({ size: "1024x1024", n: 1 }),
      timestamp
    )
    .run();
}

async function seedTask(
  env: AppBindings,
  input: {
    id: string;
    userId?: string;
    sessionId?: string;
    messageId?: string;
    providerKeyId?: string;
    status?: TaskStatus;
    queuedAt?: number;
    assignedAt?: number | null;
  }
) {
  const timestamp = input.queuedAt ?? 1_778_000_000_000;
  const userId = input.userId ?? "usr_queue";
  const sessionId = input.sessionId ?? "ses_usr_queue";
  const messageId = input.messageId ?? `msg_${input.id}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO messages (
       id, session_id, role, prompt, reference_image_ids, attachments,
       task_id, status, created_at, deleted_at
     ) VALUES (?1, ?2, 'assistant', 'prompt', '[]', '[]', ?3, ?4, ?5, NULL)`
  )
    .bind(messageId, sessionId, input.id, input.status ?? "queued", timestamp)
    .run();
  await env.DB.prepare(
    `INSERT INTO tasks (
       id, session_id, message_id, user_id, provider_key_id, provider_key_group_id,
       status, mode, params, error_code, error_msg, provider_request_id,
       provider_raw_response, queued_at, assigned_at, started_at, heartbeat_at,
       finished_at, retry_of
     ) VALUES (?1, ?2, ?3, ?4, ?5, 'grp_queue', ?6, 'text2image', ?7, NULL, NULL, NULL,
       NULL, ?8, ?9, NULL, NULL, NULL, NULL)`
  )
    .bind(
      input.id,
      sessionId,
      messageId,
      userId,
      input.providerKeyId ?? "key_queue_1",
      input.status ?? "queued",
      JSON.stringify({ prompt: "prompt", mode: "text2image", size: "1024x1024", n: 1 }),
      timestamp,
      input.assignedAt ?? null
    )
    .run();
}

async function expectTaskAssignment(
  env: AppBindings,
  taskId: string,
  expected: { providerKeyId: string; assignedAt: number | null }
) {
  const row = await env.DB.prepare(
    `SELECT provider_key_id, assigned_at
     FROM tasks
     WHERE id = ?1`
  )
    .bind(taskId)
    .first<{ provider_key_id: string | null; assigned_at: number | null }>();

  expect(row).toEqual({
    provider_key_id: expected.providerKeyId,
    assigned_at: expected.assignedAt
  });
}
