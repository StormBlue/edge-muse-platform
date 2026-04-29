import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { authRoutes } from "../src/routes/auth";
import { installErrorHandling } from "../src/middleware/error";
import type { AppEnv } from "../src/types";

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
}

describe("auth refresh", () => {
  it("returns 401 and clears cookies for invalid refresh tokens", async () => {
    const app = new Hono<AppEnv>();
    installErrorHandling(app);
    app.route("/api/auth", authRoutes);

    const response = await app.request(
      "http://localhost/api/auth/refresh",
      {
        method: "POST",
        headers: { Cookie: "em_refresh=bad.token.value" }
      },
      { ENVIRONMENT: "dev" } as Cloudflare.Env
    );

    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" }
    });
    expect(response.status).toBe(401);
    expect(getSetCookies(response).join("\n")).toContain("em_refresh=");
  });
});
