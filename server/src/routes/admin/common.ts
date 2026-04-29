import type { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types";

export type AdminRouter = Hono<AppEnv>;

export const optionalEmailSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}, z.string().email().optional());

export const optionalProviderKeySchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}, z.string().min(1).optional());

export const usernameSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value.trim();
}, z.string().min(1).max(40));

export function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER
) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.floor(numeric), 1), max);
}
