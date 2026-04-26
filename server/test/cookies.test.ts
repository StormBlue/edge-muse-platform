import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { clearAuthCookies, setAuthCookies } from "../src/lib/cookies";
import type { AppEnv } from "../src/types";

const env = { ENVIRONMENT: "production" } as Cloudflare.Env;

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
}

describe("auth cookies", () => {
  it("shares auth cookies across apex and www hosts", async () => {
    const app = new Hono<AppEnv>();
    app.get("/set", (c) => {
      setAuthCookies(c, "access-token", "refresh-token", "csrf-token");
      return c.text("ok");
    });

    const response = await app.request("https://www.pinkteck.com/set", undefined, env);
    const cookies = getSetCookies(response);
    const sharedDomainCookies = cookies.filter((cookie) => cookie.includes("Domain=pinkteck.com"));
    const hostOnlyClears = cookies.filter((cookie) => !cookie.includes("Domain="));

    expect(sharedDomainCookies).toHaveLength(3);
    expect(hostOnlyClears).toHaveLength(3);
  });

  it("clears auth cookies with the same shared domain", async () => {
    const app = new Hono<AppEnv>();
    app.get("/clear", (c) => {
      clearAuthCookies(c);
      return c.text("ok");
    });

    const response = await app.request("https://www.pinkteck.com/clear", undefined, env);
    const cookies = getSetCookies(response);
    const sharedDomainClears = cookies.filter((cookie) => cookie.includes("Domain=pinkteck.com"));
    const hostOnlyClears = cookies.filter((cookie) => !cookie.includes("Domain="));

    expect(sharedDomainClears).toHaveLength(3);
    expect(hostOnlyClears).toHaveLength(3);
  });
});
