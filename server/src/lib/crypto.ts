/**
 * 业务密钥加密：AES-GCM，`KEY_ENCRYPTION_KEY` 派生 32 字节密钥；用于 `provider_keys.encrypted_key`。
 * `sha256Hex` 供 R2 对象去重指纹。
 */
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  randomBytes,
  toArrayBuffer,
  utf8ToBytes
} from "./encoding";

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(utf8ToBytes(secret)));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** 明文 API Key → 入库 `iv.ciphertext` Base64 串 */
export async function encryptString(plainText: string, secret: string): Promise<string> {
  if (!secret || secret.length < 16) {
    throw new Error("KEY_ENCRYPTION_KEY must be at least 16 characters");
  }
  const iv = randomBytes(12);
  const key = await deriveAesKey(secret);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(utf8ToBytes(plainText))
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

/** 调用第三方前解密；失败抛错由上层记日志 */
export async function decryptString(payload: string, secret: string): Promise<string> {
  const [ivRaw, cipherRaw] = payload.split(".");
  if (!ivRaw || !cipherRaw) throw new Error("Invalid encrypted payload");
  const key = await deriveAesKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(ivRaw)) },
    key,
    toArrayBuffer(base64ToBytes(cipherRaw))
  );
  return bytesToUtf8(new Uint8Array(plain));
}

/** 计算二进制 SHA-256 十六进制，用于 `image_objects.sha256` 去重 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
