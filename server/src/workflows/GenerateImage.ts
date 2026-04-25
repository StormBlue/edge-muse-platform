import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { runGenerateTask, type TaskEvent } from "../lib/tasks";
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
    await step.do(
      "generate-and-persist",
      { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" } },
      async () => {
        await runGenerateTask(this.env, taskId, async (payload: TaskEvent) => {
          if (!this.env.TASK_ROOM) return;
          const id = this.env.TASK_ROOM.idFromName(taskId);
          const stub = this.env.TASK_ROOM.get(id);
          await stub.updateStatus(payload);
        });
        return { ok: true };
      }
    );
  }
}
