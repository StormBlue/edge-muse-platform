import { appError } from "../errors";
import { logWarn } from "../log";
import { getCaptchaSettings } from "./settings";
import type { AppBindings } from "../../types";
import type { CaptchaRegion } from "./types";

const ALTCHA_ALGORITHM = "SHA-256";
const ALTCHA_HMAC_ALGORITHM = "SHA-256";
const CHALLENGE_TTL_SECONDS = 10 * 60;
const REPLAY_TTL_SECONDS = CHALLENGE_TTL_SECONDS + 60;
const ALTCHA_MAX_NUMBER = 200_000;
const ALTCHA_KEY_LENGTH = 32;
const HEX_32_RE = /^[a-f0-9]{32}$/i;
const HEX_64_RE = /^[a-f0-9]{64}$/i;
const UTF8 = new TextEncoder();

type AltchaChallenge = {
  parameters: AltchaChallengeParameters;
  signature: string;
};

type AltchaChallengeParameters = {
  algorithm: typeof ALTCHA_ALGORITHM;
  cost: 1;
  data: {
    difficulty: number;
  };
  expiresAt: number;
  keyLength: typeof ALTCHA_KEY_LENGTH;
  keyPrefix: string;
  nonce: string;
  salt: string;
};

type AltchaPayload = {
  challenge: AltchaChallenge;
  solution: {
    counter: number;
    derivedKey: string;
    time?: number;
  };
};

type AltchaPayloadV1 = {
  algorithm: typeof ALTCHA_ALGORITHM;
  challenge: string;
  number: number;
  salt: string;
  signature: string;
  took?: number;
};

export async function createAltchaChallenge(
  env: AppBindings,
  region: CaptchaRegion
): Promise<AltchaChallenge> {
  const hmacKey = getAltchaHmacKey(env);
  if (!hmacKey) {
    logWarn("captcha.altcha_missing_hmac_key");
    throw appError("INTERNAL", "ALTCHA captcha is not configured");
  }
  const settings = await getCaptchaSettings(env);
  const difficulty =
    region === "domestic" ? settings.domesticAltchaDifficulty : settings.overseasAltchaDifficulty;
  const expires = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS;
  const number = randomNumber(difficulty);
  const parameters = await createChallengeParameters(difficulty, number, expires);
  return signAltchaChallenge(parameters, hmacKey);
}

async function createChallengeParameters(
  difficulty: number,
  counter: number,
  expiresAt: number
): Promise<AltchaChallengeParameters> {
  const parameters: AltchaChallengeParameters = {
    algorithm: ALTCHA_ALGORITHM,
    cost: 1,
    data: { difficulty },
    expiresAt,
    keyLength: ALTCHA_KEY_LENGTH,
    keyPrefix: "",
    nonce: toHex(randomBytes(16)),
    salt: toHex(randomBytes(16))
  };
  const derivedKey = await deriveShaKey(parameters, counter);
  parameters.keyPrefix = toHex(derivedKey);
  return sortKeys(parameters) as AltchaChallengeParameters;
}

export async function verifyAltchaCaptcha(env: AppBindings, payload: string): Promise<boolean> {
  const hmacKey = getAltchaHmacKey(env);
  if (!hmacKey) {
    logWarn("captcha.altcha_missing_hmac_key");
    return false;
  }
  const parsed = parsePayload(payload);
  if (!parsed) return false;
  if (isPayloadV1(parsed)) {
    return verifyAltchaCaptchaV1(env, hmacKey, parsed);
  }
  if (!isPayload(parsed)) return false;
  if (!isChallengeParameters(parsed.challenge.parameters)) return false;
  if (!isSolution(parsed.solution)) return false;
  if (parsed.challenge.parameters.expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expectedSignature = await hmacHex(hmacKey, canonicalJson(parsed.challenge.parameters));
  if (!timingSafeEqualHex(expectedSignature, parsed.challenge.signature)) return false;

  const derivedKey = await deriveShaKey(parsed.challenge.parameters, parsed.solution.counter);
  if (!timingSafeEqualHex(toHex(derivedKey), parsed.solution.derivedKey)) return false;
  if (!timingSafeEqualHex(parsed.solution.derivedKey, parsed.challenge.parameters.keyPrefix)) {
    return false;
  }
  if (parsed.solution.counter > parsed.challenge.parameters.data.difficulty) return false;

  return consumeAltchaReplayKey(
    env,
    parsed.challenge.signature,
    parsed.challenge.parameters.expiresAt
  );
}

async function verifyAltchaCaptchaV1(env: AppBindings, hmacKey: string, payload: AltchaPayloadV1) {
  if (
    !Number.isSafeInteger(payload.number) ||
    payload.number < 0 ||
    payload.number > ALTCHA_MAX_NUMBER
  ) {
    return false;
  }
  const expires = parseExpires(payload.salt);
  if (!expires || expires < Math.floor(Date.now() / 1000)) return false;

  const expectedSignature = await hmacHex(hmacKey, payload.challenge);
  if (!timingSafeEqualHex(expectedSignature, payload.signature)) return false;

  const expectedChallenge = await sha256Hex(`${payload.salt}${payload.number}`);
  if (!timingSafeEqualHex(expectedChallenge, payload.challenge)) return false;

  return consumeAltchaReplayKey(env, payload.signature, expires);
}

function parsePayload(payload: string): unknown {
  try {
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

async function consumeAltchaReplayKey(env: AppBindings, signature: string, expiresAt: number) {
  const replayHash = await sha256Hex(signature);
  if (env.TASK_ROOM) {
    const replayId = env.TASK_ROOM.idFromName(`captcha:altcha:${replayHash}`);
    return env.TASK_ROOM.get(replayId).consumeCaptchaReplayKey(expiresAt);
  }
  if (!env.KV) {
    logWarn("captcha.altcha_missing_kv");
    return false;
  }
  const replayKey = `captcha:altcha:${replayHash}`;
  const existing = await env.KV.get(replayKey);
  if (existing) {
    logWarn("captcha.altcha_replay_detected");
    return false;
  }
  const ttl = Math.max(60, expiresAt - Math.floor(Date.now() / 1000) + 60);
  await env.KV.put(replayKey, "1", { expirationTtl: Math.min(REPLAY_TTL_SECONDS, ttl) });
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

function isPayload(value: unknown): value is AltchaPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<AltchaPayload>;
  return Boolean(
    payload.challenge &&
    typeof payload.challenge === "object" &&
    typeof payload.challenge.signature === "string" &&
    payload.solution &&
    typeof payload.solution === "object"
  );
}

function isPayloadV1(value: unknown): value is AltchaPayloadV1 {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<AltchaPayloadV1>;
  return (
    payload.algorithm === ALTCHA_ALGORITHM &&
    typeof payload.challenge === "string" &&
    typeof payload.salt === "string" &&
    typeof payload.signature === "string" &&
    typeof payload.number === "number"
  );
}

function isChallengeParameters(value: unknown): value is AltchaChallengeParameters {
  if (!value || typeof value !== "object") return false;
  const parameters = value as Partial<AltchaChallengeParameters>;
  const difficulty = parameters.data?.difficulty;
  if (typeof difficulty !== "number" || !Number.isSafeInteger(difficulty)) return false;
  return (
    parameters.algorithm === ALTCHA_ALGORITHM &&
    parameters.cost === 1 &&
    difficulty >= 10_000 &&
    difficulty <= ALTCHA_MAX_NUMBER &&
    Number.isSafeInteger(parameters.expiresAt) &&
    parameters.keyLength === ALTCHA_KEY_LENGTH &&
    typeof parameters.keyPrefix === "string" &&
    HEX_64_RE.test(parameters.keyPrefix) &&
    typeof parameters.nonce === "string" &&
    HEX_32_RE.test(parameters.nonce) &&
    typeof parameters.salt === "string" &&
    HEX_32_RE.test(parameters.salt)
  );
}

function isSolution(value: unknown): value is AltchaPayload["solution"] {
  if (!value || typeof value !== "object") return false;
  const solution = value as Partial<AltchaPayload["solution"]>;
  const counter = solution.counter;
  if (typeof counter !== "number" || !Number.isSafeInteger(counter)) return false;
  return (
    counter >= 0 &&
    counter <= ALTCHA_MAX_NUMBER &&
    typeof solution.derivedKey === "string" &&
    HEX_64_RE.test(solution.derivedKey)
  );
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

async function deriveShaKey(parameters: AltchaChallengeParameters, counter: number) {
  const digest = await crypto.subtle.digest(
    ALTCHA_ALGORITHM,
    concatBytes(
      hexToBytesStrict(parameters.salt),
      concatBytes(hexToBytesStrict(parameters.nonce), uint32Bytes(counter))
    )
  );
  return new Uint8Array(digest).slice(0, parameters.keyLength);
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    UTF8.encode(secret),
    { name: "HMAC", hash: ALTCHA_HMAC_ALGORITHM },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, UTF8.encode(value));
  return toHex(new Uint8Array(signature));
}

async function signAltchaChallenge(
  parameters: AltchaChallengeParameters,
  hmacKey: string
): Promise<AltchaChallenge> {
  return {
    parameters,
    signature: await hmacHex(hmacKey, canonicalJson(parameters))
  };
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

function hexToBytesStrict(value: string) {
  const bytes = hexToBytes(value);
  if (!bytes) throw new Error("Invalid hex value");
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

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) acc[key] = sortKeys(child);
      return acc;
    }, {});
}
