import type { Hono } from "hono";
import { z } from "zod";
import { MAX_SYSADMIN_IMAGE_COUNT } from "../../lib/generationPolicy";
import type { AppEnv } from "../../types";

export type SessionRouter = Hono<AppEnv>;

export const modeSchema = z.enum(["text2image", "image2image"]);

export function normalizeSessionMode(value: unknown) {
  return value === "text2image" ? "text2image" : "image2image";
}

/** 会话默认生图参数，整段 JSON 存 D1 `sessions.settings`。 */
export const settingsSchema = z.object({
  size: z.string().default("1024x1024"),
  n: z.number().int().min(1).max(MAX_SYSADMIN_IMAGE_COUNT).default(1),
  model: z.string().optional()
});

/** 历史/消息 JSON 里嵌套的附件形状，与前端 `ImageAttachment` 对齐。 */
export type HistoryImageAttachment = {
  id: string;
  url: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  byteSize: number;
  taskId?: string | null;
  sessionId?: string | null;
  messageId?: string | null;
  prompt?: string | null;
};

export type MessageReferenceImage = HistoryImageAttachment;

export type TaskParamsWithReferences = {
  referenceImageIds?: string[];
  [key: string]: unknown;
};
