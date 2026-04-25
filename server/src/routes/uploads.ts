import { Hono } from "hono";
import { appError } from "../lib/errors";
import { logInfo, logWarn } from "../lib/log";
import { putImage } from "../lib/r2";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const allowedMime = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxFileSize = 10 * 1024 * 1024;

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.post("/uploads", requireAuth, async (c) => {
  const user = c.get("user");
  const form = await c.req.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  logInfo("upload.request.received", {
    traceId: c.get("traceId"),
    userId: user.id,
    fileCount: files.length
  });
  if (files.length === 0) {
    logWarn("upload.request.rejected", {
      traceId: c.get("traceId"),
      userId: user.id,
      reason: "no_files"
    });
    throw appError("VALIDATION_ERROR", "No files uploaded");
  }
  if (files.length > 5) {
    logWarn("upload.request.rejected", {
      traceId: c.get("traceId"),
      userId: user.id,
      reason: "too_many_files",
      fileCount: files.length
    });
    throw appError("VALIDATION_ERROR", "At most 5 files");
  }
  const images = [];
  for (const [index, file] of files.entries()) {
    const fileFields = {
      traceId: c.get("traceId"),
      userId: user.id,
      fileIndex: index,
      name: file.name,
      mime: file.type,
      size: file.size
    };
    logInfo("upload.file.accepted_for_validation", fileFields);
    if (!allowedMime.has(file.type)) {
      logWarn("upload.file.rejected", { ...fileFields, reason: "unsupported_mime" });
      throw appError("VALIDATION_ERROR", "Unsupported image type");
    }
    if (file.size > maxFileSize) {
      logWarn("upload.file.rejected", { ...fileFields, reason: "too_large" });
      throw appError("PAYLOAD_TOO_LARGE", "Image exceeds 10MB");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = await putImage(c.env, {
      ownerUserId: user.id,
      bytes,
      mime: file.type,
      isReference: true
    });
    logInfo("upload.file.stored", {
      ...fileFields,
      imageId: image.id,
      byteSize: image.byteSize
    });
    images.push(image);
  }
  logInfo("upload.request.finished", {
    traceId: c.get("traceId"),
    userId: user.id,
    imageCount: images.length,
    imageIds: images.map((image) => image.id)
  });
  return c.json({ images }, 201);
});
