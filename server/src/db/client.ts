/**
 * Drizzle + D1：单例工厂 per-request，通过 `env.DB` binding 访问。
 * `schema` 汇总表定义，便于 `db.query.users.findFirst` 等关系查询。
 */
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import type { AppBindings } from "../types";

/**
 * 获取带完整 `schema` 的 Drizzle 实例，用于 `db.query.*` 关系 API 与链式 `select`。
 * Worker 每请求可多次调用，底层 D1 由 `env.DB` 绑定；无进程级长连接需关闭。
 */
export function getDb(env: AppBindings) {
  return drizzle(env.DB, { schema });
}
