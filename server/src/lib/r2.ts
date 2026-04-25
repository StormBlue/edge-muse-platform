import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { imageObjects } from "../db/schema";
import { appError } from "./errors";
import { newId, now } from "./id";
import { sha256Hex } from "./crypto";
import type { AppBindings, AuthUser, ImageAttachment } from "../types";

export function buildImageKey(userId: string, imageId: string, mime: string): string {
  const date = new Date();
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("svg") ? "svg" : "png";
  return `u/${userId}/y/${date.getUTCFullYear()}/m/${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}/${imageId}.${ext}`;
}

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
  const duplicate = await db.query.imageObjects.findFirst({
    where: and(eq(imageObjects.sha256, sha), isNull(imageObjects.deletedAt))
  });
  if (duplicate && duplicate.ownerUserId === input.ownerUserId) {
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

  const imageId = newId("img");
  const r2Key = buildImageKey(input.ownerUserId, imageId, input.mime);
  await env.R2.put(r2Key, input.bytes, {
    httpMetadata: { contentType: input.mime },
    customMetadata: { sha256: sha }
  });
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

export async function assertImageAccess(env: AppBindings, imageId: string, user: AuthUser) {
  const image = await getDb(env).query.imageObjects.findFirst({
    where: and(eq(imageObjects.id, imageId), isNull(imageObjects.deletedAt))
  });
  if (!image) throw appError("NOT_FOUND", "Image not found");
  if (user.role !== "sysadmin" && image.ownerUserId !== user.id) {
    throw appError("FORBIDDEN", "No access to image");
  }
  return image;
}
