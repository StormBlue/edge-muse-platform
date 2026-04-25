import { DurableObject } from "cloudflare:workers";
import type { AppBindings } from "../types";
import { failTimedOutGenerateTaskIfNeeded, type TaskEvent } from "../lib/tasks";
import { logError, logInfo, logWarn } from "../lib/log";

export class TaskRoom extends DurableObject<AppBindings> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      logWarn("task.room.websocket_rejected", {
        reason: "missing_upgrade",
        path: new URL(request.url).pathname
      });
      return new Response("Expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const latest = await this.ctx.storage.get<TaskEvent>("latest");
    if (latest) server.send(JSON.stringify(latest));
    logInfo("task.room.websocket_connected", {
      path: new URL(request.url).pathname,
      latestEventType: latest?.type ?? null,
      latestTaskId: latest ? runningTaskId(latest) : null,
      socketCount: this.ctx.getWebSockets().length
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async updateStatus(event: TaskEvent): Promise<void> {
    await this.ctx.storage.put("latest", event);
    let delivered = 0;
    let failed = 0;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(JSON.stringify(event));
        delivered += 1;
      } catch {
        failed += 1;
        socket.close(1011, "send failed");
      }
    }
    logInfo("task.room.status_updated", {
      taskId: eventTaskId(event),
      taskEvent: event.type,
      delivered,
      failed,
      socketCount: this.ctx.getWebSockets().length
    });
    await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === "string" && message.includes("ping")) {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    }
  }

  async alarm(): Promise<void> {
    const latest = await this.ctx.storage.get<TaskEvent>("latest");
    const taskId = runningTaskId(latest);
    if (!taskId) {
      logInfo("task.room.alarm_no_running_task", { latestEventType: latest?.type ?? null });
      return;
    }
    logWarn("task.room.alarm_checking_task_timeout", { taskId });
    try {
      const result = await failTimedOutGenerateTaskIfNeeded(this.env, taskId, async (event) => {
        await this.updateStatus(event);
      });
      logInfo("task.room.alarm_timeout_check_finished", { taskId, result });
    } catch (error) {
      logError("task.room.alarm_timeout_check_failed", error, { taskId });
      throw error;
    }
  }
}

function eventTaskId(event: TaskEvent): string {
  return event.task.id;
}

function runningTaskId(event: TaskEvent | undefined): string | null {
  if (!event) return null;
  if (event.type === "task.update" && event.task.status === "running") return event.task.id;
  if (event.type === "task.image" && event.task.status === "running") return event.task.id;
  return null;
}
