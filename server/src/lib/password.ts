import { argon2id } from "@noble/hashes/argon2.js";
import { base64ToBytes, bytesToBase64, randomBytes, utf8ToBytes } from "./encoding";

const ARGON_PARAMS = {
  t: 3,
  m: 16384,
  p: 1,
  dkLen: 32
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = argon2id(utf8ToBytes(password), salt, ARGON_PARAMS);
  return `argon2id$v=1$t=${ARGON_PARAMS.t},m=${ARGON_PARAMS.m},p=${ARGON_PARAMS.p}$${bytesToBase64(
    salt
  )}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 5 || parts[0] !== "argon2id") return false;
  const [, , paramsRaw, saltRaw, expectedRaw] = parts;
  const params = Object.fromEntries(
    paramsRaw.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, Number(value)];
    })
  ) as { t: number; m: number; p: number };
  const actual = argon2id(utf8ToBytes(password), base64ToBytes(saltRaw), {
    ...params,
    dkLen: base64ToBytes(expectedRaw).length
  });
  return timingSafeEqual(actual, base64ToBytes(expectedRaw));
}

export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}
