/**
 * 私有 R2 对象与 `image_objects` 元数据：上传走 `putImage`；读走 `routes/images` 代理并在 `assertImageAccess` 鉴权。
 * 同用户下非参考图按 sha256 去重可复用行（省存储）。
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { imageObjects } from "../db/schema";
import {
  bindingErrorLog,
  defaultBindingSleep,
  isImageRowConflict,
  isRetryableD1WriteError,
  isTransientBindingDisconnect,
  TRANSIENT_BINDING_ATTEMPTS,
  transientBindingRetryDelayMs
} from "./bindingRetry";
import { appError } from "./errors";
import { logInfo, logWarn } from "./log";
import { newId, now } from "./id";
import { sha256Hex } from "./crypto";
import type { AppBindings, AuthUser, ImageAttachment } from "../types";

export type ImagePersistControl = {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

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
  },
  control: ImagePersistControl = {}
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
  const storedFields = { ...baseFields, imageId, r2Key };
  logInfo("image.r2.put_started", storedFields);
  await putNewR2Object(env, r2Key, input, sha, storedFields, control);
  await insertImageRow(
    env,
    {
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
    },
    storedFields,
    control
  );
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
 * 同一个新 key 上重试 `R2.put`。每次都带 `If-None-Match: *`：
 * 断连前已经提交时，下一次返回 null，不再写第二份。
 * https://developers.cloudflare.com/r2/reference/consistency/
 */
async function putNewR2Object(
  env: AppBindings,
  r2Key: string,
  input: { bytes: Uint8Array; mime: string },
  sha: string,
  fields: Record<string, unknown>,
  control: ImagePersistControl
): Promise<void> {
  const sleep = control.sleep ?? defaultBindingSleep;
  for (let attempt = 1; attempt <= TRANSIENT_BINDING_ATTEMPTS; attempt += 1) {
    try {
      const stored = await env.R2.put(r2Key, input.bytes, {
        httpMetadata: { contentType: input.mime },
        customMetadata: { sha256: sha },
        onlyIf: new Headers({ "If-None-Match": "*" })
      });
      if (stored) {
        logInfo("image.r2.put_succeeded", fields);
        return;
      }
      const existing = await env.R2.head(r2Key);
      if (!existing) {
        throw new Error("R2 put precondition failed and object is absent");
      }
      logInfo("image.r2.put_already_present", fields);
      return;
    } catch (error) {
      if (attempt >= TRANSIENT_BINDING_ATTEMPTS || !isTransientBindingDisconnect(error))
        throw error;
      const delayMs = transientBindingRetryDelayMs(attempt, control.random);
      logWarn("image.r2.put_retry", {
        ...fields,
        attempt,
        delayMs,
        error: bindingErrorLog(error)
      });
      await sleep(delayMs);
    }
  }
}

/** 同一行重试 D1 插入。断连后若行已在，唯一约束冲突视为成功。 */
async function insertImageRow(
  env: AppBindings,
  row: typeof imageObjects.$inferInsert,
  fields: Record<string, unknown>,
  control: ImagePersistControl
): Promise<void> {
  const db = getDb(env);
  const sleep = control.sleep ?? defaultBindingSleep;
  for (let attempt = 1; attempt <= TRANSIENT_BINDING_ATTEMPTS; attempt += 1) {
    try {
      await db.insert(imageObjects).values(row);
      logInfo("image.db.inserted", fields);
      return;
    } catch (error) {
      if (isImageRowConflict(error)) {
        const existing = await db.query.imageObjects.findFirst({
          where: eq(imageObjects.id, row.id)
        });
        if (existing) {
          logInfo("image.db.insert_already_present", fields);
          return;
        }
      }
      if (attempt >= TRANSIENT_BINDING_ATTEMPTS || !isRetryableD1WriteError(error)) throw error;
      const delayMs = transientBindingRetryDelayMs(attempt, control.random);
      logWarn("image.db.insert_retry", {
        ...fields,
        attempt,
        delayMs,
        error: bindingErrorLog(error)
      });
      await sleep(delayMs);
    }
  }
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
