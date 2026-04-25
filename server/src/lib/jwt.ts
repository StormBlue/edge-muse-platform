import {
  base64UrlDecode,
  base64UrlEncode,
  bytesToUtf8,
  randomBytes,
  toArrayBuffer,
  utf8ToBytes
} from "./encoding";
import { timingSafeEqual } from "./password";
import type { UserRole } from "../types";

export type TokenKind = "access" | "refresh";

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  type: TokenKind;
  jti: string;
  iat: number;
  exp: number;
};

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(utf8ToBytes(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, toArrayBuffer(utf8ToBytes(data)));
  return new Uint8Array(signature);
}

export async function signJwt(
  secret: string,
  payload: Omit<JwtPayload, "iat" | "exp" | "jti">,
  ttlSeconds: number
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    jti: base64UrlEncode(randomBytes(16))
  };
  const header = base64UrlEncode(utf8ToBytes(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64UrlEncode(utf8ToBytes(JSON.stringify(fullPayload)));
  const signed = `${header}.${body}`;
  const signature = base64UrlEncode(await hmac(secret, signed));
  return `${signed}.${signature}`;
}

export async function verifyJwt(
  secret: string,
  token: string,
  expectedType?: TokenKind
): Promise<JwtPayload> {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) throw new Error("Malformed token");
  const expected = await hmac(secret, `${header}.${body}`);
  if (!timingSafeEqual(expected, base64UrlDecode(signature))) throw new Error("Invalid signature");
  const payload = JSON.parse(bytesToUtf8(base64UrlDecode(body))) as JwtPayload;
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  if (expectedType && payload.type !== expectedType) throw new Error("Unexpected token type");
  return payload;
}
