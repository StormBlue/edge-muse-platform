import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installErrorHandling } from "../src/middleware/error";
import { adminRoutes } from "../src/routes/admin";
import { generateRoutes } from "../src/routes/generate";
import { sysadminRoutes } from "../src/routes/sysadmin";
import { signJwt } from "../src/lib/jwt";
import { MICU_PROVIDER_ID } from "../src/providers/catalog";
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
          keyIds: ["key_perm_extra", "key_perm"]
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
      { provider_key_id: "key_perm_extra", sort_order: 0 },
      { provider_key_id: "key_perm", sort_order: 1 }
    ]);
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
  await env.DB.prepare(
    `INSERT INTO providers (
       id, name, base_url, default_model, request_format, supported_sizes,
       enabled, created_at, updated_at, deleted_at
     ) VALUES ('openai_images', 'Cubence', 'mock:', 'gpt-image-2', 'openai_images', ?1, 1, ?2, ?2, NULL)`
  )
    .bind(JSON.stringify(["1024x1024"]), timestamp)
    .run();
  await seedProviderKey(env, "key_other_provider", timestamp + 2, "openai_images");
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
  providerId = MICU_PROVIDER_ID
) {
  await env.DB.prepare(
    `INSERT INTO provider_keys (
       id, provider_id, label, model, encrypted_key, key_hint,
       allocated_quota, used_quota, max_concurrency, owner_admin_id,
       enabled, created_at, updated_at, deleted_at
     ) VALUES (?1, ?2, ?3, 'gpt-image-2', 'encrypted', 'test', NULL, 0, 1, NULL, 1, ?4, ?4, NULL)`
  )
    .bind(id, providerId, id, timestamp)
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
