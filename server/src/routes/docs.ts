import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { Scalar } from "@scalar/hono-api-reference";
import { openApiDocument } from "../docs/openapi";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import type { AppEnv } from "../types";

export const docsRoutes = new Hono<AppEnv>();

const requireDocsAccess = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.ENVIRONMENT !== "production") return next();
  await requireAuth(c, async () => {
    await requireRole("sysadmin")(c, next);
  });
});

docsRoutes.get("/openapi.json", requireDocsAccess, (c) => c.json(openApiDocument));

docsRoutes.get(
  "/docs",
  requireDocsAccess,
  Scalar({
    pageTitle: "Edge Muse Platform API Reference",
    url: "/api/openapi.json",
    persistAuth: true
  })
);
