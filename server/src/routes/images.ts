import { Hono } from "hono";
import { assertImageAccess } from "../lib/r2";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const imageRoutes = new Hono<AppEnv>();

imageRoutes.get("/i/:id", requireAuth, async (c) => {
  const image = await assertImageAccess(c.env, c.req.param("id"), c.get("user"));
  const defaultCache = (caches as CacheStorage & { default: Cache }).default;
  const cacheKey = new Request(c.req.url, {
    headers: { Authorization: c.req.header("Authorization") ?? c.req.header("Cookie") ?? "" }
  });
  const cached = await defaultCache.match(cacheKey);
  if (cached) return cached;
  const object = await c.env.R2.get(image.r2Key);
  if (!object)
    return c.json({ error: { code: "NOT_FOUND", message: "Image object missing" } }, 404);
  const response = new Response(object.body, {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, max-age=300",
      Vary: "Authorization, Cookie"
    }
  });
  c.executionCtx.waitUntil(defaultCache.put(cacheKey, response.clone()));
  return response;
});
