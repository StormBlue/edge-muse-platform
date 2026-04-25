import { Hono } from "hono";
import { appError } from "../lib/errors";
import { putImage } from "../lib/r2";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const allowedMime = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxFileSize = 10 * 1024 * 1024;

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.post("/uploads", requireAuth, async (c) => {
  const form = await c.req.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) throw appError("VALIDATION_ERROR", "No files uploaded");
  if (files.length > 5) throw appError("VALIDATION_ERROR", "At most 5 files");
  const images = [];
  for (const file of files) {
    if (!allowedMime.has(file.type)) throw appError("VALIDATION_ERROR", "Unsupported image type");
    if (file.size > maxFileSize) throw appError("PAYLOAD_TOO_LARGE", "Image exceeds 10MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    images.push(
      await putImage(c.env, {
        ownerUserId: c.get("user").id,
        bytes,
        mime: file.type,
        isReference: true
      })
    );
  }
  return c.json({ images }, 201);
});
