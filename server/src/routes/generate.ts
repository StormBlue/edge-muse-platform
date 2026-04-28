/**
 * 生图 HTTP 路由：`POST /api/generate`、任务查询/取消/重试、以及 **WebSocket 升级入口**（见文件末 handleTaskWebSocket）
 *
 * 核心路径（与 docs 一致）：
 * 1. POST /generate：校验参数 → `createGenerateTask`（D1 写会话/消息/任务 + 配额）→ `startGenerateTask`（Workflow 或内联 runGenerateTask）→ 202 返回 taskId + **wsUrl**。
 * 2. GET /ws/task/:id：把 WebSocket 交给 Durable Object `TaskRoom`，用于向浏览器推送任务事件。
 *
 * 生图主链路时序（符号）：
 *   Client --POST /api/generate--> Worker
 *     → createGenerateTask(D1: tasks=queued, 配额扣减)
 *     → startGenerateTask → waitUntil(workflow 或 runGenerateTask)
 *   Client <--202-- { taskId, wsUrl, ... }
 *   Client --WS /ws/task/taskId--> TaskRoom（后续事件由 Workflow/runGenerateTask → broadcastTaskEvent → DO）
 */
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { tasks } from "../db/schema";
import { assertTaskAccess } from "../lib/access";
import { audit } from "../lib/audit";
import { appError } from "../lib/errors";
import { recordExperimentEvent, recordRetrySubmittedExperimentEvent } from "../lib/experiments";
import { SERVER_GENERATE_SUBMIT_SOURCE } from "../lib/generationExperimentConstants";
import { MAX_SYSADMIN_IMAGE_COUNT, resolveImageCountForRole } from "../lib/generationPolicy";
import { logInfo, logWarn, promptSummary } from "../lib/log";
import { broadcastTaskEvent, createGenerateTask, startGenerateTask } from "../lib/tasks";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import type { AppContext, AppEnv } from "../types";

/** 预设与「宽x高」自定义尺寸白名单；具体能力还受 provider supportedSizes 约束 */
const allowedSizes = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "2048x2048",
  "2880x2880",
  "3840x2160",
  "2160x3840",
  "auto"
];

/** 表单或恶意请求传空字符串时视为新会话，避免插入 id 为空的脏 session。 */
export function normalizeOptionalSessionId(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const optionalSessionIdSchema = z.preprocess(
  normalizeOptionalSessionId,
  z.string().min(1).optional()
);

const generateExperimentEventSchema = z
  .object({
    route: z.string().trim().max(120).optional(),
    caseId: z.string().trim().max(120).optional(),
    metadata: z.record(z.string(), z.unknown()).default({})
  })
  .optional();

/** POST 体：可选 session（无则新建）、张数经 `resolveImageCountForRole` 再压一道 */
const generateSchema = z.object({
  sessionId: optionalSessionIdSchema,
  title: z.string().trim().min(1).max(80).optional(),
  prompt: z.string().min(1).max(4000),
  mode: z.enum(["text2image", "image2image", "chat"]).default("text2image"),
  size: z
    .string()
    .refine((value) => allowedSizes.includes(value) || /^\d+x\d+$/.test(value), "Invalid size")
    .default("1024x1024"),
  n: z.number().int().min(1).max(MAX_SYSADMIN_IMAGE_COUNT).default(1),
  model: z.string().optional(),
  referenceImageIds: z.array(z.string()).max(5).optional(),
  /** AI 图像生成页的提交事件由服务端在任务启动前写入，避免 WS 结果事件先到导致归因回退。 */
  experimentEvent: generateExperimentEventSchema
});

const retrySchema = z.object({
  experimentEvent: generateExperimentEventSchema
});

export const generateRoutes = new Hono<AppEnv>();

// ===================== POST /generate：建任务 + 非阻塞执行 + 返回 wsUrl =====================
/** 创建异步生图任务：不等待第三方完成，立即返回 202 + WebSocket 地址 */
generateRoutes.post(
  "/generate",
  requireAuth,
  rateLimit({ prefix: "generate", limit: 60, windowSeconds: 60 }),
  zValidator("json", generateSchema),
  async (c) => {
    const user = c.get("user");
    const rawBody = c.req.valid("json");
    const { experimentEvent, ...generateBody } = rawBody;
    const traceId = c.get("traceId");
    logInfo("generate.request.received", {
      traceId,
      userId: user.id,
      role: user.role,
      sessionId: generateBody.sessionId ?? null,
      mode: generateBody.mode,
      size: generateBody.size,
      requestedImageCount: generateBody.n,
      model: generateBody.model ?? null,
      referenceImageCount: generateBody.referenceImageIds?.length ?? 0,
      ...promptSummary(generateBody.prompt)
    });
    // 图生图：去重参考图 id；文生/对话不传 reference
    const referenceImageIds =
      generateBody.mode === "image2image" ? [...new Set(generateBody.referenceImageIds ?? [])] : [];
    if (generateBody.mode === "image2image" && referenceImageIds.length === 0) {
      logWarn("generate.request.rejected", {
        traceId,
        userId: user.id,
        mode: generateBody.mode,
        reason: "missing_reference_image"
      });
      throw appError("VALIDATION_ERROR", "Reference image required for image-to-image");
    }
    // 非 sysadmin 的 n 可能被压到 1（多轮 chat 等策略见 lib/generationPolicy）
    const body = {
      ...generateBody,
      n: resolveImageCountForRole(user.role, generateBody.mode, generateBody.n),
      referenceImageIds
    };
    logInfo("generate.request.normalized", {
      traceId,
      userId: user.id,
      role: user.role,
      mode: body.mode,
      size: body.size,
      requestedImageCount: rawBody.n,
      resolvedImageCount: body.n,
      referenceImageCount: body.referenceImageIds.length
    });
    const result = await createGenerateTask(c.env, {
      userId: user.id,
      sessionId: body.sessionId,
      params: body
    });
    logInfo("generate.task.created", {
      traceId,
      userId: user.id,
      taskId: result.taskId,
      sessionId: result.sessionId,
      messageId: result.messageId,
      mode: body.mode,
      size: body.size,
      imageCount: body.n
    });
    await audit(c.env, {
      actorId: user.id,
      action: "task.create",
      targetType: "task",
      targetId: result.taskId,
      payload: { mode: body.mode, size: body.size, n: body.n }
    });
    logInfo("generate.task.audit_written", {
      traceId,
      userId: user.id,
      taskId: result.taskId
    });
    if (experimentEvent) {
      try {
        await recordExperimentEvent(c.env, user, {
          eventName: "generate_submitted",
          route: experimentEvent.route,
          caseId: experimentEvent.caseId,
          taskId: result.taskId,
          metadata: {
            ...experimentEvent.metadata,
            submitEventSource: SERVER_GENERATE_SUBMIT_SOURCE
          }
        });
        logInfo("generate.experiment_submitted_written", {
          traceId,
          userId: user.id,
          taskId: result.taskId
        });
      } catch (error) {
        // 事件不应阻断已创建的任务；失败会让后续结果事件带 attributionFallback，便于排查。
        logWarn("generate.experiment_submitted_failed", {
          traceId,
          userId: user.id,
          taskId: result.taskId,
          message: error instanceof Error ? error.message : "unknown"
        });
      }
    }
    // `startGenerateTask` 仅 `waitUntil` 子任务，不延长 HTTP 响应；浏览器用 wsUrl 收 DO 广播
    startGenerateTask(c.env, c.executionCtx, result.taskId);
    const wsProtocol = new URL(c.req.url).protocol === "https:" ? "wss:" : "ws:";
    // 与 `index` 中注册的 `GET /ws/task/:id` 同 host，**无** `/api` 前缀
    const wsUrl = `${wsProtocol}//${new URL(c.req.url).host}/ws/task/${result.taskId}`;
    logInfo("generate.task.dispatched", {
      traceId,
      userId: user.id,
      taskId: result.taskId,
      workflowConfigured: Boolean(c.env.GEN_WORKFLOW),
      wsProtocol
    });
    return c.json({ ...result, wsUrl }, 202);
  }
);

// ---------- 单任务只读；`assertTaskAccess` 保证属于当前用户 ----------
generateRoutes.get("/tasks/:id", requireAuth, async (c) => {
  const task = await assertTaskAccess(c.env, c.req.param("id"), c.get("user"));
  return c.json({ task });
});

// ---------- 仅 `queued` 可取消；写库 cancelled 并推 task.update 给已连上的 WS ----------
generateRoutes.post("/tasks/:id/cancel", requireAuth, async (c) => {
  const task = await assertTaskAccess(c.env, c.req.param("id"), c.get("user"));
  if (task.status !== "queued")
    throw appError("VALIDATION_ERROR", "Only queued tasks can be cancelled");
  await getDb(c.env)
    .update(tasks)
    .set({ status: "cancelled", finishedAt: Date.now() })
    .where(eq(tasks.id, task.id));
  await broadcastTaskEvent(c.env, task.id, {
    type: "task.update",
    task: { id: task.id, status: "cancelled" }
  });
  logInfo("task.cancelled", {
    traceId: c.get("traceId"),
    taskId: task.id,
    sessionId: task.sessionId,
    messageId: task.messageId,
    userId: c.get("user").id
  });
  return c.json({ ok: true });
});

// ---------- 失败任务用原 params 再建一条任务（`retryOf` 记血缘），不重复用旧 message 行 ----------
generateRoutes.post("/tasks/:id/retry", requireAuth, async (c) => {
  const user = c.get("user");
  const retryBody = await c.req.json().catch(() => ({}));
  const parsedRetry = retrySchema.safeParse(retryBody);
  if (!parsedRetry.success) {
    throw appError("VALIDATION_ERROR", "Invalid retry payload", parsedRetry.error.flatten());
  }
  const task = await assertTaskAccess(c.env, c.req.param("id"), user);
  if (task.status !== "failed")
    throw appError("VALIDATION_ERROR", "Only failed tasks can be retried");
  const params = generateSchema.parse(JSON.parse(task.params));
  const retryParams = {
    ...params,
    n: resolveImageCountForRole(user.role, params.mode, params.n)
  };
  const result = await createGenerateTask(c.env, {
    userId: user.id,
    sessionId: task.sessionId,
    params: retryParams,
    retryOf: task.id
  });
  try {
    await recordRetrySubmittedExperimentEvent(c.env, {
      userId: user.id,
      sourceTaskId: task.id,
      taskId: result.taskId,
      route: parsedRetry.data.experimentEvent?.route,
      caseId: parsedRetry.data.experimentEvent?.caseId,
      metadata: {
        ...parsedRetry.data.experimentEvent?.metadata,
        mode: retryParams.mode,
        size: retryParams.size,
        n: retryParams.n,
        referenceImageCount: retryParams.referenceImageIds?.length ?? 0
      }
    });
    logInfo("task.retry.experiment_submitted_written", {
      traceId: c.get("traceId"),
      userId: user.id,
      retryOf: task.id,
      taskId: result.taskId
    });
  } catch (error) {
    // 重试任务已经创建，指标写入失败不能影响用户继续接收任务结果。
    logWarn("task.retry.experiment_submitted_failed", {
      traceId: c.get("traceId"),
      userId: user.id,
      retryOf: task.id,
      taskId: result.taskId,
      message: error instanceof Error ? error.message : "unknown"
    });
  }
  startGenerateTask(c.env, c.executionCtx, result.taskId);
  logInfo("task.retry.created", {
    traceId: c.get("traceId"),
    userId: user.id,
    retryOf: task.id,
    taskId: result.taskId,
    sessionId: result.sessionId,
    messageId: result.messageId
  });
  return c.json(result, 202);
});

/** 注意：全局路由在 index.ts 注册为 `GET /ws/task/:id`（无 /api 前缀），与返回给前端的 wsUrl 一致 */
generateRoutes.get("/ws/task/:id", handleTaskWebSocket);

/**
 * WebSocket 升级：按 taskId 派发到对应 Durable Object 实例（`idFromName(taskId)`）。
 * 鉴权若需加强，可在此校验 Cookie/JWT 与 task.userId（当前依赖 DO 侧或上游中间件策略时见项目演进）。
 */
export async function handleTaskWebSocket(c: AppContext) {
  if (c.req.header("Upgrade") !== "websocket") return c.text("Expected websocket", 426);
  if (!c.env.TASK_ROOM) throw appError("INTERNAL", "Task room binding is missing");
  const taskId = c.req.param("id");
  if (!taskId) throw appError("VALIDATION_ERROR", "Task id required");
  // 每个 taskId 一个 DO 实例，与 `broadcastTaskEvent` 的 idFromName 一致
  const id = c.env.TASK_ROOM.idFromName(taskId);
  const stub = c.env.TASK_ROOM.get(id);
  logInfo("task.websocket.connecting", {
    traceId: c.get("traceId"),
    taskId,
    path: new URL(c.req.url).pathname
  });
  return stub.fetch(c.req.raw);
}
