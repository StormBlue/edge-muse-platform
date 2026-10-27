import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isImageRowConflict,
  isRetryableD1WriteError,
  isTransientBindingDisconnect,
  transientBindingRetryDelayMs
} from "../src/lib/bindingRetry";
import { getDb } from "../src/db/client";
import { imageObjects, users } from "../src/db/schema";
import { putImage } from "../src/lib/r2";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import type { AppBindings } from "../src/types";

const sleepNow = async () => {};
const control = { sleep: sleepNow, random: () => 0 };

describe("binding retry policy", () => {
  it("matches the documented disconnect and D1 transient errors", () => {
    expect(isTransientBindingDisconnect(new Error("Network connection lost."))).toBe(true);
    expect(isTransientBindingDisconnect(new Error("D1 quota exceeded"))).toBe(false);
    expect(isRetryableD1WriteError(new Error("storage caused object to be reset"))).toBe(true);
    expect(isRetryableD1WriteError(new Error("reset because its code was updated"))).toBe(true);
    expect(isImageRowConflict(new Error("UNIQUE constraint failed: image_objects.r2_key"))).toBe(
      true
    );
    expect(isImageRowConflict(new Error("Network connection lost."))).toBe(false);
  });

  it("uses exponential backoff with jitter between half and the full ceiling", () => {
    expect(transientBindingRetryDelayMs(1, () => 0)).toBe(50);
    expect(transientBindingRetryDelayMs(1, () => 1)).toBe(100);
    expect(transientBindingRetryDelayMs(4, () => 0)).toBe(400);
    expect(transientBindingRetryDelayMs(4, () => 1)).toBe(800);
  });
});

describe("putImage binding retry", () => {
  let ctx: D1TestContext;

  beforeEach(async () => {
    ctx = await createD1TestContext();
    await getDb(ctx.env).insert(users).values({
      id: "usr_owner",
      email: "owner@example.com",
      username: "owner",
      passwordHash: "hash",
      nickname: "Owner",
      role: "user",
      status: "active",
      createdAt: 1,
      updatedAt: 1
    });
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it("retries the same key after a disconnect and stores one row", async () => {
    const puts: string[] = [];
    const env = envWithR2(ctx, {
      async put(key, _bytes, options) {
        puts.push(onlyIf(options));
        if (puts.length === 1) throw new Error("Network connection lost.");
        return { key };
      }
    });

    const image = await putImage(env, imageInput(), control);

    expect(puts).toEqual(['If-None-Match: "*"', 'If-None-Match: "*"']);
    expect(image.byteSize).toBe(4);
    expect(await imageCount(ctx)).toBe(1);
  });

  it("treats a null conditional put as the object already stored", async () => {
    let calls = 0;
    let heads = 0;
    const env = envWithR2(ctx, {
      async put() {
        calls += 1;
        if (calls === 1) throw new Error("Network connection lost.");
        return null;
      }
    });
    env.R2.head = (async () => {
      heads += 1;
      return { key: "present" };
    }) as typeof env.R2.head;

    await putImage(env, imageInput(), control);

    expect(calls).toBe(2);
    expect(heads).toBe(1);
    expect(await imageCount(ctx)).toBe(1);
  });

  it("does not retry a non-disconnect R2 error", async () => {
    let calls = 0;
    const env = envWithR2(ctx, {
      async put() {
        calls += 1;
        throw new Error("R2 quota exceeded");
      }
    });

    await expect(putImage(env, imageInput(), control)).rejects.toThrow("R2 quota exceeded");
    expect(calls).toBe(1);
    expect(await imageCount(ctx)).toBe(0);
  });

  it("stops after five disconnects", async () => {
    let calls = 0;
    const env = envWithR2(ctx, {
      async put() {
        calls += 1;
        throw Object.assign(new Error("Network connection lost."), { retryable: true });
      }
    });

    await expect(putImage(env, imageInput(), control)).rejects.toThrow("Network connection lost.");
    expect(calls).toBe(5);
    expect(await imageCount(ctx)).toBe(0);
  });

  it("retries a transient D1 insert and keeps one row", async () => {
    const env = envWithR2(ctx, {
      async put(key) {
        return { key };
      }
    });
    failFirstImageInsert(env, () => new Error("Network connection lost."));

    await putImage(env, imageInput(), control);

    expect(await imageCount(ctx)).toBe(1);
  });

  it("accepts a unique conflict when the image row is already present", async () => {
    const env = envWithR2(ctx, {
      async put(key) {
        return { key };
      }
    });
    failFirstImageInsert(env, async (run) => {
      await run();
      throw new Error("UNIQUE constraint failed: image_objects.id");
    });

    await putImage(env, imageInput(), control);

    expect(await imageCount(ctx)).toBe(1);
  });
});

function imageInput() {
  return {
    ownerUserId: "usr_owner",
    bytes: new Uint8Array([1, 2, 3, 4]),
    mime: "image/png"
  };
}

function envWithR2(
  ctx: D1TestContext,
  bucket: {
    put: (
      key: string,
      bytes: Uint8Array,
      options: { onlyIf?: Headers }
    ) => Promise<{ key: string } | null>;
  }
): AppBindings {
  return {
    ...ctx.env,
    R2: {
      put: bucket.put,
      head: async () => null
    }
  } as unknown as AppBindings;
}

function onlyIf(options: { onlyIf?: Headers }) {
  const header = options.onlyIf?.get("If-None-Match");
  return `If-None-Match: ${JSON.stringify(header)}`;
}

async function imageCount(ctx: D1TestContext) {
  const rows = await getDb(ctx.env).select().from(imageObjects);
  return rows.length;
}

function failFirstImageInsert(
  env: AppBindings,
  fail: (run: () => Promise<unknown>) => Promise<unknown> | unknown
) {
  const db = env.DB;
  const prepare = db.prepare.bind(db);
  let failed = false;
  db.prepare = ((sql: string) => {
    const statement = prepare(sql);
    if (failed || !/insert\s+into\s+"?image_objects"?/i.test(sql)) return statement;
    return wrapInsert(statement, async (run) => {
      failed = true;
      await fail(run);
    });
  }) as typeof db.prepare;
}

function wrapInsert(
  statement: D1PreparedStatement,
  fail: (run: () => Promise<unknown>) => Promise<unknown>
): D1PreparedStatement {
  const wrap = (current: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(current, {
      get(target, property, receiver) {
        if (property === "bind") {
          return (...args: unknown[]) => wrap(target.bind(...(args as never[])));
        }
        if (property === "run") {
          return () => fail(() => target.run());
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  return wrap(statement);
}
