/**
 * 每个 provider key group 一个队列调度器。
 *
 * D1 是事实源：queued/running 任务和 provider key slot 都从 tasks 表计算；
 * DO 只提供同 group 串行调度点，避免多个请求同时为同一 group 抢 key。
 */
import { DurableObject } from "cloudflare:workers";
import { logError, logInfo, logWarn } from "../lib/log";
import { startGenerateTask } from "../lib/tasks/dispatch";
import {
  assignQueuedTaskToProviderKey,
  getNextAvailableProviderKeySlot,
  getNextQueuedTaskForGroup
} from "../lib/tasks/scheduler";
import type { AppBindings } from "../types";

const QUEUE_ALARM_DELAY_MS = 5_000;
const DISPATCH_BATCH_LIMIT = 20;

export class GenerateQueue extends DurableObject<AppBindings> {
  async enqueue(taskId: string, groupId: string): Promise<void> {
    logInfo("task.queue.do_enqueue", { taskId: taskId || null, groupId });
    await this.ctx.storage.put("groupId", groupId);
    await this.dispatchAvailableTasks(groupId);
  }

  async release(taskId: string, groupId: string): Promise<void> {
    logInfo("task.queue.do_release", { taskId, groupId });
    await this.ctx.storage.put("groupId", groupId);
    await this.dispatchAvailableTasks(groupId);
  }

  async alarm(): Promise<void> {
    const groupId = await this.ctx.storage.get<string>("groupId");
    if (!groupId) return;
    await this.dispatchAvailableTasks(groupId);
  }

  private async dispatchAvailableTasks(groupId: string): Promise<void> {
    let dispatched = 0;

    for (let index = 0; index < DISPATCH_BATCH_LIMIT; index += 1) {
      const task = await getNextQueuedTaskForGroup(this.env, groupId);
      if (!task) break;
      const key = await getNextAvailableProviderKeySlot(this.env, groupId);
      if (!key) {
        await this.scheduleAlarm();
        logInfo("task.queue.group_full", { groupId });
        break;
      }
      const claimed = await assignQueuedTaskToProviderKey(this.env, {
        taskId: task.id,
        providerKeyId: key.providerKeyId
      });
      if (!claimed) {
        logWarn("task.queue.assign_skipped", {
          groupId,
          taskId: task.id,
          providerKeyId: key.providerKeyId
        });
        continue;
      }
      dispatched += 1;
      logInfo("task.queue.dispatched", {
        groupId,
        taskId: task.id,
        providerKeyId: key.providerKeyId,
        activeCount: key.activeCount,
        maxConcurrency: key.maxConcurrency
      });
      startGenerateTask(this.env, this.ctx, task.id);
    }

    if (dispatched > 0) await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    try {
      await this.ctx.storage.setAlarm(Date.now() + QUEUE_ALARM_DELAY_MS);
    } catch (error) {
      logError("task.queue.alarm_failed", error);
    }
  }
}

export const __test__ = {
  QUEUE_ALARM_DELAY_MS,
  DISPATCH_BATCH_LIMIT
};
