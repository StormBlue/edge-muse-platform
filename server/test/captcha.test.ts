import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  createAltchaChallenge,
  getPublicCaptchaConfig,
  getCaptchaSettings,
  saveCaptchaSettings,
  verifyAltchaCaptcha
} from "../src/lib/captcha";
import { signTencentCloudRequest } from "../src/lib/captcha/tencent";
import { getDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { installErrorHandling } from "../src/middleware/error";
import { authRoutes } from "../src/routes/auth";
import { createD1TestContext } from "./d1TestUtils";
import {
  createAltchaChallengeApp,
  createLegacyAltchaPayload,
  createWidgetV3Payload,
  MemoryDurableReplayNamespace,
  MemoryKvNamespace,
  solveAltchaChallenge
} from "./captchaTestUtils";
import type { AppBindings, AppEnv } from "../src/types";

describe("captcha settings", () => {
  it("defaults domestic traffic to Tencent and overseas traffic to Turnstile", async () => {
    const env = {
      ENVIRONMENT: "production",
      TENCENT_CAPTCHA_APP_ID: "190000000",
      TURNSTILE_SITE_KEY: "0x4AAAA-production-site-key"
    } as AppBindings;

    expect(await getCaptchaSettings(env)).toMatchObject({
      domesticProvider: "tencent",
      overseasProvider: "turnstile",
      source: "default"
    });
    await expect(getPublicCaptchaConfig(env, "domestic")).resolves.toEqual({
      provider: "tencent",
      region: "domestic",
      appId: "190000000"
    });
    await expect(getPublicCaptchaConfig(env, "overseas")).resolves.toEqual({
      provider: "turnstile",
      region: "overseas",
      siteKey: "0x4AAAA-production-site-key"
    });
  });

  it("keeps the configured provider visible when public keys are missing", async () => {
    const env = {
      ENVIRONMENT: "production",
      CAPTCHA_DOMESTIC_PROVIDER: "tencent",
      CAPTCHA_OVERSEAS_PROVIDER: "turnstile"
    } as AppBindings;

    await expect(getPublicCaptchaConfig(env, "domestic")).resolves.toEqual({
      provider: "tencent",
      region: "domestic",
      appId: ""
    });
    await expect(getPublicCaptchaConfig(env, "overseas")).resolves.toEqual({
      provider: "turnstile",
      region: "overseas",
      siteKey: ""
    });
  });

  it("exposes ALTCHA public config when configured", async () => {
    const env = {
      ENVIRONMENT: "production",
      CAPTCHA_DOMESTIC_PROVIDER: "altcha"
    } as AppBindings;

    await expect(getPublicCaptchaConfig(env, "domestic")).resolves.toEqual({
      provider: "altcha",
      region: "domestic",
      challengeUrl: "/api/captcha/altcha/challenge"
    });
  });

  it("disables captcha in local dev", async () => {
    const env = {
      ENVIRONMENT: "dev",
      TENCENT_CAPTCHA_APP_ID: "190000000",
      TURNSTILE_SITE_KEY: "0x4AAAA-production-site-key"
    } as AppBindings;

    await expect(getPublicCaptchaConfig(env, "domestic")).resolves.toEqual({
      provider: "disabled",
      region: "domestic"
    });
  });

  it("persists sysadmin captcha provider overrides", async () => {
    const ctx = await createD1TestContext();
    try {
      await getDb(ctx.env).insert(users).values({
        id: "user_sysadmin",
        email: "sysadmin@example.com",
        username: "sysadmin",
        nickname: "Sysadmin",
        passwordHash: "hash",
        role: "sysadmin",
        locale: "zh-CN",
        status: "active",
        createdAt: 1,
        updatedAt: 1
      });
      const saved = await saveCaptchaSettings(ctx.env, "user_sysadmin", {
        domesticProvider: "disabled",
        overseasProvider: "altcha",
        altchaDifficulty: 75_000
      });
      expect(saved).toMatchObject({
        domesticProvider: "disabled",
        overseasProvider: "altcha",
        altchaDifficulty: 75_000,
        source: "database",
        updatedBy: "user_sysadmin"
      });
      await expect(getCaptchaSettings(ctx.env)).resolves.toMatchObject({
        domesticProvider: "disabled",
        overseasProvider: "altcha",
        altchaDifficulty: 75_000,
        source: "database"
      });
    } finally {
      await ctx.dispose();
    }
  });
});

describe("ALTCHA captcha", () => {
  it("creates a signed challenge and verifies a solved payload once", async () => {
    const env = {
      ENVIRONMENT: "production",
      ALTCHA_HMAC_KEY: "test-altcha-secret",
      ALTCHA_DEFAULT_DIFFICULTY: "10000",
      CAPTCHA_DOMESTIC_PROVIDER: "altcha",
      KV: new MemoryKvNamespace() as unknown as KVNamespace
    } as AppBindings;
    const challenge = await createAltchaChallenge(env);
    const payload = createWidgetV3Payload(challenge, await solveAltchaChallenge(challenge));

    await expect(verifyAltchaCaptcha(env, payload)).resolves.toBe(true);
    await expect(verifyAltchaCaptcha(env, payload)).resolves.toBe(false);
  });

  it("uses Durable Object replay consumption when available", async () => {
    const kv = new MemoryKvNamespace();
    const env = {
      ENVIRONMENT: "production",
      ALTCHA_HMAC_KEY: "test-altcha-secret",
      ALTCHA_DEFAULT_DIFFICULTY: "10000",
      CAPTCHA_DOMESTIC_PROVIDER: "altcha",
      KV: kv as unknown as KVNamespace,
      TASK_ROOM: new MemoryDurableReplayNamespace() as unknown as DurableObjectNamespace
    } as AppBindings;
    const challenge = await createAltchaChallenge(env);
    const payload = createWidgetV3Payload(challenge, await solveAltchaChallenge(challenge));

    await expect(verifyAltchaCaptcha(env, payload)).resolves.toBe(true);
    await expect(verifyAltchaCaptcha(env, payload)).resolves.toBe(false);
    expect(kv.findValueByPrefix("captcha:altcha:")).toBeNull();
  });

  it("rejects tampered ALTCHA payloads", async () => {
    const env = {
      ENVIRONMENT: "production",
      ALTCHA_HMAC_KEY: "test-altcha-secret",
      ALTCHA_DEFAULT_DIFFICULTY: "10000",
      CAPTCHA_DOMESTIC_PROVIDER: "altcha",
      KV: new MemoryKvNamespace() as unknown as KVNamespace
    } as AppBindings;
    const challenge = await createAltchaChallenge(env);
    const payload = createWidgetV3Payload(challenge, {
      counter: 0,
      derivedKey: "0".repeat(64)
    });

    await expect(verifyAltchaCaptcha(env, payload)).resolves.toBe(false);
  });

  it("rejects expired ALTCHA payloads", async () => {
    const env = {
      ENVIRONMENT: "production",
      ALTCHA_HMAC_KEY: "test-altcha-secret",
      ALTCHA_DEFAULT_DIFFICULTY: "10000",
      CAPTCHA_DOMESTIC_PROVIDER: "altcha",
      KV: new MemoryKvNamespace() as unknown as KVNamespace
    } as AppBindings;
    const challenge = await createAltchaChallenge(env);
    const payload = createWidgetV3Payload({
      ...challenge,
      parameters: { ...challenge.parameters, expiresAt: 1 }
    });

    await expect(verifyAltchaCaptcha(env, payload)).resolves.toBe(false);
  });

  it("keeps short-term compatibility with legacy ALTCHA payloads", async () => {
    const env = {
      ENVIRONMENT: "production",
      ALTCHA_HMAC_KEY: "test-altcha-secret",
      KV: new MemoryKvNamespace() as unknown as KVNamespace
    } as AppBindings;
    const payload = await createLegacyAltchaPayload("test-altcha-secret");

    await expect(verifyAltchaCaptcha(env, payload)).resolves.toBe(true);
  });
});

describe("ALTCHA challenge endpoint", () => {
  it("rejects challenge requests when ALTCHA is not the active regional provider", async () => {
    const app = createAltchaChallengeApp();
    const response = await app.request(
      "http://localhost/api/captcha/altcha/challenge",
      {
        headers: {
          "CF-IPCountry": "US",
          "CF-Connecting-IP": "203.0.113.44",
          "User-Agent": "vitest"
        }
      },
      {
        ENVIRONMENT: "production",
        CAPTCHA_OVERSEAS_PROVIDER: "turnstile",
        ALTCHA_HMAC_KEY: "test-altcha-secret",
        KV: new MemoryKvNamespace() as unknown as KVNamespace
      } as AppBindings
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN", message: "ALTCHA captcha is not enabled" }
    });
  });

  it("rate limits ALTCHA challenge issuance before generating the challenge", async () => {
    const kv = new MemoryKvNamespace({ "rl:captcha:altcha:203.0.113.45:vitest:": "60" });
    const app = createAltchaChallengeApp();
    const response = await app.request(
      "http://localhost/api/captcha/altcha/challenge",
      {
        headers: {
          "CF-IPCountry": "US",
          "CF-Connecting-IP": "203.0.113.45",
          "User-Agent": "vitest"
        }
      },
      {
        ENVIRONMENT: "production",
        CAPTCHA_OVERSEAS_PROVIDER: "altcha",
        ALTCHA_HMAC_KEY: "test-altcha-secret",
        KV: kv as unknown as KVNamespace
      } as AppBindings
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED", message: "Too many requests" }
    });
  });
});

describe("Tencent Cloud TC3 signing", () => {
  it("creates a stable TC3 authorization header", async () => {
    const authorization = await signTencentCloudRequest({
      payload: JSON.stringify({
        CaptchaType: 9,
        Ticket: "ticket",
        UserIp: "203.0.113.10",
        Randstr: "@rand",
        CaptchaAppId: 190000000,
        AppSecretKey: "app-secret"
      }),
      timestamp: 1_700_000_000,
      secretId: "AKIDEXAMPLE",
      secretKey: "SECRETEXAMPLE"
    });

    expect(authorization).toMatch(
      /^TC3-HMAC-SHA256 Credential=AKIDEXAMPLE\/2023-11-14\/captcha\/tc3_request, SignedHeaders=content-type;host, Signature=[a-f0-9]{64}$/
    );
  });
});

describe("login captcha enforcement", () => {
  it("consumes the login rate-limit bucket when required captcha proof is missing", async () => {
    const ctx = await createD1TestContext();
    try {
      const kv = new MemoryKvNamespace();
      const app = new Hono<AppEnv>();
      installErrorHandling(app);
      app.route("/api/auth", authRoutes);

      const response = await app.request(
        "http://localhost/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-IPCountry": "CN",
            "CF-Connecting-IP": "203.0.113.20",
            "User-Agent": "vitest"
          },
          body: JSON.stringify({
            email: "missing-captcha@example.com",
            password: "password123"
          })
        },
        {
          ...ctx.env,
          KV: kv as unknown as KVNamespace,
          ENVIRONMENT: "production",
          CAPTCHA_DOMESTIC_PROVIDER: "tencent"
        } as AppBindings
      );

      await expect(response.json()).resolves.toMatchObject({
        error: { code: "FORBIDDEN", message: "Captcha verification failed" }
      });
      expect(response.status).toBe(403);
      expect(kv.findValueByPrefix("rl:login:203.0.113.20:vitest:")).toBe("1");
    } finally {
      await ctx.dispose();
    }
  });
});
