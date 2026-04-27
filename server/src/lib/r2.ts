/**
 * 私有 R2 对象与 `image_objects` 元数据：上传走 `putImage`；读走 `routes/images` 代理并在 `assertImageAccess` 鉴权。
 * 同用户下非参考图按 sha256 去重可复用行（省存储）。
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { imageObjects } from "../db/schema";
import { appError } from "./errors";
import { logInfo, logWarn } from "./log";
import { newId, now } from "./id";
import { sha256Hex } from "./crypto";
import type { AppBindings, AuthUser, ImageAttachment } from "../types";

/**
 * 生成分层 R2 对象键：`u/{userId}/y/年/m/月/{imageId}.ext`。
 * 按用户与时间前缀便于运维按前缀列举、批量删或生命周期策略；`ext` 与 MIME 简映射（webp 等可再扩）。
 */
export function buildImageKey(userId: string, imageId: string, mime: string): string {
  const date = new Date();
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("svg") ? "svg" : "png";
  return `u/${userId}/y/${date.getUTCFullYear()}/m/${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}/${imageId}.${ext}`;
}

/**
 * 写 R2 并插入元数据行；返回前端可用的 `ImageAttachment`（url 为相对 /api/i/:id）。
 */
export async function putImage(
  env: AppBindings,
  input: {
    ownerUserId: string;
    sessionId?: string | null;
    taskId?: string | null;
    bytes: Uint8Array;
    mime: string;
    isReference?: boolean;
  }
): Promise<ImageAttachment> {
  const db = getDb(env);
  const sha = await sha256Hex(input.bytes);
  const baseFields = {
    ownerUserId: input.ownerUserId,
    sessionId: input.sessionId ?? null,
    taskId: input.taskId ?? null,
    mime: input.mime,
    byteSize: input.bytes.byteLength,
    isReference: input.isReference ?? false,
    sha256: sha
  };
  logInfo("image.put.started", baseFields);
  // 参考图/已关联 session 或任务的不去重，避免多会话引用同一张被错误合并
  if (!input.isReference && !input.taskId && !input.sessionId) {
    const duplicate = await db.query.imageObjects.findFirst({
      where: and(eq(imageObjects.sha256, sha), isNull(imageObjects.deletedAt))
    });
    if (duplicate && duplicate.ownerUserId === input.ownerUserId) {
      logInfo("image.put.deduplicated", {
        ...baseFields,
        imageId: duplicate.id,
        duplicateTaskId: duplicate.taskId ?? null,
        duplicateSessionId: duplicate.sessionId ?? null
      });
      return {
        id: duplicate.id,
        url: `/api/i/${duplicate.id}`,
        mime: duplicate.mime,
        width: duplicate.width,
        height: duplicate.height,
        byteSize: duplicate.byteSize,
        taskId: input.taskId ?? duplicate.taskId,
        sessionId: input.sessionId ?? duplicate.sessionId
      };
    }
  }

  const imageId = newId("img");
  const r2Key = buildImageKey(input.ownerUserId, imageId, input.mime);
  logInfo("image.r2.put_started", { ...baseFields, imageId, r2Key });
  // 新对象必写 R2；customMetadata 存 sha 便于桶侧对账
  await env.R2.put(r2Key, input.bytes, {
    httpMetadata: { contentType: input.mime },
    customMetadata: { sha256: sha }
  });
  logInfo("image.r2.put_succeeded", { ...baseFields, imageId, r2Key });
  await db.insert(imageObjects).values({
    id: imageId,
    taskId: input.taskId ?? null,
    sessionId: input.sessionId ?? null,
    ownerUserId: input.ownerUserId,
    r2Key,
    mime: input.mime,
    width: null,
    height: null,
    byteSize: input.bytes.byteLength,
    sha256: sha,
    isReference: input.isReference ?? false,
    createdAt: now(),
    deletedAt: null
  });
  logInfo("image.db.inserted", { ...baseFields, imageId, r2Key });
  return {
    id: imageId,
    url: `/api/i/${imageId}`,
    mime: input.mime,
    width: null,
    height: null,
    byteSize: input.bytes.byteLength,
    taskId: input.taskId ?? null,
    sessionId: input.sessionId ?? null
  };
}

/**
 * 读图前鉴权：属主与当前用户相同，或**系统管理员**可看任意；`deletedAt` 非空等同不存在。
 */
export async function assertImageAccess(env: AppBindings, imageId: string, user: AuthUser) {
  const image = await getDb(env).query.imageObjects.findFirst({
    where: and(eq(imageObjects.id, imageId), isNull(imageObjects.deletedAt))
  });
  if (!image) {
    logWarn("image.access.not_found", { imageId, userId: user.id, role: user.role });
    throw appError("NOT_FOUND", "Image not found");
  }
  if (user.role !== "sysadmin" && image.ownerUserId !== user.id) {
    logWarn("image.access.forbidden", {
      imageId,
      ownerUserId: image.ownerUserId,
      userId: user.id,
      role: user.role
    });
    throw appError("FORBIDDEN", "No access to image");
  }
  logInfo("image.access.allowed", {
    imageId,
    ownerUserId: image.ownerUserId,
    userId: user.id,
    role: user.role,
    taskId: image.taskId ?? null,
    sessionId: image.sessionId ?? null,
    mime: image.mime,
    byteSize: image.byteSize
  });
  return image;
}
