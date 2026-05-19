/**
 * 生图 HTTP 路由：`POST /api/generate`、任务查询/取消/重试、以及 **WebSocket 升级入口**（见文件末 handleTaskWebSocket）
 *
 * 核心路径（与 docs 一致）：
 * 1. POST /generate：校验参数 → `createGenerateTask`（D1 写会话/消息/任务 + 配额）→ `startGenerateTask`（Workflow 或内联 runGenerateTask）→ 202 返回 taskId + **wsUrl**。
 * 2. GET /ws/task/:id：把 WebSocket 交给 Durable Object `TaskRoom`，用于向浏览器推送任务事件。
 *
 * 生图主链路时序（符号）：
 *   Client --POST /api/generate--> Worker
 *     → createGenerateTask(校验 + 配额预扣 + D1: tasks=queued)
 *     → startGenerateTask → waitUntil(workflow 或 runGenerateTask)
 *   Client <--202-- { taskId, wsUrl, ... }
 *   Client --WS /ws/task/taskId--> TaskRoom（后续事件由 Workflow/runGenerateTask → broadcastTaskEvent → DO）
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { assertTaskAccess } from "../lib/access";
import { audit } from "../lib/audit";
import { appError } from "../lib/errors";
import {
  assertGenerationRouteEnabledForUser,
  assertRetryGenerationRouteEnabledForUser,
  generationRouteSchema,
  recordGenerationEvent,
  recordRetrySubmittedGenerationEvent
} from "../lib/generationEntry";
import { MAX_SYSADMIN_IMAGE_COUNT, resolveImageCountForRole } from "../lib/generationPolicy";
import { logInfo, logWarn, promptSummary } from "../lib/log";
import {
  broadcastTaskEvent,
  createGenerateTask,
  enqueueGenerateTask,
  releaseGenerateTaskSlot
} from "../lib/tasks";
import { cancelQueuedGenerateTask } from "../lib/tasks/state";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import type { WaitUntilContext } from "../lib/tasks/types";
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

const generateGenerationEventSchema = z
  .object({
    route: generationRouteSchema,
    caseId: z.string().trim().max(120).optional(),
    metadata: z.record(z.string(), z.unknown()).default({})
  })
  .optional();

/** POST 体：可选 session（无则新建）、张数经 `resolveImageCountForRole` 再压一道 */
const generateSchema = z.object({
  sessionId: optionalSessionIdSchema,
  title: z.string().trim().min(1).max(80).optional(),
  prompt: z.string().min(1).max(4000),
  generationTargetId: z.enum(["default", "micu_grok"]).default("default"),
  mode: z.enum(["image2image", "text2image"]).default("image2image"),
  size: z
    .string()
    .refine((value) => allowedSizes.includes(value) || /^\d+x\d+$/.test(value), "Invalid size")
    .default("1024x1024"),
  n: z.number().int().min(1).max(MAX_SYSADMIN_IMAGE_COUNT).default(1),
  model: z.string().optional(),
  referenceImageIds: z.array(z.string()).max(5).optional(),
  /** AI 图像生成页的提交事件由服务端在任务启动前写入，避免 WS 结果事件先到导致归因回退。 */
  generationEvent: generateGenerationEventSchema
});

const retrySchema = z.object({
  generationEvent: generateGenerationEventSchema
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
    const { generationEvent, ...generateBody } = rawBody;
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
      generationTargetId: generateBody.generationTargetId,
      referenceImageCount: generateBody.referenceImageIds?.length ?? 0,
      ...promptSummary(generateBody.prompt)
    });
    // 图生图：去重参考图 id；文生图不传 reference。
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
    // 非 sysadmin 的 n 会被压到 1；sysadmin 仍受服务商能力校验约束。
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
      generationTargetId: body.generationTargetId,
      referenceImageCount: body.referenceImageIds.length
    });
    await assertGenerationRouteEnabledForUser(c.env, user, generationEvent?.route);
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
      imageCount: body.n,
      generationTargetId: body.generationTargetId
    });
    try {
      await audit(c.env, {
        actorId: user.id,
        action: "task.create",
        targetType: "task",
        targetId: result.taskId,
        payload: {
          mode: body.mode,
          size: body.size,
          n: body.n,
          generationTargetId: body.generationTargetId
        }
      });
      logInfo("generate.task.audit_written", {
        traceId,
        userId: user.id,
        taskId: result.taskId
      });
    } catch (error) {
      logWarn("generate.task.audit_failed", {
        traceId,
        userId: user.id,
        taskId: result.taskId,
        message: error instanceof Error ? error.message : "unknown"
      });
    }
    if (generationEvent) {
      try {
        await recordGenerationEvent(c.env, user, {
          eventName: "generate_submitted",
          route: generationEvent.route,
          caseId: generationEvent.caseId,
          taskId: result.taskId,
          metadata: {
            ...generationEvent.metadata,
            generationTargetId: body.generationTargetId
          }
        });
        logInfo("generate.event_submitted_written", {
          traceId,
          userId: user.id,
          taskId: result.taskId
        });
      } catch (error) {
        // 事件不应阻断已创建的任务；失败只影响 sysadmin 用量统计。
        logWarn("generate.event_submitted_failed", {
          traceId,
          userId: user.id,
          taskId: result.taskId,
          message: error instanceof Error ? error.message : "unknown"
        });
      }
    }
    // `enqueueGenerateTask` 仅调度后台子任务，不延长 HTTP 响应；浏览器用 wsUrl 收 DO 广播
    enqueueGenerateTask(c.env, executionContextFromHono(c), result.taskId);
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
  const cancelled = await cancelQueuedGenerateTask(c.env, {
    taskId: task.id,
    messageId: task.messageId,
    sessionId: task.sessionId,
    providerKeyGroupId: task.providerKeyGroupId
  });
  if (!cancelled) {
    throw appError("VALIDATION_ERROR", "Only queued tasks can be cancelled");
  }
  const executionCtx = executionContextFromHono(c);
  releaseGenerateTaskSlot(c.env, executionCtx, {
    taskId: task.id,
    providerKeyGroupId: task.providerKeyGroupId
  });
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
  await assertRetryGenerationRouteEnabledForUser(c.env, user, {
    sourceTaskId: task.id,
    route: parsedRetry.data.generationEvent?.route
  });
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
    await recordRetrySubmittedGenerationEvent(c.env, {
      user,
      sourceTaskId: task.id,
      taskId: result.taskId,
      route: parsedRetry.data.generationEvent?.route,
      caseId: parsedRetry.data.generationEvent?.caseId,
      metadata: {
        ...parsedRetry.data.generationEvent?.metadata,
        mode: retryParams.mode,
        size: retryParams.size,
        n: retryParams.n,
        generationTargetId: retryParams.generationTargetId ?? "default",
        referenceImageCount: retryParams.referenceImageIds?.length ?? 0
      }
    });
    logInfo("task.retry.generation_event_submitted_written", {
      traceId: c.get("traceId"),
      userId: user.id,
      retryOf: task.id,
      taskId: result.taskId
    });
  } catch (error) {
    // 重试任务已经创建，用量事件写入失败不能影响用户继续接收任务结果。
    logWarn("task.retry.generation_event_submitted_failed", {
      traceId: c.get("traceId"),
      userId: user.id,
      retryOf: task.id,
      taskId: result.taskId,
      message: error instanceof Error ? error.message : "unknown"
    });
  }
  enqueueGenerateTask(c.env, executionContextFromHono(c), result.taskId);
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
generateRoutes.get("/ws/task/:id", requireAuth, handleTaskWebSocket);

/**
 * WebSocket 升级：按 taskId 派发到对应 Durable Object 实例（`idFromName(taskId)`）。
 * 在进入 DO 前校验 Cookie/JWT 与 task.userId，避免匿名随机 taskId 占用 DO 连接。
 */
export async function handleTaskWebSocket(c: AppContext) {
  if (c.req.header("Upgrade") !== "websocket") return c.text("Expected websocket", 426);
  if (!c.env.TASK_ROOM) throw appError("INTERNAL", "Task room binding is missing");
  const taskId = c.req.param("id");
  if (!taskId) throw appError("VALIDATION_ERROR", "Task id required");
  await assertTaskAccess(c.env, taskId, c.get("user"));
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

function executionContextFromHono(c: AppContext): WaitUntilContext | null {
  if (!("executionCtx" in c)) return null;
  try {
    return c.executionCtx;
  } catch {
    return null;
  }
}
