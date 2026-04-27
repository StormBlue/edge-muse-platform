import { logError, logInfo, logWarn } from "../log";
import { broadcastTaskEvent } from "./events";
import { runGenerateTask } from "./run";
import type { AppBindings } from "../../types";
import type { WaitUntilContext } from "./types";

/**
 * 从 HTTP 202 路径「点火」：不阻塞响应。
 * - 有 `GEN_WORKFLOW`：`waitUntil` 里 `startWorkflowGenerateTask`，失败则打日志并 **inline** `runGenerateTask`。
 * - 无 Workflow：直接 `waitUntil(runGenerateTask)`，便于本地/测试环境。
 */
export function startGenerateTask(env: AppBindings, ctx: WaitUntilContext, taskId: string): void {
  const workflow = env.GEN_WORKFLOW;
  logInfo("task.dispatch.requested", { taskId, workflowConfigured: Boolean(workflow) });
  if (workflow && typeof workflow.create === "function") {
    ctx.waitUntil(
      startWorkflowGenerateTask(env, taskId).catch((error) => {
        logError("task.workflow_start_failed", error, { taskId });
        logWarn("task.dispatch.fallback_inline", { taskId });
        return runGenerateTask(env, taskId, (event) => broadcastTaskEvent(env, taskId, event));
      })
    );
    return;
  }
  logInfo("task.dispatch.inline", { taskId });
  ctx.waitUntil(runGenerateTask(env, taskId, (event) => broadcastTaskEvent(env, taskId, event)));
}

/**
 * 创建或复用 Workflow 实例：pause 则 resume；终态则 restart。失败抛给 `startGenerateTask` 的 catch 走内联执行。
 */
async function startWorkflowGenerateTask(env: AppBindings, taskId: string): Promise<void> {
  const workflow = env.GEN_WORKFLOW;
  if (!workflow) return;
  try {
    logInfo("task.workflow_create.started", { taskId });
    await workflow.create({ id: taskId, params: { taskId } });
    logInfo("task.workflow_create.succeeded", { taskId });
    return;
  } catch (error) {
    logWarn("task.workflow_create.needs_existing_instance", {
      taskId,
      message: error instanceof Error ? error.message : "Workflow create failed"
    });
    const instance = await workflow.get(taskId);
    const status = await instance.status();
    logInfo("task.workflow_existing.status", { taskId, status: status.status });
    if (status.status === "paused") {
      await instance.resume();
      logInfo("task.workflow_existing.resumed", { taskId });
      return;
    }
    if (["errored", "terminated", "complete", "unknown"].includes(status.status)) {
      await instance.restart();
      logInfo("task.workflow_existing.restarted", { taskId, previousStatus: status.status });
    }
  }
}
