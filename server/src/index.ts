import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { sessionRoutes, historyRoutes } from "./routes/sessions";
import { generateRoutes, handleTaskWebSocket } from "./routes/generate";
import { imageRoutes } from "./routes/images";
import { uploadRoutes } from "./routes/uploads";
import { adminRoutes } from "./routes/admin";
import { sysadminRoutes } from "./routes/sysadmin";
import { requestLogger } from "./middleware/logger";
import { securityHeaders } from "./middleware/security";
import { csrf } from "./middleware/csrf";
import { installErrorHandling } from "./middleware/error";
import type { AppEnv } from "./types";
export { TaskRoom } from "./do/TaskRoom";
export { GenerateImageWorkflow } from "./workflows/GenerateImage";

const app = new Hono<AppEnv>();

installErrorHandling(app);

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

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "edge-muse-platform",
    environment: c.env.ENVIRONMENT,
    now: Date.now()
  })
);

app.route("/api/auth", authRoutes);
app.route("/api/me", meRoutes);
app.route("/api/sessions", sessionRoutes);
app.route("/api/history", historyRoutes);
app.route("/api", generateRoutes);
app.route("/api", imageRoutes);
app.route("/api", uploadRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/sysadmin", sysadminRoutes);
app.get("/ws/task/:id", handleTaskWebSocket);

export default app;
