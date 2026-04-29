/**
 * Cloudflare Workflows 入口：把「可能超过单次 Worker 子请求时限」的生图 + 落库包进 Workflow step。
 *
 * 为何需要 Workflow？
 * - 第三方 gpt-image-2 可能 30–120s+；Worker 内同步 await 长 fetch 易触发平台限制，且进程中断需可恢复。
 * - 额度按任务预扣，Workflow step 显式关闭平台自动重试；失败后只允许用户手动 retry 新建任务。
 *
 * 与内联 `runGenerateTask` 关系：
 * - `startGenerateTask` 优先 `GEN_WORKFLOW.create`；若 Workflow 未配置或启动失败，会 **fallback** 到内联 `waitUntil(runGenerateTask)`（见 lib/tasks.ts）。
 *
 * 时序（符号）：
 *   startGenerateTask
 *     → workflow.create({ id: taskId, params: { taskId } })
 *     → 本类.run
 *       → step.do("generate-and-persist") → runGenerateTask(..., notify)
 *         → notify 即 broadcastTaskEvent → TaskRoom WebSocket
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import {
  broadcastTaskEvent,
  failGenerateTask,
  runGenerateTask,
  type TaskEvent
} from "../lib/tasks";
import { logError, logInfo } from "../lib/log";
import { GENERATE_WORKFLOW_STEP_CONFIG } from "../lib/tasks/workflowConfig";
import type { AppBindings } from "../types";

/** 工作流入参：与 D1 中 `tasks.id` 一致，用于重试与幂等 */
export type GenerateImageWorkflowParams = {
  taskId: string;
};

export class GenerateImageWorkflow extends WorkflowEntrypoint<
  AppBindings,
  GenerateImageWorkflowParams
> {
  /**
   * 单 step 包裹整段生图：成功则只打日志；任一步抛错由 `failGenerateTask` 写失败态并推 WS。
   * `step.do` 名固定便于控制面板与日志关联。
   */
  async run(event: Readonly<WorkflowEvent<GenerateImageWorkflowParams>>, step: WorkflowStep) {
    const { taskId } = event.payload;
    /** 任务事件统一下发到 per-task Durable Object，由 DO 推给所有 WS 客户端 */
    const notify = (payload: TaskEvent) => broadcastTaskEvent(this.env, taskId, payload);
    logInfo("workflow.generate.started", { taskId });
    try {
      const result = await step.do(
        "generate-and-persist",
        GENERATE_WORKFLOW_STEP_CONFIG,
        async () => {
          try {
            logInfo("workflow.generate.step_started", { taskId, step: "generate-and-persist" });
            await runGenerateTask(this.env, taskId, notify);
            logInfo("workflow.generate.step_finished", { taskId, step: "generate-and-persist" });
            return { ok: true as const };
          } catch (error) {
            logError("workflow.generate.step_failed", error, { taskId });
            return { ok: false as const, error: serializeWorkflowStepError(error) };
          }
        }
      );
      if (!result.ok) {
        const error = workflowStepError(result.error);
        logError("workflow.generate.failed", error, { taskId });
        await failGenerateTask(this.env, taskId, error, notify);
        return;
      }
      logInfo("workflow.generate.finished", { taskId });
    } catch (error) {
      logError("workflow.generate.failed", error, { taskId });
      await failGenerateTask(this.env, taskId, error, notify);
    }
  }
}

type SerializedWorkflowStepError = {
  name: string;
  message: string;
  code?: string;
};

function serializeWorkflowStepError(error: unknown): SerializedWorkflowStepError {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : "Generation failed",
    ...(error && typeof error === "object" && "code" in error ? { code: String(error.code) } : {})
  };
}

function workflowStepError(serialized: SerializedWorkflowStepError): Error & { code?: string } {
  const error = new Error(serialized.message) as Error & { code?: string };
  error.name = serialized.name;
  if (serialized.code) error.code = serialized.code;
  return error;
}
