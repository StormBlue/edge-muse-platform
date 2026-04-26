import { execFileSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { stdin, stdout } from "node:process";

const encoder = new TextEncoder();
const timestamp = Date.now();
const email = (process.env.SYSADMIN_EMAIL ?? "sysadmin@example.com").trim().toLowerCase();
const username = (process.env.SYSADMIN_USERNAME ?? "sysadmin").trim();
const nickname = (process.env.SYSADMIN_NICKNAME ?? "System Admin").trim();
const password = process.env.SYSADMIN_PASSWORD ?? (await promptHidden("Sysadmin password: "));

if (!email || !username || !nickname)
  throw new Error("Sysadmin email, username, and nickname are required");
if (password.length < 8) throw new Error("Sysadmin password must be at least 8 characters");

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  webcrypto.getRandomValues(bytes);
  return bytes;
}

async function hashPassword(value) {
  const salt = randomBytes(16);
  const params = { iterations: 120_000, dkLen: 32 };
  const key = await webcrypto.subtle.importKey("raw", encoder.encode(value), "PBKDF2", false, [
    "deriveBits"
  ]);
  const hash = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: params.iterations },
    key,
    params.dkLen * 8
  );
  return `pbkdf2-sha256$v=1$i=${params.iterations},l=${params.dkLen}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(hash))}`;
}

function sql(value) {
  return String(value).replaceAll("'", "''");
}

async function promptHidden(prompt) {
  if (!stdin.isTTY) throw new Error("Set SYSADMIN_PASSWORD when running without a TTY");
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  return new Promise((resolve) => {
    const onData = (char) => {
      if (char === "\u0003") {
        cleanup();
        stdout.write("\n");
        process.exit(130);
      }
      if (char === "\r" || char === "\n" || char === "\u0004") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

const passwordHash = await hashPassword(password);
const command = `
INSERT INTO users (
  id, email, username, password_hash, nickname, role, created_by, preferred_provider_key_id, locale, status, created_at, updated_at, last_login_at
) VALUES (
  'usr_sysadmin', '${sql(email)}', '${sql(username)}', '${sql(passwordHash)}', '${sql(nickname)}', 'sysadmin', NULL, NULL, 'zh-CN', 'active', ${timestamp}, ${timestamp}, NULL
)
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  username = excluded.username,
  password_hash = excluded.password_hash,
  nickname = excluded.nickname,
  role = 'sysadmin',
  status = 'active',
  updated_at = excluded.updated_at;

INSERT OR IGNORE INTO quotas (user_id, allocated_quota, used_quota, updated_at)
VALUES ('usr_sysadmin', NULL, 0, ${timestamp});
`;

execFileSync("wrangler", ["d1", "execute", "edge-muse", "--remote", "--command", command], {
  cwd: new URL("..", import.meta.url),
  stdio: "inherit"
});

console.log(`Ensured remote sysadmin exists: ${email} / ${username}`);
