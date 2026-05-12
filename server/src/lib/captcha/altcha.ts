import { appError } from "../errors";
import { logWarn } from "../log";
import { getCaptchaSettings } from "./settings";
import type { AppBindings } from "../../types";

const ALTCHA_ALGORITHM = "SHA-256";
const CHALLENGE_TTL_SECONDS = 10 * 60;
const REPLAY_TTL_SECONDS = CHALLENGE_TTL_SECONDS + 60;
const ALTCHA_MAX_NUMBER = 200_000;
const UTF8 = new TextEncoder();
const SIGNED_SALT_SEPARATOR = "?expires=";

type AltchaChallenge = {
  algorithm: typeof ALTCHA_ALGORITHM;
  challenge: string;
  salt: string;
  signature: string;
  maxnumber: number;
  expires: number;
};

type AltchaPayload = Pick<AltchaChallenge, "algorithm" | "challenge" | "salt" | "signature"> & {
  number: number;
  took?: number;
};

export async function createAltchaChallenge(env: AppBindings): Promise<AltchaChallenge> {
  const hmacKey = getAltchaHmacKey(env);
  if (!hmacKey) {
    logWarn("captcha.altcha_missing_hmac_key");
    throw appError("INTERNAL", "ALTCHA captcha is not configured");
  }
  const settings = await getCaptchaSettings(env);
  const expires = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS;
  const salt = `${base64Url(randomBytes(16))}${SIGNED_SALT_SEPARATOR}${expires}`;
  const maxnumber = settings.altchaDifficulty;
  const number = randomNumber(maxnumber);
  const challenge = await sha256Hex(`${salt}${number}`);
  return {
    algorithm: ALTCHA_ALGORITHM,
    challenge,
    salt,
    signature: await hmacHex(hmacKey, challenge),
    maxnumber,
    expires
  };
}

export async function verifyAltchaCaptcha(env: AppBindings, payload: string): Promise<boolean> {
  const hmacKey = getAltchaHmacKey(env);
  if (!hmacKey) {
    logWarn("captcha.altcha_missing_hmac_key");
    return false;
  }
  const parsed = parsePayload(payload);
  if (!parsed) return false;
  if (parsed.algorithm !== ALTCHA_ALGORITHM) return false;
  if (
    !Number.isSafeInteger(parsed.number) ||
    parsed.number < 0 ||
    parsed.number > ALTCHA_MAX_NUMBER
  ) {
    return false;
  }
  const expires = parseExpires(parsed.salt);
  if (!expires || expires < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expectedSignature = await hmacHex(hmacKey, parsed.challenge);
  if (!timingSafeEqualHex(expectedSignature, parsed.signature)) return false;

  const expectedChallenge = await sha256Hex(`${parsed.salt}${parsed.number}`);
  if (!timingSafeEqualHex(expectedChallenge, parsed.challenge)) return false;

  return consumeAltchaReplayKey(env, parsed);
}

function parsePayload(payload: string): AltchaPayload | null {
  try {
    const decoded = JSON.parse(atob(payload)) as Partial<AltchaPayload>;
    if (
      decoded.algorithm !== ALTCHA_ALGORITHM ||
      typeof decoded.challenge !== "string" ||
      typeof decoded.salt !== "string" ||
      typeof decoded.signature !== "string" ||
      typeof decoded.number !== "number"
    ) {
      return null;
    }
    return decoded as AltchaPayload;
  } catch {
    return null;
  }
}

async function consumeAltchaReplayKey(env: AppBindings, payload: AltchaPayload) {
  if (!env.KV) {
    logWarn("captcha.altcha_missing_kv");
    return false;
  }
  const replayKey = `captcha:altcha:${await sha256Hex(`${payload.challenge}:${payload.signature}`)}`;
  const existing = await env.KV.get(replayKey);
  if (existing) {
    logWarn("captcha.altcha_replay_detected");
    return false;
  }
  await env.KV.put(replayKey, "1", { expirationTtl: REPLAY_TTL_SECONDS });
  return true;
}

function getAltchaHmacKey(env: AppBindings) {
  return env.ALTCHA_HMAC_KEY?.trim() || null;
}

function randomNumber(max: number) {
  const upper = Math.max(1, Math.floor(max));
  const bytes = randomBytes(4);
  const value = new DataView(bytes.buffer).getUint32(0, false);
  return value % (upper + 1);
}

function parseExpires(salt: string) {
  const [, query] = salt.split("?", 2);
  if (!query) return null;
  const expires = Number.parseInt(new URLSearchParams(query).get("expires") ?? "", 10);
  return Number.isInteger(expires) ? expires : null;
}

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", UTF8.encode(value));
  return toHex(new Uint8Array(digest));
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    UTF8.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, UTF8.encode(value));
  return toHex(new Uint8Array(signature));
}

function timingSafeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const left = hexToBytes(a);
  const right = hexToBytes(b);
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

function hexToBytes(value: string) {
  if (value.length % 2 !== 0) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array) {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
