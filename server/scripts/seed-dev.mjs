import { execFileSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { argon2id } from "@noble/hashes/argon2.js";

const encoder = new TextEncoder();

const keySecret = process.env.KEY_ENCRYPTION_KEY ?? "local-development-key-material";
const timestamp = Date.now();

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function utf8(value) {
  return encoder.encode(value);
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  webcrypto.getRandomValues(bytes);
  return bytes;
}

async function deriveAesKey(secret) {
  const digest = await webcrypto.subtle.digest("SHA-256", utf8(secret));
  return webcrypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
}

async function encryptString(plainText, secret) {
  const iv = randomBytes(12);
  const key = await deriveAesKey(secret);
  const cipher = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8(plainText));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const params = { t: 3, m: 16384, p: 1, dkLen: 32 };
  const hash = argon2id(utf8(password), salt, params);
  return `argon2id$v=1$t=${params.t},m=${params.m},p=${params.p}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

function sql(value) {
  return String(value).replaceAll("'", "''");
}

const encryptedKey = await encryptString("mock-local-key", keySecret);
const passwordHash = hashPassword("password123");

const command = `
INSERT OR IGNORE INTO users (
  id, email, username, password_hash, nickname, role, created_by, preferred_provider_key_id, locale, status, created_at, updated_at, last_login_at
) VALUES (
  'usr_sysadmin', 'sysadmin@example.com', 'sysadmin', '${sql(passwordHash)}', 'System Admin', 'sysadmin', NULL, 'key_mock', 'zh-CN', 'active', ${timestamp}, ${timestamp}, NULL
);

INSERT OR IGNORE INTO quotas (user_id, allocated_quota, used_quota, updated_at)
VALUES ('usr_sysadmin', NULL, 0, ${timestamp});

INSERT OR IGNORE INTO providers (
  id, name, base_url, default_model, request_format, supported_sizes, enabled, created_at, updated_at
) VALUES (
  'prv_mock', 'Local Mock Provider', 'mock:', 'gpt-image-2', 'openai_compatible',
  '["1024x1024","1024x1536","1536x1024","auto"]', 1, ${timestamp}, ${timestamp}
);

	INSERT OR IGNORE INTO provider_keys (
	  id, provider_id, label, model, encrypted_key, key_hint, allocated_quota, used_quota, owner_admin_id, enabled, created_at, updated_at
	) VALUES (
	  'key_mock', 'prv_mock', 'Local Mock Key', 'gpt-image-2', '${sql(encryptedKey)}', 'mock', NULL, 0, NULL, 1, ${timestamp}, ${timestamp}
	);

INSERT OR IGNORE INTO user_provider_keys (user_id, provider_key_id, assigned_at)
VALUES ('usr_sysadmin', 'key_mock', ${timestamp});
`;

execFileSync(
  "pnpm",
  ["wrangler", "d1", "execute", "edge-muse", "--local", "--command", command],
  {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit"
  }
);

console.log("Seeded local sysadmin: sysadmin or sysadmin@example.com / password123");
