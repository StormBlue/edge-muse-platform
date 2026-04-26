import { Hono } from "hono";
import { logInfo, logWarn } from "../lib/log";
import { assertImageAccess } from "../lib/r2";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const imageRoutes = new Hono<AppEnv>();

imageRoutes.get("/i/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const imageId = c.req.param("id");
  logInfo("image.proxy.requested", {
    traceId: c.get("traceId"),
    imageId,
    userId: user.id
  });
  const image = await assertImageAccess(c.env, imageId, user);
  logInfo("image.proxy.r2_get_started", {
    traceId: c.get("traceId"),
    imageId,
    userId: user.id,
    r2Key: image.r2Key
  });
  const object = await c.env.R2.get(image.r2Key);
  if (!object) {
    logWarn("image.proxy.r2_missing", {
      traceId: c.get("traceId"),
      imageId,
      userId: user.id,
      r2Key: image.r2Key
    });
    return c.json({ error: { code: "NOT_FOUND", message: "Image object missing" } }, 404);
  }
  const response = new Response(object.body, {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, max-age=300",
      Vary: "Authorization, Cookie"
    }
  });
  logInfo("image.proxy.served", {
    traceId: c.get("traceId"),
    imageId,
    userId: user.id,
    taskId: image.taskId ?? null,
    sessionId: image.sessionId ?? null,
    mime: image.mime,
    byteSize: image.byteSize
  });
  return response;
});
