import { createMiddleware } from "hono/factory";
import { appError } from "../lib/errors";
import type { AppEnv } from "../types";

export function rateLimit(options: { prefix: string; limit: number; windowSeconds: number }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "local";
    const user = c.get("user");
    const identity = user?.id ?? `${ip}:${c.req.header("User-Agent") ?? "ua"}`;
    const slot = Math.floor(Date.now() / (options.windowSeconds * 1000));
    const key = `rl:${options.prefix}:${identity}:${slot}`;
    const current = Number((await c.env.KV.get(key)) ?? "0");
    if (current >= options.limit) throw appError("RATE_LIMITED", "Too many requests");
    await c.env.KV.put(key, String(current + 1), { expirationTtl: options.windowSeconds + 5 });
    return next();
  });
}
