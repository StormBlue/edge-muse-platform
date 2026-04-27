/**
 * 私有图片代理：R2 桶**不**对公网，仅 Worker 经 binding 读取。
 * GET /api/i/:id — 经 `assertImageAccess` 校验「当前用户是否拥有/有权查看该 image_object」后 `R2.get` 返回流。
 * 与前端 `<img src="/api/i/...">` 及 Message.attachments[].url 一致。
 *
 * 读图时序（符号）：
 *   浏览器 --GET /api/i/:imageId (Cookie)--> Worker
 *     → assertImageAccess(D1) → R2.get(r2Key) → Response(stream)
 *
 * 鉴权：`assertImageAccess` 校验 `owner_user_id` 本会话/任务归属，防猜 id 越权读他人 R2 对象。
 * 缓存：`Cache-Control: private` + `Vary: Authorization, Cookie`，避免共享 CDN 把 A 用户图缓给 B。
 */
import { Hono } from "hono";
import { logInfo, logWarn } from "../lib/log";
import { assertImageAccess } from "../lib/r2";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const imageRoutes = new Hono<AppEnv>();

/** GET /api/i/:id：流式回源，不将整个对象读入内存（依赖 R2 返回的 ReadableStream） */
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
  // D1 有元数据但 R2 对象缺失（手工删桶、迁移不同步）：显式 404，避免 Chrome 把空响应当损坏图
  if (!object) {
    logWarn("image.proxy.r2_missing", {
      traceId: c.get("traceId"),
      imageId,
      userId: user.id,
      r2Key: image.r2Key
    });
    return c.json({ error: { code: "NOT_FOUND", message: "Image object missing" } }, 404);
  }
  // 私有缓存：多用户同 URL 时不得共享；Vary 提醒 CDN/代理按鉴权键区分
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
