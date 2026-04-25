import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import {
  broadcastTaskEvent,
  failGenerateTask,
  runGenerateTask,
  type TaskEvent
} from "../lib/tasks";
import { logError, logInfo } from "../lib/log";
import type { AppBindings } from "../types";

export type GenerateImageWorkflowParams = {
  taskId: string;
};

export class GenerateImageWorkflow extends WorkflowEntrypoint<
  AppBindings,
  GenerateImageWorkflowParams
> {
  async run(event: Readonly<WorkflowEvent<GenerateImageWorkflowParams>>, step: WorkflowStep) {
    const { taskId } = event.payload;
    const notify = (payload: TaskEvent) => broadcastTaskEvent(this.env, taskId, payload);
    logInfo("workflow.generate.started", { taskId });
    try {
      await step.do("generate-and-persist", async () => {
        logInfo("workflow.generate.step_started", { taskId, step: "generate-and-persist" });
        await runGenerateTask(this.env, taskId, notify);
        logInfo("workflow.generate.step_finished", { taskId, step: "generate-and-persist" });
        return { ok: true };
      });
      logInfo("workflow.generate.finished", { taskId });
    } catch (error) {
      logError("workflow.generate.failed", error, { taskId });
      await failGenerateTask(this.env, taskId, error, notify);
    }
  }
}
