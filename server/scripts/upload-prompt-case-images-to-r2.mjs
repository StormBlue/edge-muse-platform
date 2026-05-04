import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(scriptDir, "..");
const repoRoot = join(serverRoot, "..");
const wranglerBin = join(serverRoot, "node_modules", "wrangler", "bin", "wrangler.js");

const args = parseArgs(process.argv.slice(2));
const manifestPath = args.manifest
  ? resolveFromRepo(args.manifest)
  : join(repoRoot, "uploads", "prompt-cases", "2026-05-04-prompt-cases", "reports", "manifest.json");
const bucket = args.bucket ?? "edge-muse-images";
const prefix = trimSlashes(args.prefix ?? "public/prompt-cases/2026-05-04");
const publicBaseUrl = trimTrailingSlash(args.publicBaseUrl ?? "");
const outPath = args.out
  ? resolveFromRepo(args.out)
  : join(dirname(manifestPath), "r2-upload-mapping.json");
const dryRun = Boolean(args.dryRun);
const remote = args.local ? "--local" : "--remote";

if (!publicBaseUrl) {
  throw new Error(
    "Missing --publicBaseUrl. Use the public R2/custom-domain base URL that should appear in seed thumbnailUrl values."
  );
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const downloaded = (manifest.items ?? []).filter((item) => item.status === "downloaded");
const mapping = {
  createdAt: new Date().toISOString(),
  bucket,
  prefix,
  publicBaseUrl,
  sourceManifest: relativePath(manifestPath),
  dryRun,
  total: downloaded.length,
  success: 0,
  failed: 0,
  items: []
};

for (const item of downloaded) {
  const localPath = resolveFromRepo(item.localPath);
  const objectKey = `${prefix}/${slugify(item.category || "uncategorized")}/${basename(localPath)}`;
  const publicUrl = `${publicBaseUrl}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const result = {
    id: item.id,
    title: item.title,
    category: item.category,
    originalUrl: item.originalUrl,
    localPath: item.localPath,
    objectKey,
    publicUrl,
    contentType: item.contentType,
    byteSize: item.byteSize,
    sha256: item.sha256,
    status: "pending",
    error: null
  };

  try {
    if (!dryRun) {
      execFileSync(
        process.execPath,
        [
          wranglerBin,
          "r2",
          "object",
          "put",
          `${bucket}/${objectKey}`,
          remote,
          "--file",
          localPath,
          "--content-type",
          item.contentType ?? "application/octet-stream",
          "--cache-control",
          "public, max-age=31536000, immutable"
        ],
        { cwd: serverRoot, stdio: "pipe" }
      );
    }
    result.status = dryRun ? "dry-run" : "uploaded";
    mapping.success += 1;
  } catch (error) {
    result.status = "failed";
    result.error = commandErrorMessage(error);
    mapping.failed += 1;
  }
  mapping.items.push(result);
}

writeFileSync(outPath, JSON.stringify(mapping, null, 2) + "\n");

console.log(`${dryRun ? "Prepared" : "Uploaded"} ${mapping.success}/${mapping.total} prompt case images`);
console.log(`Mapping: ${outPath}`);
if (mapping.failed) {
  console.log(`Failed: ${mapping.failed}`);
  process.exitCode = 1;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function resolveFromRepo(path) {
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\")) return path;
  return join(repoRoot, path);
}

function relativePath(path) {
  return path.replace(repoRoot, "").replace(/^[\\/]/, "").replaceAll("\\", "/");
}

function trimSlashes(value) {
  return String(value).replace(/^\/+|\/+$/g, "");
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/g, "");
}

function slugify(value) {
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "uncategorized";
}

function commandErrorMessage(error) {
  if (!error || typeof error !== "object") return String(error);
  const stderr = "stderr" in error && error.stderr ? String(error.stderr) : "";
  const stdout = "stdout" in error && error.stdout ? String(error.stdout) : "";
  const message = error instanceof Error ? error.message : String(error);
  return [message, stderr, stdout].filter(Boolean).join("\n").trim();
}
