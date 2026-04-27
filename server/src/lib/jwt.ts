/**
 * 极简 JWT（HS256）：access 短时 + refresh 长时，jti 用于登出黑名单。
 * 使用 Web Crypto 与 `password.timingSafeEqual` 防时序攻击。
 */
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

/**
 * 自定义 claims（与 Cookie 中的 access/refresh 对应）：
 * - `sub`：用户 id；`email`/`role`：鉴权后挂到 Hono context；
 * - `type`：必须与预期一致，防 refresh 当 access 用；
 * - `jti`：单次 refresh 的 id，可进黑名单实现登出；
 * - `iat`/`exp`：秒级 Unix 时间戳。
 */
export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  type: TokenKind;
  jti: string;
  iat: number;
  exp: number;
};

/** HMAC-SHA256 对 `header.body` 片段签名，输出原始字节；验签时与 `signature` 段比对 */
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

/** 签发 JWT：自动填充 iat/exp/jti */
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
    jti: base64UrlEncode(randomBytes(16)) // 每发一枚 refresh/access 各带独立 jti
  };
  // JWT 标准三段式：对「头部+负载」的 UTF-8 做 HMAC，签名再 base64url
  const header = base64UrlEncode(utf8ToBytes(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64UrlEncode(utf8ToBytes(JSON.stringify(fullPayload)));
  const signed = `${header}.${body}`;
  const signature = base64UrlEncode(await hmac(secret, signed));
  return `${signed}.${signature}`;
}

/**
 * 验签并校验过期时间与 token 类型；签名或结构错误抛 Error（由中间件转 401）。
 */
export async function verifyJwt(
  secret: string,
  token: string,
  expectedType?: TokenKind
): Promise<JwtPayload> {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) throw new Error("Malformed token");
  // 1) 用同 secret 重算 HMAC，与 `password.timingSafeEqual` 防侧信道
  const expected = await hmac(secret, `${header}.${body}`);
  if (!timingSafeEqual(expected, base64UrlDecode(signature))) throw new Error("Invalid signature");
  // 2) 解析 JSON；exp 在服务端再次校验，防时钟漂移以客户端为准
  const payload = JSON.parse(bytesToUtf8(base64UrlDecode(body))) as JwtPayload;
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  // 3) refresh 路由应传 expectedType: "refresh"，防误用 access
  if (expectedType && payload.type !== expectedType) throw new Error("Unexpected token type");
  return payload;
}
