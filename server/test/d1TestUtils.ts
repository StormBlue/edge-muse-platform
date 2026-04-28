/**
 * Miniflare D1 集成测试工具。
 *
 * 每个测试文件使用独立内存库并按 migrations 顺序建表，避免依赖本地 wrangler 状态。
 */
import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import type { AppBindings } from "../src/types";

export type D1TestContext = {
  env: AppBindings;
  dispose: () => Promise<void>;
};

export async function createD1TestContext(): Promise<D1TestContext> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: { DB: `test-${crypto.randomUUID()}` },
    d1Persist: false
  });
  const db = await mf.getD1Database("DB");
  try {
    await applyMigrations(db);
  } catch (error) {
    await mf.dispose();
    throw error;
  }
  return {
    env: { DB: db } as AppBindings,
    dispose: () => mf.dispose()
  };
}

async function applyMigrations(db: D1Database) {
  const migrationsDir = new URL("../migrations/", import.meta.url);
  const filenames = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  for (const filename of filenames) {
    const sql = await readFile(new URL(filename, migrationsDir), "utf8");
    for (const statement of splitSqlStatements(sql)) {
      await db.exec(statement);
    }
  }
}

function splitSqlStatements(sql: string) {
  return sql
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
