import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import {
  broadcastTaskEvent,
  failGenerateTask,
  runGenerateTask,
  type TaskEvent
} from "../lib/tasks";
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
    try {
      await step.do(
        "generate-and-persist",
        { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" } },
        async () => {
          await runGenerateTask(this.env, taskId, notify, { retryable: true });
          return { ok: true };
        }
      );
    } catch (error) {
      await failGenerateTask(this.env, taskId, error, notify);
    }
  }
}
