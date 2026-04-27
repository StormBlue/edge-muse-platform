/**
 * 参考图上传（图生图前置）：`POST /api/uploads`，`multipart/form-data`，字段名 **`files`**（可多选）。
 *
 * - 白名单 MIME、单文件 ≤10MB、最多 5 个文件；与 `generate` 里 `referenceImageIds` 上限一致。
 * - `putImage(..., isReference: true)`：写 R2 + D1 `image_objects`，若失败整段请求失败（不调部分成功）。
 * - 返回 `{ images }`：每项含 `id`，前端再随 `POST /generate` 传 `referenceImageIds`。
 */
import { Hono } from "hono";
import { appError } from "../lib/errors";
import { logInfo, logWarn } from "../lib/log";
import { putImage } from "../lib/r2";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

/** 与常见浏览器 `<input type="file" accept="image/*">` 交集；其它类型在服务端直接拒 */
const allowedMime = new Set(["image/png", "image/jpeg", "image/webp"]);
/** 单文件上限；与 Worker 请求体限制、R2 单对象策略一致 */
const maxFileSize = 10 * 1024 * 1024;

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.post("/uploads", requireAuth, async (c) => {
  const user = c.get("user");
  const form = await c.req.formData();
  // 多文件同名 `files`；非 File 字段（如空字符串）直接过滤
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
  // 顺序写入 R2 并建 image 元数据；单文件失败整请求失败（事务式体验）
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
