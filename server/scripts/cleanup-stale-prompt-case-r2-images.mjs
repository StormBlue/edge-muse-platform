import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(scriptDir, "..");
const repoRoot = join(serverRoot, "..");
const args = parseArgs(process.argv.slice(2));

const accountId = args.accountId ?? args["account-id"] ?? readWranglerAccountId();
const bucket = args.bucket ?? "edge-muse-assets";
const prefix = args.prefix ?? "prompt-cases/2026/05/";
const mappingPath = resolveFromRepo(
  args.mapping ?? "uploads/prompt-cases/2026-05-06-prompt-cases/reports/r2-upload-mapping.merged.json"
);
const outPath = args.out ? resolveFromRepo(args.out) : null;
const retries = intArg(args.retries, 5);
const concurrency = intArg(args.concurrency, 4);
const dryRun = !args.delete;
const token = readWranglerOAuthToken();

const expectedKeys = readExpectedKeys(mappingPath);
const remoteKeys = await listRemoteKeys();
const staleKeys = remoteKeys.filter((key) => !expectedKeys.has(key));

const report = {
  bucket,
  prefix,
  mappingPath,
  expected: expectedKeys.size,
  remote: remoteKeys.length,
  stale: staleKeys.length,
  dryRun,
  staleKeys
};

writeReport(report);

console.log(
  JSON.stringify(
    {
      bucket,
      prefix,
      expected: expectedKeys.size,
      remote: remoteKeys.length,
      stale: staleKeys.length,
      dryRun
    },
    null,
    2
  )
);

if (dryRun || staleKeys.length === 0) {
  if (staleKeys.length > 0) console.log(staleKeys.slice(0, 50).join("\n"));
  process.exit(0);
}

let deleted = 0;
const failures = [];
await runPool(staleKeys, concurrency, async (key) => {
  try {
    await deleteRemoteKey(key);
    deleted += 1;
    if (deleted % 25 === 0 || deleted === staleKeys.length) {
      console.log(`Deleted stale prompt-case image ${deleted}/${staleKeys.length}`);
    }
  } catch (error) {
    failures.push({ key, error: error.message });
  }
});

if (failures.length > 0) {
  writeReport({ ...report, deleted, failed: failures.length, failures });
  console.error(JSON.stringify({ deleted, failed: failures.length, failures: failures.slice(0, 20) }, null, 2));
  process.exitCode = 1;
} else {
  writeReport({ ...report, deleted, failed: 0 });
  console.log(`Deleted ${deleted} stale prompt-case images.`);
}

function readExpectedKeys(path) {
  const mapping = JSON.parse(readFileSync(path, "utf8"));
  const items = Array.isArray(mapping.items) ? mapping.items : [];
  const keys = new Set();
  for (const item of items) {
    const key = item.key ?? item.objectKey ?? publicUrlToKey(item.publicUrl);
    if (key?.startsWith(prefix)) keys.add(key);
  }
  return keys;
}

async function listRemoteKeys() {
  const keys = [];
  let cursor = null;
  do {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects`
    );
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("per_page", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const json = await cloudflareFetchJson(url, { method: "GET" });
    const result = json.result ?? {};
    const resultInfo = json.result_info ?? {};
    const objects = result.objects ?? result.items ?? result;
    if (Array.isArray(objects)) {
      for (const object of objects) {
        const key = object.key ?? object.name;
        if (key?.startsWith(prefix)) keys.push(key);
      }
    }
    cursor = resultInfo.cursor ?? result.cursor ?? result.next_cursor ?? result.cursor_next ?? null;
    if (!resultInfo.is_truncated && !result.is_truncated) cursor = null;
  } while (cursor);
  return keys.sort();
}

async function deleteRemoteKey(key) {
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${encodedKey}`
  );
  await cloudflareFetchJson(url, { method: "DELETE" });
}

async function cloudflareFetchJson(url, init) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "edge-muse-prompt-case-cleanup/1.0",
          ...init.headers
        }
      });
      const text = await response.text();
      const json = text ? JSON.parse(text) : {};
      if (!response.ok || json.success === false) {
        throw new Error(`Cloudflare API ${response.status}: ${text.slice(0, 500)}`);
      }
      return json;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

function readWranglerOAuthToken() {
  const text = readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8");
  const match = text.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("Wrangler OAuth token not found. Run wrangler login first.");
  return match[1];
}

function readWranglerAccountId() {
  return process.env.CLOUDFLARE_ACCOUNT_ID ?? "c7896724989bebf1e5ecf90c219210b2";
}

function publicUrlToKey(url) {
  if (!url) return null;
  return String(url).replace(/^https:\/\/assets\.pinkteck\.com\//, "");
}

async function runPool(items, limit, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function intArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function resolveFromRepo(path) {
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\")) return path;
  return join(repoRoot, path);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeReport(value) {
  if (outPath) writeFileSync(outPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
