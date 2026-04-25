import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { tasks } from "../db/schema";
import { assertTaskAccess } from "../lib/access";
import { audit } from "../lib/audit";
import { appError } from "../lib/errors";
import { MAX_SYSADMIN_IMAGE_COUNT, resolveImageCountForRole } from "../lib/generationPolicy";
import { logInfo, logWarn, promptSummary } from "../lib/log";
import { broadcastTaskEvent, createGenerateTask, startGenerateTask } from "../lib/tasks";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import type { AppContext, AppEnv } from "../types";

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

const generateSchema = z.object({
  sessionId: z.string().optional(),
  title: z.string().trim().min(1).max(80).optional(),
  prompt: z.string().min(1).max(4000),
  mode: z.enum(["text2image", "image2image", "chat"]).default("text2image"),
  size: z
    .string()
    .refine((value) => allowedSizes.includes(value) || /^\d+x\d+$/.test(value), "Invalid size")
    .default("1024x1024"),
  n: z.number().int().min(1).max(MAX_SYSADMIN_IMAGE_COUNT).default(1),
  model: z.string().optional(),
  referenceImageIds: z.array(z.string()).max(5).optional()
});

export const generateRoutes = new Hono<AppEnv>();

generateRoutes.post(
  "/generate",
  requireAuth,
  rateLimit({ prefix: "generate", limit: 60, windowSeconds: 60 }),
  zValidator("json", generateSchema),
  async (c) => {
    const user = c.get("user");
    const rawBody = c.req.valid("json");
    const traceId = c.get("traceId");
    logInfo("generate.request.received", {
      traceId,
      userId: user.id,
      role: user.role,
      sessionId: rawBody.sessionId ?? null,
      mode: rawBody.mode,
      size: rawBody.size,
      requestedImageCount: rawBody.n,
      model: rawBody.model ?? null,
      referenceImageCount: rawBody.referenceImageIds?.length ?? 0,
      ...promptSummary(rawBody.prompt)
    });
    const referenceImageIds =
      rawBody.mode === "image2image" ? (rawBody.referenceImageIds ?? []) : [];
    if (rawBody.mode === "image2image" && referenceImageIds.length === 0) {
      logWarn("generate.request.rejected", {
        traceId,
        userId: user.id,
        mode: rawBody.mode,
        reason: "missing_reference_image"
      });
      throw appError("VALIDATION_ERROR", "Reference image required for image-to-image");
    }
    const body = {
      ...rawBody,
      n: resolveImageCountForRole(user.role, rawBody.mode, rawBody.n),
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
    startGenerateTask(c.env, c.executionCtx, result.taskId);
    const wsProtocol = new URL(c.req.url).protocol === "https:" ? "wss:" : "ws:";
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

generateRoutes.get("/tasks/:id", requireAuth, async (c) => {
  const task = await assertTaskAccess(c.env, c.req.param("id"), c.get("user"));
  return c.json({ task });
});

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

generateRoutes.post("/tasks/:id/retry", requireAuth, async (c) => {
  const user = c.get("user");
  const task = await assertTaskAccess(c.env, c.req.param("id"), user);
  if (task.status !== "failed")
    throw appError("VALIDATION_ERROR", "Only failed tasks can be retried");
  const params = generateSchema.parse(JSON.parse(task.params));
  const result = await createGenerateTask(c.env, {
    userId: user.id,
    sessionId: task.sessionId,
    params: {
      ...params,
      n: resolveImageCountForRole(user.role, params.mode, params.n)
    },
    retryOf: task.id
  });
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

generateRoutes.get("/ws/task/:id", handleTaskWebSocket);

export async function handleTaskWebSocket(c: AppContext) {
  if (c.req.header("Upgrade") !== "websocket") return c.text("Expected websocket", 426);
  if (!c.env.TASK_ROOM) throw appError("INTERNAL", "Task room binding is missing");
  const taskId = c.req.param("id");
  if (!taskId) throw appError("VALIDATION_ERROR", "Task id required");
  const id = c.env.TASK_ROOM.idFromName(taskId);
  const stub = c.env.TASK_ROOM.get(id);
  logInfo("task.websocket.connecting", {
    traceId: c.get("traceId"),
    taskId,
    path: new URL(c.req.url).pathname
  });
  return stub.fetch(c.req.raw);
}
