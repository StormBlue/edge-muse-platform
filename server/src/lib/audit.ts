/**
 * 审计落库：关键写操作（登录、改配额、建任务等）写 `audit_logs`，payload 为 JSON 文本。
 */
import { auditLogs } from "../db/schema";
import { getDb } from "../db/client";
import { newId, now } from "./id";
import { stringifyJson } from "./json";
import type { AppBindings } from "../types";

export async function audit(
  env: AppBindings,
  input: {
    actorId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    payload?: unknown;
    ip?: string | null;
  }
): Promise<void> {
  await getDb(env)
    .insert(auditLogs)
    .values({
      id: newId("aud"),
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      payload: stringifyJson(input.payload ?? {}),
      ip: input.ip ?? null,
      createdAt: now()
    });
}
