import { Hono } from "hono";
import { createAltchaChallenge, getPublicCaptchaConfig } from "../src/lib/captcha";
import { resolveCaptchaRegion } from "../src/lib/captcha/region";
import { installErrorHandling } from "../src/middleware/error";
import { consumeRateLimit } from "../src/middleware/rateLimit";
import type { AppEnv } from "../src/types";

export class MemoryKvNamespace {
  private readonly values = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    for (const [key, value] of Object.entries(initial ?? {})) {
      this.values.set(key, value);
    }
  }

  get(key: string) {
    const prefixMatch = this.findPrefixValueForKey(key);
    if (prefixMatch !== null) return Promise.resolve(prefixMatch);
    return Promise.resolve(this.values.get(key) ?? null);
  }

  put(key: string, value: string) {
    this.values.set(key, value);
    return Promise.resolve();
  }

  findValueByPrefix(prefix: string) {
    for (const [key, value] of this.values.entries()) {
      if (key.startsWith(prefix)) return value;
    }
    return null;
  }

  private findPrefixValueForKey(key: string) {
    for (const [storedKey, value] of this.values.entries()) {
      if (key.startsWith(storedKey)) return value;
    }
    return null;
  }
}

export class MemoryDurableReplayNamespace {
  private readonly values = new Set<string>();

  idFromName(name: string) {
    return name;
  }

  get(id: string) {
    return {
      consumeCaptchaReplayKey: async () => {
        if (this.values.has(id)) return false;
        this.values.add(id);
        return true;
      }
    };
  }
}

type TestAltchaChallenge = Awaited<ReturnType<typeof createAltchaChallenge>>;

export async function solveAltchaChallenge(challenge: TestAltchaChallenge) {
  for (let counter = 0; counter <= challenge.parameters.data.difficulty; counter += 1) {
    const derivedKey = await deriveShaKey(challenge.parameters, counter);
    if (derivedKey === challenge.parameters.keyPrefix) {
      return { counter, derivedKey, time: 0 };
    }
  }
  throw new Error("ALTCHA challenge was not solved in test");
}

export function createWidgetV3Payload(
  challenge: TestAltchaChallenge,
  solution: { counter: number; derivedKey: string; time?: number } = {
    counter: 0,
    derivedKey: challenge.parameters.keyPrefix,
    time: 0
  }
) {
  return btoa(
    JSON.stringify({
      challenge,
      solution
    })
  );
}

export async function createLegacyAltchaPayload(secret: string) {
  const salt = `legacy-salt?expires=${Math.floor(Date.now() / 1000) + 600}`;
  const number = 7;
  const challenge = await sha256Hex(`${salt}${number}`);
  return btoa(
    JSON.stringify({
      algorithm: "SHA-256",
      challenge,
      number,
      salt,
      signature: await hmacHex(secret, challenge),
      took: 0
    })
  );
}

export function createAltchaChallengeApp() {
  const app = new Hono<AppEnv>();
  installErrorHandling(app);
  app.get("/api/captcha/altcha/challenge", (c) =>
    consumeRateLimit(c, { prefix: "captcha:altcha", limit: 60, windowSeconds: 60 }).then(
      async () => {
        const captcha = await getPublicCaptchaConfig(c.env, resolveCaptchaRegion(c));
        if (captcha.provider !== "altcha") {
          return c.json(
            { error: { code: "FORBIDDEN", message: "ALTCHA captcha is not enabled" } },
            403
          );
        }
        return c.json(await createAltchaChallenge(c.env, resolveCaptchaRegion(c)));
      }
    )
  );
  return app;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deriveShaKey(parameters: TestAltchaChallenge["parameters"], counter: number) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    concatBytes(
      hexToBytes(parameters.salt),
      concatBytes(hexToBytes(parameters.nonce), uint32Bytes(counter))
    )
  );
  return [...new Uint8Array(digest).slice(0, parameters.keyLength)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const output = new Uint8Array(left.length + right.length);
  output.set(left, 0);
  output.set(right, left.length);
  return output;
}

function uint32Bytes(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
