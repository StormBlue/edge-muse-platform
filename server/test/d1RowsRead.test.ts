import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAuditSessionListSql, listAuditSessions } from "../src/lib/auditSessionList";
import { CLEANUP_DELETED_IMAGES_SQL } from "../src/lib/cleanup";
import {
  GENERATION_PAGE_USAGE_SQL,
  getGenerationPageUsageMetrics,
  getGenerationUsageWindow,
  purgeExpiredGenerationEvents,
  recordGenerationEvent
} from "../src/lib/generationEntry";
import { buildUserHistoryListSql, listUserHistorySessions } from "../src/lib/historySessions";
import {
  buildManagedUserPageSql,
  buildManagedUserTaskStatsSql,
  listManagedUsers
} from "../src/lib/managedUsers";
import {
  loadProviderKeyActiveSlotCounts,
  PROVIDER_KEY_ACTIVE_SLOTS_SQL
} from "../src/lib/providerKeySlots";
import { LOAD_TASK_GENERATED_IMAGES_SQL } from "../src/lib/tasks/taskImages";
import { LOAD_SESSION_GENERATED_IMAGES_SQL } from "../src/routes/sessions/historyImages";
import { MICU_PROVIDER_ID } from "../src/providers/catalog";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import type { AppBindings, AuthUser } from "../src/types";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("D1 rows-read list and hot-path queries", () => {
  let ctx: D1TestContext;

  beforeEach(async () => {
    ctx = await createD1TestContext();
    await seedFixture(ctx.env);
    await ctx.env.DB.prepare("ANALYZE").run();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it("pages history sessions then aggregates only that page", async () => {
    const page = await listUserHistorySessions(ctx.env, {
      userId: "usr_owner",
      page: 1,
      pageSize: 12
    });

    expect(page.total).toBe(24);
    expect(page.items).toHaveLength(12);
    expect(page.items[0]).toMatchObject({
      id: "ses_owner_23",
      taskCount: 3,
      imageCount: 2,
      requestedImageCount: 3,
      status: "succeeded"
    });
    expect(page.items[0]?.coverImage?.id).toBe("img_second");
    expect(page.items[1]).toMatchObject({
      id: "ses_owner_22",
      taskCount: 1,
      status: "running"
    });
    expect(page.items.every((item) => item.id.startsWith("ses_owner_"))).toBe(true);

    const sql = buildUserHistoryListSql({
      userId: "usr_owner",
      page: 1,
      pageSize: 12
    }).sql;
    expect(sql).toContain("LIMIT ?");
    expect(sql).not.toMatch(/LEFT JOIN tasks/i);
    expect(sql).not.toMatch(/GROUP BY sessions\.id/i);

    const plan = await explain(ctx.env, sql, ["usr_owner", 12, 0]);
    expect(plan).toMatch(/idx_sessions_user_last/);
    assertNoUnindexedScan(plan, "tasks");
  });

  it("aggregates admin user generation counts only for the page of users", async () => {
    const page = await listManagedUsers(ctx.env, {
      actor: { id: "usr_admin", role: "admin" },
      page: 1,
      pageSize: 20
    });

    expect(page.total).toBe(1);
    expect(page.items).toEqual([
      expect.objectContaining({
        id: "usr_owner",
        generationCount: 26,
        lastGenerationAt: NOW + 23
      })
    ]);

    const statsSql = buildManagedUserTaskStatsSql(["usr_owner"]);
    const plan = await explain(ctx.env, statsSql.sql, statsSql.binds);
    expect(plan).toMatch(/idx_tasks_user_queued/);
    assertNoUnindexedScan(plan, "tasks");

    const pageSql = buildManagedUserPageSql({
      actor: { id: "usr_admin", role: "admin" },
      page: 1,
      pageSize: 20
    });
    expect(pageSql.sql).not.toMatch(/JOIN tasks/i);
  });

  it("lists sysadmin audit sessions without joining all tasks before limit", async () => {
    const page = await listAuditSessions(ctx.env, {
      userId: "usr_owner",
      page: 1,
      pageSize: 12
    });
    expect(page.total).toBe(24);
    expect(page.items[0]).toMatchObject({
      id: "ses_owner_23",
      taskCount: 3,
      imageCount: 2
    });

    const query = buildAuditSessionListSql({
      userId: "usr_owner",
      page: 1,
      pageSize: 12,
      hasUsername: true
    });
    expect(query.sql).not.toMatch(/LEFT JOIN tasks ON tasks\.session_id = sessions\.id/i);
    const plan = await explain(ctx.env, query.sql, query.binds);
    expect(plan).toMatch(/idx_sessions_user_last|idx_tasks_session/);
    assertNoUnindexedScan(plan, "tasks");
  });

  it("counts generation usage with SQL GROUP BY and purges events outside the window", async () => {
    const window = getGenerationUsageWindow();
    const metrics = await getGenerationPageUsageMetrics(ctx.env, { window });
    expect(metrics).toEqual([
      { route: "/workspace", submitted: 0, succeeded: 0, failed: 0 },
      { route: "/ai-image", submitted: 2, succeeded: 1, failed: 0 }
    ]);

    const grouped = await ctx.env.DB.prepare(GENERATION_PAGE_USAGE_SQL)
      .bind(window.since, window.until)
      .all<{ route: string; eventName: string; count: number }>();
    expect(grouped.results).toEqual(
      expect.arrayContaining([
        { route: "/ai-image", eventName: "generate_submitted", count: 2 },
        { route: "/ai-image", eventName: "generate_succeeded", count: 1 }
      ])
    );

    const deleted = await purgeExpiredGenerationEvents(ctx.env, { window, limit: 100 });
    expect(deleted).toBeGreaterThan(0);
    const leftover = await ctx.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM generation_events WHERE created_at < ?1"
    )
      .bind(window.since)
      .first<{ count: number }>();
    expect(leftover?.count).toBe(0);

    const usagePlan = await explain(ctx.env, GENERATION_PAGE_USAGE_SQL, [
      window.since,
      window.until
    ]);
    expect(usagePlan).toMatch(/idx_generation_events_created_preview|idx_generation_events/);
  });

  it("counts provider key slots from queued/running assigned tasks only", async () => {
    const slots = await loadProviderKeyActiveSlotCounts(ctx.env);
    expect(slots.get("key_rows")).toBe(1);
    expect(slots.get("key_rows") ?? 0).toBe(1);

    const plan = await explain(ctx.env, PROVIDER_KEY_ACTIVE_SLOTS_SQL, []);
    expect(plan).toMatch(/USING INDEX idx_tasks_/);
    assertNoUnindexedScan(plan, "tasks");
  });

  it("looks up generated images by task_id and session_id using the new indexes", async () => {
    const taskPlan = await explain(ctx.env, LOAD_TASK_GENERATED_IMAGES_SQL, ["tsk_owner_23_0"]);
    expect(taskPlan).toMatch(/idx_image_objects_task/);
    assertNoUnindexedScan(taskPlan, "image_objects");

    const sessionPlan = await explain(ctx.env, LOAD_SESSION_GENERATED_IMAGES_SQL, ["ses_owner_23"]);
    expect(sessionPlan).toMatch(/idx_image_objects_session/);
    assertNoUnindexedScan(sessionPlan, "image_objects");

    const cleanupPlan = await explain(ctx.env, CLEANUP_DELETED_IMAGES_SQL, [NOW]);
    expect(cleanupPlan).toMatch(/idx_image_objects_deleted/);
  });
});

async function explain(env: AppBindings, sql: string, binds: unknown[]) {
  const statement = env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`);
  const rows = binds.length
    ? await statement.bind(...binds).all<Record<string, unknown>>()
    : await statement.all<Record<string, unknown>>();
  return rows.results
    .map((row) => String(row.detail ?? row.DETAIL ?? Object.values(row).join(" ")))
    .join("\n");
}

function assertNoUnindexedScan(plan: string, table: string) {
  const scan = new RegExp(`SCAN\\s+(?:TABLE\\s+)?${table}\\b`, "i");
  for (const line of plan.split("\n")) {
    if (!scan.test(line)) continue;
    if (/USING (?:COVERING )?INDEX/i.test(line)) continue;
    throw new Error(`unindexed scan of ${table}: ${line}\n${plan}`);
  }
}

async function seedFixture(env: AppBindings) {
  await env.DB.prepare(
    `INSERT INTO providers (
       id, name, base_url, default_model, request_format, supported_sizes,
       enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, '米醋API', 'mock:', 'gpt-image-2', 'micu_images', '["1024x1024"]', 1, ?2, ?2, NULL)`
  )
    .bind(MICU_PROVIDER_ID, NOW)
    .run();
  await env.DB.prepare(
    `INSERT INTO provider_keys (
       id, provider_id, label, model, encrypted_key, key_hint,
       allocated_quota, used_quota, max_concurrency, owner_admin_id,
       enabled, created_at, updated_at, deleted_at
     ) VALUES ('key_rows', ?1, 'Key', 'gpt-image-2', 'encrypted', 'test', NULL, 0, 2, NULL, 1, ?2, ?2, NULL)`
  )
    .bind(MICU_PROVIDER_ID, NOW)
    .run();

  await insertUser(env, {
    id: "usr_admin",
    role: "admin",
    createdBy: null
  });
  await insertUser(env, {
    id: "usr_owner",
    role: "user",
    createdBy: "usr_admin"
  });
  await insertUser(env, {
    id: "usr_other",
    role: "user",
    createdBy: null
  });

  for (let index = 0; index < 24; index += 1) {
    const sessionId = `ses_owner_${index}`;
    const lastMessageAt = NOW + index;
    await insertSession(env, {
      id: sessionId,
      userId: "usr_owner",
      lastMessageAt
    });
    if (index === 23) {
      await insertTask(env, {
        id: "tsk_owner_23_0",
        sessionId,
        userId: "usr_owner",
        status: "succeeded",
        queuedAt: lastMessageAt,
        n: 1
      });
      await insertTask(env, {
        id: "tsk_owner_23_1",
        sessionId,
        userId: "usr_owner",
        status: "succeeded",
        queuedAt: lastMessageAt,
        n: 1
      });
      await insertTask(env, {
        id: "tsk_owner_23_2",
        sessionId,
        userId: "usr_owner",
        status: "succeeded",
        queuedAt: lastMessageAt,
        n: 1
      });
      await insertMessageWithImages(env, sessionId, ["img_cover", "img_second"]);
      await insertImage(env, {
        id: "img_cover",
        sessionId,
        taskId: "tsk_owner_23_0"
      });
      await insertImage(env, {
        id: "img_second",
        sessionId,
        taskId: "tsk_owner_23_1"
      });
      continue;
    }
    if (index === 22) {
      await insertTask(env, {
        id: "tsk_owner_running",
        sessionId,
        userId: "usr_owner",
        status: "running",
        queuedAt: lastMessageAt,
        assignedAt: lastMessageAt,
        n: 1
      });
      continue;
    }
    await insertTask(env, {
      id: `tsk_owner_${index}`,
      sessionId,
      userId: "usr_owner",
      status: "succeeded",
      queuedAt: lastMessageAt,
      n: 1
    });
  }

  for (let index = 0; index < 8; index += 1) {
    const sessionId = `ses_other_${index}`;
    await insertSession(env, {
      id: sessionId,
      userId: "usr_other",
      lastMessageAt: NOW + index
    });
    for (let taskIndex = 0; taskIndex < 6; taskIndex += 1) {
      await insertTask(env, {
        id: `tsk_other_${index}_${taskIndex}`,
        sessionId,
        userId: "usr_other",
        status: "succeeded",
        queuedAt: NOW + index,
        n: 1
      });
    }
  }

  const owner: AuthUser = {
    id: "usr_owner",
    email: "usr_owner@example.com",
    username: "usr_owner",
    nickname: "Owner",
    role: "user",
    status: "active"
  };
  await recordGenerationEvent(env, owner, {
    eventName: "page_opened",
    route: "/ai-image",
    metadata: {}
  });
  await recordGenerationEvent(env, owner, {
    eventName: "generate_submitted",
    route: "/ai-image",
    taskId: "tsk_1",
    metadata: {}
  });
  await recordGenerationEvent(env, owner, {
    eventName: "generate_submitted",
    route: "/ai-image",
    taskId: "tsk_2",
    metadata: {}
  });
  await recordGenerationEvent(env, owner, {
    eventName: "generate_succeeded",
    route: "/ai-image",
    taskId: "tsk_1",
    metadata: {}
  });
  await env.DB.prepare(
    `INSERT INTO generation_events (
       id, user_id, route, event_name, case_id, task_id, metadata,
       is_sysadmin_preview, created_at
     ) VALUES ('genevt_old', 'usr_owner', '/ai-image', 'generate_submitted', NULL, 'tsk_old', '{}', 0, ?1)`
  )
    .bind(Date.now() - 40 * DAY)
    .run();

  await insertTask(env, {
    id: "tsk_slot_done",
    sessionId: "ses_other_0",
    userId: "usr_other",
    status: "succeeded",
    queuedAt: NOW,
    assignedAt: NOW,
    n: 1
  });

  for (let index = 0; index < 200; index += 1) {
    await insertImage(env, {
      id: `img_pad_${index}`,
      sessionId: "ses_other_0",
      taskId: "tsk_other_0_0"
    });
  }
}

async function insertUser(
  env: AppBindings,
  input: { id: string; role: AuthUser["role"]; createdBy: string | null }
) {
  await env.DB.prepare(
    `INSERT INTO users (
       id, email, username, password_hash, nickname, role, created_by,
       preferred_provider_key_id, provider_key_group_id, max_concurrent_tasks,
       locale, status, created_at, updated_at, last_login_at
     ) VALUES (?1, ?2, ?3, 'hash', ?4, ?5, ?6, NULL, NULL, 5, 'zh-CN', 'active', ?7, ?7, NULL)`
  )
    .bind(input.id, `${input.id}@example.com`, input.id, input.id, input.role, input.createdBy, NOW)
    .run();
  await env.DB.prepare(
    `INSERT INTO quotas (user_id, allocated_quota, used_quota, updated_at)
     VALUES (?1, 100, 0, ?2)`
  )
    .bind(input.id, NOW)
    .run();
}

async function insertSession(
  env: AppBindings,
  input: { id: string; userId: string; lastMessageAt: number }
) {
  await env.DB.prepare(
    `INSERT INTO sessions (
       id, user_id, title, mode, provider_key_id, provider_key_group_id,
       settings, created_at, updated_at, last_message_at, archived, deleted_at
     ) VALUES (?1, ?2, ?3, 'text2image', NULL, NULL, '{"size":"auto","n":1}', ?4, ?4, ?5, 0, NULL)`
  )
    .bind(input.id, input.userId, input.id, NOW, input.lastMessageAt)
    .run();
}

async function insertTask(
  env: AppBindings,
  input: {
    id: string;
    sessionId: string;
    userId: string;
    status: "queued" | "running" | "succeeded";
    queuedAt: number;
    assignedAt?: number;
    n: number;
  }
) {
  const messageId = `msg_${input.id}`;
  await env.DB.prepare(
    `INSERT INTO messages (
       id, session_id, role, prompt, reference_image_ids, attachments,
       task_id, status, created_at, deleted_at
     ) VALUES (?1, ?2, 'assistant', 'prompt', '[]', '[]', ?3, ?4, ?5, NULL)`
  )
    .bind(messageId, input.sessionId, input.id, input.status, input.queuedAt)
    .run();
  await env.DB.prepare(
    `INSERT INTO tasks (
       id, session_id, message_id, user_id, provider_key_id, provider_key_group_id,
       status, mode, params, error_code, error_msg, provider_request_id,
       provider_raw_response, queued_at, assigned_at, started_at, heartbeat_at,
       finished_at, retry_of
     ) VALUES (?1, ?2, ?3, ?4, 'key_rows', NULL, ?5, 'text2image', ?6, NULL, NULL, NULL,
       NULL, ?7, ?8, NULL, NULL, NULL, NULL)`
  )
    .bind(
      input.id,
      input.sessionId,
      messageId,
      input.userId,
      input.status,
      JSON.stringify({ prompt: "prompt", mode: "text2image", size: "auto", n: input.n }),
      input.queuedAt,
      input.assignedAt ?? null
    )
    .run();
}

async function insertMessageWithImages(env: AppBindings, sessionId: string, imageIds: string[]) {
  const attachments = JSON.stringify(
    imageIds.map((id) => ({ id, url: `/api/i/${id}`, mime: "image/png", byteSize: 10 }))
  );
  await env.DB.prepare(
    `INSERT INTO messages (
       id, session_id, role, prompt, reference_image_ids, attachments,
       task_id, status, created_at, deleted_at
     ) VALUES (?1, ?2, 'assistant', 'cover', '[]', ?3, NULL, 'succeeded', ?4, NULL)`
  )
    .bind(`msg_cover_${sessionId}`, sessionId, attachments, NOW + 100)
    .run();
}

async function insertImage(
  env: AppBindings,
  input: { id: string; sessionId: string; taskId: string }
) {
  await env.DB.prepare(
    `INSERT INTO image_objects (
       id, task_id, session_id, owner_user_id, r2_key, mime, width, height,
       byte_size, sha256, is_reference, created_at, deleted_at
     ) VALUES (?1, ?2, ?3, 'usr_owner', ?4, 'image/png', 1, 1, 10, ?1, 0, ?5, NULL)`
  )
    .bind(input.id, input.taskId, input.sessionId, `r2/${input.id}`, NOW)
    .run();
}
