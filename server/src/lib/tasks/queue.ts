import { logInfo } from "../log";
import { startGenerateTask } from "./dispatch";
import { assignQueuedTaskToPlaceholderProviderKey } from "./scheduler";
import type { AppBindings } from "../../types";
import type { WaitUntilContext } from "./types";

function hasWaitUntil(ctx: unknown): ctx is WaitUntilContext {
  if (!ctx || typeof ctx !== "object") return false;
  return "waitUntil" in ctx && typeof (ctx as { waitUntil?: unknown }).waitUntil === "function";
}

/**
 * 任务入队门面。
 *
 * 有 provider key group 时交给 GenerateQueue Durable Object 串行调度；无 group 或未绑定 DO 时保留旧点火兜底。
 */
export function enqueueGenerateTask(
  env: AppBindings,
  ctx: WaitUntilContext | null | undefined,
  taskId: string
): void {
  logInfo("task.queue.enqueue_requested", { taskId });
  if (hasWaitUntil(ctx)) {
    ctx.waitUntil(enqueueGenerateTaskAsync(env, ctx, taskId));
    return;
  }
  logInfo("task.queue.dispatch_skipped_without_execution_context", { taskId });
}

export function enqueueGenerateTaskGroup(
  env: AppBindings,
  ctx: WaitUntilContext,
  providerKeyGroupId: string
): void {
  if (!env.GENERATE_QUEUE) return;
  logInfo("task.queue.group_wakeup_requested", { providerKeyGroupId });
  const id = env.GENERATE_QUEUE.idFromName(providerKeyGroupId);
  const stub = env.GENERATE_QUEUE.get(id);
  ctx.waitUntil(stub.enqueue("", providerKeyGroupId));
}

export function releaseGenerateTaskSlot(
  env: AppBindings,
  ctx: WaitUntilContext | null | undefined,
  input: { taskId: string; providerKeyGroupId?: string | null }
): void {
  if (!input.providerKeyGroupId || !env.GENERATE_QUEUE) return;
  logInfo("task.queue.release_requested", input);
  const id = env.GENERATE_QUEUE.idFromName(input.providerKeyGroupId);
  const stub = env.GENERATE_QUEUE.get(id);
  const release = stub.release(input.taskId, input.providerKeyGroupId);
  if (hasWaitUntil(ctx)) {
    ctx.waitUntil(release);
    return;
  }
  logInfo("task.queue.release_skipped_without_execution_context", input);
}

export async function releaseGenerateTaskSlotNow(
  env: AppBindings,
  input: { taskId: string; providerKeyGroupId?: string | null }
): Promise<void> {
  if (!input.providerKeyGroupId || !env.GENERATE_QUEUE) return;
  logInfo("task.queue.release_requested", input);
  const id = env.GENERATE_QUEUE.idFromName(input.providerKeyGroupId);
  const stub = env.GENERATE_QUEUE.get(id);
  await stub.release(input.taskId, input.providerKeyGroupId);
}

async function enqueueGenerateTaskAsync(
  env: AppBindings,
  ctx: WaitUntilContext,
  taskId: string
): Promise<void> {
  const row = await env.DB.prepare("SELECT provider_key_group_id FROM tasks WHERE id = ?1")
    .bind(taskId)
    .first<{ provider_key_group_id: string | null }>();
  if (!row?.provider_key_group_id || !env.GENERATE_QUEUE) {
    const claimed = await assignQueuedTaskToPlaceholderProviderKey(env, { taskId });
    logInfo("task.queue.inline_fallback", {
      taskId,
      queueConfigured: Boolean(env.GENERATE_QUEUE),
      providerKeyGroupId: row?.provider_key_group_id ?? null,
      claimed
    });
    if (!claimed) return;
    startGenerateTask(env, ctx, taskId);
    return;
  }
  const id = env.GENERATE_QUEUE.idFromName(row.provider_key_group_id);
  const stub = env.GENERATE_QUEUE.get(id);
  await stub.enqueue(taskId, row.provider_key_group_id);
}
