/**
 * 密码存储：PBKDF2-SHA256 + 随机盐，串内嵌参数；`verifyPassword` 使用 `timingSafeEqual` 防时序旁路。
 */
import { base64ToBytes, bytesToBase64, randomBytes, toArrayBuffer, utf8ToBytes } from "./encoding";

const PASSWORD_ALGORITHM = "pbkdf2-sha256";
const PBKDF2_PARAMS = {
  iterations: 100_000,
  saltLength: 16,
  dkLen: 32
};
const MAX_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_DK_LEN = 64;

/** 生成可持久化的编码串，写入 `users.password_hash` */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PBKDF2_PARAMS.saltLength);
  const hash = await derivePbkdf2(password, salt, PBKDF2_PARAMS.iterations, PBKDF2_PARAMS.dkLen);
  return `${PASSWORD_ALGORITHM}$v=1$i=${PBKDF2_PARAMS.iterations},l=${PBKDF2_PARAMS.dkLen}$${bytesToBase64(
    salt
  )}$${bytesToBase64(hash)}`;
}

/** 登录时比对；格式不合法或参数越界直接 false */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 5 || parts[0] !== PASSWORD_ALGORITHM || parts[1] !== "v=1") {
    return false;
  }
  const [, , paramsRaw, saltRaw, expectedRaw] = parts;
  const params = parseParams(paramsRaw);
  const iterations = params.i;
  const dkLen = params.l;
  if (!isSafePbkdf2Params(iterations, dkLen)) return false;
  try {
    const expected = base64ToBytes(expectedRaw);
    if (expected.length !== dkLen) return false;
    const actual = await derivePbkdf2(password, base64ToBytes(saltRaw), iterations, dkLen);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function derivePbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  dkLen: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(utf8ToBytes(password)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations
    },
    key,
    dkLen * 8
  );
  return new Uint8Array(bits);
}

function parseParams(raw: string): Record<string, number> {
  return Object.fromEntries(
    raw.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, Number(value)];
    })
  );
}

function isSafePbkdf2Params(iterations?: number, dkLen?: number): boolean {
  return (
    Number.isInteger(iterations) &&
    Number.isInteger(dkLen) &&
    typeof iterations === "number" &&
    typeof dkLen === "number" &&
    iterations > 0 &&
    iterations <= MAX_PBKDF2_ITERATIONS &&
    dkLen > 0 &&
    dkLen <= MAX_PBKDF2_DK_LEN
  );
}

/** 常量时间比较；JWT 签名校验等复用 */
export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}
