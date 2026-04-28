import { describe, expect, it } from "vitest";
import {
  getPublicTurnstileSiteKey,
  isTurnstileBypassed,
  verifyTurnstile
} from "../src/lib/turnstile";

const devEnv = {
  ENVIRONMENT: "dev",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA"
} as Cloudflare.Env;

const productionEnv = {
  ENVIRONMENT: "production",
  TURNSTILE_SITE_KEY: "0x4AAAA-production-site-key",
  TURNSTILE_SECRET_KEY: "production-secret"
} as Cloudflare.Env;

describe("turnstile environment behavior", () => {
  it("hides the widget site key and accepts login without token in local dev", async () => {
    expect(isTurnstileBypassed(devEnv)).toBe(true);
    expect(getPublicTurnstileSiteKey(devEnv)).toBeNull();
    expect(await verifyTurnstile(devEnv)).toBe(true);
    expect(await verifyTurnstile(devEnv, "widget-error-token")).toBe(true);
  });

  it("exposes the configured site key and fails closed without token in production", async () => {
    expect(isTurnstileBypassed(productionEnv)).toBe(false);
    expect(getPublicTurnstileSiteKey(productionEnv)).toBe("0x4AAAA-production-site-key");
    expect(await verifyTurnstile(productionEnv)).toBe(false);
  });
});
