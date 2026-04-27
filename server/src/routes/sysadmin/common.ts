import type { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types";

export type SysadminRouter = Hono<AppEnv>;

/** 巡查接口返回的附件形状：比前台多生成耗时、第几张等排障字段。 */
export type AuditImageAttachment = {
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
  createdAt?: number | null;
  generationDurationMs?: number | null;
  generationIndex?: number | null;
};

export type AuditReferenceImage = AuditImageAttachment;

/** 多图部分失败时聚合到消息 task 上，便于 sysadmin 排查具体第几张失败。 */
export type AuditGenerationFailure = {
  index: number;
  code: string;
  message: string;
  phase?: string | null;
  createdAt?: number | null;
};

export type TaskParamsWithReferences = {
  referenceImageIds?: string[];
  [key: string]: unknown;
};

export const optionalEmailSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}, z.string().email().optional());

export const usernameSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value.trim();
}, z.string().min(1).max(40));

/** 偏好 key 可清空；非空时必须是当前产品允许分配的 provider key。 */
export const optionalPreferredProviderKeySchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}, z.string().min(1).nullable());

/** 迁移期兼容：运行时 `PRAGMA table_info` 判断列是否存在，再拼动态 SQL。 */
export async function hasColumn(
  env: Cloudflare.Env,
  table: string,
  column: string
): Promise<boolean> {
  const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return rows.results.some((row) => row.name === column);
}
