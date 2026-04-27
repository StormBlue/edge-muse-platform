/**
 * 基于 KV 的**固定窗口**计数限流（非滑窗精算，实现简单）：
 * - 键：`rl:{prefix}:{identity}:{slot}`，其中 `slot = floor(时间/窗口秒)`，换槽即新计数窗口；
 * - `identity`：已登录用 `user.id`，否则用 `IP:UA` 防匿名刷；
 * - `expirationTtl = windowSeconds + 5`：略大于窗口，避免键长期堆积；dev 环境整段跳过。
 */
import { createMiddleware } from "hono/factory";
import { appError } from "../lib/errors";
import type { AppContext, AppEnv } from "../types";

type RateLimitOptions = {
  /** 区分业务：如 generate、login，避免共用一个键 */
  prefix: string;
  limit: number;
  windowSeconds: number;
};

/** 可被单测或路由直接调用，与 `rateLimit()` 中间件共用一套计数逻辑 */
export async function consumeRateLimit(c: AppContext, options: RateLimitOptions) {
  if (c.env.ENVIRONMENT === "dev") {
    return;
  }
  const ip = c.req.header("CF-Connecting-IP") ?? "local";
  const user = c.get("user");
  const identity = user?.id ?? `${ip}:${c.req.header("User-Agent") ?? "ua"}`;
  const slot = Math.floor(Date.now() / (options.windowSeconds * 1000));
  const key = `rl:${options.prefix}:${identity}:${slot}`;
  const current = Number((await c.env.KV.get(key)) ?? "0");
  if (current >= options.limit) throw appError("RATE_LIMITED", "Too many requests");
  // 自增后覆写，TTL 保证 KV 键自动回收
  await c.env.KV.put(key, String(current + 1), { expirationTtl: options.windowSeconds + 5 });
}

/** 返回「先计次再 next」的 Hono 中间件，便于 per-route 配置不同 limit */
export function rateLimit(options: RateLimitOptions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    await consumeRateLimit(c, options);
    return next();
  });
}
