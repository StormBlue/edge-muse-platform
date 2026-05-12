/**
 * 每任务一个 Durable Object 实例：WebSocket 房间 + **最后一次任务事件** 缓存。
 *
 * 职责：
 * - `fetch`：处理 WebSocket 升级；`acceptWebSocket` 启用 Hibernation，空闲少计费（见 Cloudflare 文档）。
 * - 新连接建立后立刻发送 `storage` 中保存的 `latest` 事件，避免「连上时任务已跑过半」的客户端看不到进度。
 * - `updateStatus`：由 `broadcastTaskEvent` 通过 DO stub RPC 调用（见 lib/tasks）— 推送给所有连接并覆盖 latest。
 * - `alarm`：10 分钟粒度兜底，对长时间无心跳的 running 任务尝试超时收尾（`failTimedOutGenerateTaskIfNeeded`）。
 *
 * 推送时序（符号）：
 *   runGenerateTask / failGenerateTask
 *     → broadcastTaskEvent(env, taskId, event)
 *     → stub = TASK_ROOM.get(idFromName(taskId))
 *     → stub.updateStatus(event)
 *       → storage.put("latest", event)
 *       → 对每个 getWebSockets() send(JSON)
 */
import { DurableObject } from "cloudflare:workers";
import type { AppBindings } from "../types";
import { failTimedOutGenerateTaskIfNeeded, type TaskEvent } from "../lib/tasks";
import { logError, logInfo, logWarn } from "../lib/log";

export class TaskRoom extends DurableObject<AppBindings> {
  async consumeCaptchaReplayKey(expiresAt: number): Promise<boolean> {
    const existing = await this.ctx.storage.get<number>("captchaReplayExpiresAt");
    if (existing) {
      logWarn("captcha.altcha_replay_detected");
      return false;
    }
    await this.ctx.storage.put("captchaReplayExpiresAt", expiresAt);
    await this.ctx.storage.setAlarm(expiresAt * 1000 + 60 * 1000);
    return true;
  }

  /**
   * 仅处理 WebSocket 升级；`WebSocketPair` 一端给浏览器、一端由 DO 持有并 `acceptWebSocket` 以支持休眠计费。
   * 新连接**同步**发 `latest`：避免用户晚连时只收到空档之后的增量。
   */
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
    // 重连/晚连时立刻补一帧，与首次连接体验一致
    if (latest) server.send(JSON.stringify(latest));
    logInfo("task.room.websocket_connected", {
      path: new URL(request.url).pathname,
      latestEventType: latest?.type ?? null,
      latestTaskId: latest ? runningTaskId(latest) : null,
      socketCount: this.ctx.getWebSockets().length
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Worker 侧 RPC：`broadcastTaskEvent` 调 stub 进入；先 `storage.put("latest")` 再 fan-out。
   * 单 socket `send` 失败则关闭，避免半开连接占资源；**每次**推事件都续一次 alarm（10min 后兜底扫超时任务）。
   */
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
    // 与 `GENERATION_ATTEMPT_TIMEOUT_MS` 同量级，alarm 与 Worker 全库 sweep 双保险
    await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
  }

  /**
   * 客户端可发含 `"ping"` 的文本保活；回 `{ type: "pong", ts }`。
   * 不强制：纯展示任务时也可不实现 ping。
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === "string" && message.includes("ping")) {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    }
  }

  /**
   * 定时器：`latest` 若仍为 running，则 `failTimedOutGenerateTaskIfNeeded` 可能把 D1 置 failed 并**回调**本 DO 再广播；
   * 已 done/failed 的 `latest` 在 `runningTaskId` 处短路，不重复扫库。
   */
  async alarm(): Promise<void> {
    const captchaReplayExpiresAt = await this.ctx.storage.get<number>("captchaReplayExpiresAt");
    if (captchaReplayExpiresAt) {
      if (Date.now() >= captchaReplayExpiresAt * 1000 + 60 * 1000) {
        await this.ctx.storage.delete("captchaReplayExpiresAt");
        return;
      }
      await this.ctx.storage.setAlarm(captchaReplayExpiresAt * 1000 + 60 * 1000);
      return;
    }
    const latest = await this.ctx.storage.get<TaskEvent>("latest");
    const taskId = runningTaskId(latest);
    if (!taskId) {
      logInfo("task.room.alarm_no_running_task", { latestEventType: latest?.type ?? null });
      return;
    }
    logWarn("task.room.alarm_checking_task_timeout", { taskId });
    try {
      // 通知回调用 `updateStatus`，使同一房间的 WS 收到 task.failed 等
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

/** 各 TaskEvent 变体均带 `task.id` */
function eventTaskId(event: TaskEvent): string {
  return event.task.id;
}

/**
 * 仅当 latest 表示「仍在跑」时返回 taskId，供 alarm 决定是否执行超时逻辑；
 * done/failed 等终态不触发超时收尾。
 */
function runningTaskId(event: TaskEvent | undefined): string | null {
  if (!event) return null;
  if (event.type === "task.update" && event.task.status === "running") return event.task.id;
  if (event.type === "task.image" && event.task.status === "running") return event.task.id;
  return null;
}
