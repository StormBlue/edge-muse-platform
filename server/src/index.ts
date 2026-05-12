/**
 * Cloudflare Worker 入口：Hono 挂载 REST `/api/*`，**以及** 根路径 WebSocket `GET /ws/task/:id`（与 POST /api/generate 返回的 wsUrl 一致）。
 *
 * `fetch` 导出上在特定路径会 `scheduleInterruptedTaskRecovery`：对「已预扣配额但尚未点火」的 queued 任务做中断恢复（详见 lib/tasks）。
 * `scheduled`：Cron 触发的维护任务（中断恢复、R2 清理、运维摘要等）。
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { announcementRoutes } from "./routes/announcements";
import { authRoutes } from "./routes/auth";
import { docsRoutes } from "./routes/docs";
import { meRoutes } from "./routes/me";
import { sessionRoutes, historyRoutes } from "./routes/sessions";
import { generateRoutes, handleTaskWebSocket } from "./routes/generate";
import { imageRoutes } from "./routes/images";
import { generationEventRoutes } from "./routes/generationEvents";
import { promptAssistantRoutes } from "./routes/promptAssistant";
import { promptCaseRoutes } from "./routes/promptCases";
import { uploadRoutes } from "./routes/uploads";
import { adminRoutes } from "./routes/admin";
import { sysadminRoutes } from "./routes/sysadmin";
import { requireAuth } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import { securityHeaders } from "./middleware/security";
import { csrf } from "./middleware/csrf";
import { installErrorHandling } from "./middleware/error";
import { cleanupDeletedImages } from "./lib/cleanup";
import { backupOperationalSnapshot, logD1TableSizes, sendFailureDigest } from "./lib/operations";
import { recoverInterruptedGenerateTasks, scheduleInterruptedTaskRecovery } from "./lib/tasks";
import { createAltchaChallenge, getPublicCaptchaConfig } from "./lib/captcha";
import { resolveCaptchaRegion } from "./lib/captcha/region";
import type { AppEnv } from "./types";
export { TaskRoom } from "./do/TaskRoom";
export { GenerateImageWorkflow } from "./workflows/GenerateImage";

const app = new Hono<AppEnv>();

installErrorHandling(app);

// ---------- 中间件：全站安全头 + 仅 /api 的 CORS（带 Cookie）与 CSRF ----------
app.use("*", requestLogger);
app.use("*", securityHeaders);
app.use(
  "/api/*",
  cors({
    origin: (_origin, c) => new URL(c.req.url).origin,
    credentials: true
  })
);
app.use("/api/*", csrf);

// ---------- 无鉴权元数据：健康检查、登录验证码配置（dev 环境返回 disabled）----------
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "edge-muse-platform",
    environment: c.env.ENVIRONMENT,
    now: Date.now()
  })
);

app.get("/api/config", (c) =>
  getPublicCaptchaConfig(c.env, resolveCaptchaRegion(c)).then((captcha) =>
    c.json({
      captcha,
      turnstileSiteKey: captcha.provider === "turnstile" ? captcha.siteKey : null
    })
  )
);

app.get("/api/captcha/altcha/challenge", (c) =>
  createAltchaChallenge(c.env).then((challenge) => c.json(challenge))
);

// ---------- API 文档：dev 公开，production 要求 sysadmin（见 routes/docs.ts）----------
app.route("/api", docsRoutes);

// ---------- 业务路由挂载（均含各自 requireAuth / 角色，见各 routes 文件）----------
app.route("/api/auth", authRoutes);
app.route("/api/me", meRoutes);
app.route("/api/sessions", sessionRoutes);
app.route("/api/history", historyRoutes);
app.route("/api", generateRoutes);
app.route("/api", imageRoutes);
app.route("/api", uploadRoutes);
app.route("/api/generation", generationEventRoutes);
app.route("/api/prompt-assistant", promptAssistantRoutes);
app.route("/api/prompt-cases", promptCaseRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/announcements", announcementRoutes);
app.route("/api/sysadmin", sysadminRoutes);
/** 浏览器 WebSocket 连接点：`wss://<host>/ws/task/<taskId>`（无前缀 /api） */
app.get("/ws/task/:id", requireAuth, handleTaskWebSocket);

export default {
  fetch: (request, env, ctx) => {
    // 与任务相关的入口顺带调度「排队任务恢复」到 waitUntil，不阻塞当前响应
    if (shouldScheduleInterruptedTaskRecovery(request)) {
      scheduleInterruptedTaskRecovery(env, ctx);
    }
    return app.fetch(request, env, ctx);
  },
  /**
   * Cron 触发：`throttle: false` 全量扫中断任务；与其余维护任务并列入 `waitUntil`。
   * 具体间隔在 wrangler / 控制台配置，与「请求路径顺带 recovery」互补。
   */
  scheduled: (_controller, env, ctx) => {
    ctx.waitUntil(
      Promise.all([
        recoverInterruptedGenerateTasks(env, ctx, { throttle: false }),
        cleanupDeletedImages(env),
        sendFailureDigest(env),
        logD1TableSizes(env),
        backupOperationalSnapshot(env)
      ])
    );
  }
} satisfies ExportedHandler<Cloudflare.Env>;

/**
 * 在「可能 touch 生图状态」的入口上顺带 `scheduleInterruptedTaskRecovery`，
 * 避免仅靠 Cron 时长时间无人访问导致 queued 不点火；路径列表与产品入口对齐即可维护。
 */
function shouldScheduleInterruptedTaskRecovery(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return (
    path === "/api/generate" ||
    path.startsWith("/api/tasks/") ||
    path === "/api/sessions/active-generation" ||
    path.startsWith("/ws/task/")
  );
}
