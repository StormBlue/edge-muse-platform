import { logError, logInfo, logWarn } from "../log";
import type { AppBindings } from "../../types";
import type { TaskEvent } from "./types";

/** 包装 `notify`：单次失败不影响主流程，但打 error 日志 */
export async function notifyTaskEvent(
  taskId: string,
  notify: (event: TaskEvent) => Promise<void>,
  event: TaskEvent
): Promise<void> {
  try {
    await notify(event);
    logInfo("task.notify.sent", { taskId, ...taskEventSummary(event) });
  } catch (error) {
    logError("task.notify_failed", error, { taskId, ...taskEventSummary(event) });
  }
}

/**
 * 将任务事件推送到「该 taskId 专属」Durable Object，由 `TaskRoom.updateStatus` 落 storage + 广播 WebSocket。
 */
export async function broadcastTaskEvent(
  env: AppBindings,
  taskId: string,
  event: TaskEvent
): Promise<void> {
  if (!env.TASK_ROOM) {
    logWarn("task.broadcast.skipped_no_room", { taskId, ...taskEventSummary(event) });
    return;
  }
  const id = env.TASK_ROOM.idFromName(taskId);
  const stub = env.TASK_ROOM.get(id);
  await stub.updateStatus(event);
  logInfo("task.broadcast.sent", { taskId, ...taskEventSummary(event) });
}

/** 缩减 WS 广播事件用于 `task.notify`/`broadcast` 旁路日志，避免贴全量图片对象 */
function taskEventSummary(event: TaskEvent): Record<string, unknown> {
  if (event.type === "task.image") {
    return {
      taskEvent: event.type,
      status: event.task.status,
      imageId: event.image.id,
      mime: event.image.mime,
      byteSize: event.image.byteSize
    };
  }
  if (event.type === "task.done") {
    return {
      taskEvent: event.type,
      status: event.task.status,
      imageCount: event.images.length,
      imageIds: event.images.map((image) => image.id)
    };
  }
  if (event.type === "task.failed") {
    return {
      taskEvent: event.type,
      status: event.task.status,
      code: event.error.code,
      message: event.error.message,
      imageCount: event.images?.length ?? 0,
      imageIds: event.images?.map((image) => image.id) ?? []
    };
  }
  return {
    taskEvent: event.type,
    status: event.task.status,
    progress: event.task.progress ?? null
  };
}
