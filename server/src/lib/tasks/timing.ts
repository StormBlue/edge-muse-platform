import { logWarn } from "../log";

/** 超过 2 分钟打 warn，便于观测慢厂商或网络 */
export function logSlowTask(taskId: string, startedAt: number, finishedAt: number): void {
  const durationMs = finishedAt - startedAt;
  if (durationMs <= 120_000) return;
  logWarn("task.slow", { taskId, durationMs });
}
