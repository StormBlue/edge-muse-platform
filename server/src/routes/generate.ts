import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client";
import { tasks } from "../db/schema";
import { assertTaskAccess } from "../lib/access";
import { audit } from "../lib/audit";
import { appError } from "../lib/errors";
import { createGenerateTask, runGenerateTask, type TaskEvent } from "../lib/tasks";
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
  prompt: z.string().min(1).max(4000),
  mode: z.enum(["text2image", "image2image", "chat"]).default("text2image"),
  size: z
    .string()
    .refine((value) => allowedSizes.includes(value) || /^\d+x\d+$/.test(value), "Invalid size")
    .default("1024x1024"),
  n: z.number().int().min(1).max(4).default(1),
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
    const body = c.req.valid("json");
    if (
      body.mode === "image2image" &&
      (!body.referenceImageIds || body.referenceImageIds.length === 0)
    ) {
      throw appError("VALIDATION_ERROR", "Reference image required for image-to-image");
    }
    const result = await createGenerateTask(c.env, {
      userId: c.get("user").id,
      sessionId: body.sessionId,
      params: body
    });
    await audit(c.env, {
      actorId: c.get("user").id,
      action: "task.create",
      targetType: "task",
      targetId: result.taskId,
      payload: { mode: body.mode, size: body.size, n: body.n }
    });
    startTask(c, result.taskId);
    const wsProtocol = new URL(c.req.url).protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${new URL(c.req.url).host}/ws/task/${result.taskId}`;
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
  await broadcastTask(c.env, task.id, {
    type: "task.update",
    task: { id: task.id, status: "cancelled" }
  });
  return c.json({ ok: true });
});

generateRoutes.post("/tasks/:id/retry", requireAuth, async (c) => {
  const task = await assertTaskAccess(c.env, c.req.param("id"), c.get("user"));
  if (task.status !== "failed")
    throw appError("VALIDATION_ERROR", "Only failed tasks can be retried");
  const result = await createGenerateTask(c.env, {
    userId: c.get("user").id,
    sessionId: task.sessionId,
    params: JSON.parse(task.params) as z.infer<typeof generateSchema>,
    retryOf: task.id
  });
  startTask(c, result.taskId);
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
  return stub.fetch(c.req.raw);
}

function startTask(c: AppContext, taskId: string) {
  const workflow = c.env.GEN_WORKFLOW;
  if (workflow && typeof workflow.create === "function") {
    c.executionCtx.waitUntil(workflow.create({ id: taskId, params: { taskId } }));
    return;
  }
  c.executionCtx.waitUntil(
    runGenerateTask(c.env, taskId, (event) => broadcastTask(c.env, taskId, event))
  );
}

async function broadcastTask(env: Cloudflare.Env, taskId: string, event: TaskEvent): Promise<void> {
  if (!env.TASK_ROOM) return;
  const id = env.TASK_ROOM.idFromName(taskId);
  const stub = env.TASK_ROOM.get(id);
  await stub.updateStatus(event);
}
