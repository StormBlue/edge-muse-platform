import { DurableObject } from "cloudflare:workers";
import type { AppBindings } from "../types";
import { runGenerateTask, type TaskEvent } from "../lib/tasks";

export class TaskRoom extends DurableObject<AppBindings> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const latest = await this.ctx.storage.get<TaskEvent>("latest");
    if (latest) server.send(JSON.stringify(latest));
    return new Response(null, { status: 101, webSocket: client });
  }

  async updateStatus(event: TaskEvent): Promise<void> {
    await this.ctx.storage.put("latest", event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(JSON.stringify(event));
      } catch {
        socket.close(1011, "send failed");
      }
    }
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
    if (!taskId) return;
    await runGenerateTask(this.env, taskId, async (event) => {
      await this.updateStatus(event);
    });
  }
}

function runningTaskId(event: TaskEvent | undefined): string | null {
  if (!event) return null;
  if (event.type === "task.update" && event.task.status === "running") return event.task.id;
  if (event.type === "task.image" && event.task.status === "running") return event.task.id;
  return null;
}
