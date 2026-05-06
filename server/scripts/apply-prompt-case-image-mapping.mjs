import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const serverRoot = join(scriptDir, "..");
const defaultSeedPath = join(scriptDir, "prompt-cases.seed.json");
const wranglerBin = join(serverRoot, "node_modules", "wrangler", "bin", "wrangler.js");

const args = parseArgs(process.argv.slice(2));
if (!args.mapping) {
  throw new Error("Usage: node scripts/apply-prompt-case-image-mapping.mjs --mapping <mapping.json>");
}

const seedPath = args.seed ? resolveFromRepo(args.seed) : defaultSeedPath;
const mappingPath = resolveFromRepo(args.mapping);
const outPath = args.out ? resolveFromRepo(args.out) : seedPath;
const dryRun = Boolean(args.dryRun);
const remote = Boolean(args.remote);
const remoteArg = args.local ? "--local" : "--remote";
const database = args.database ?? "edge-muse";

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
const urlsById = readUrlsById(mapping);
let changed = 0;
const missing = [];

for (const item of seed.cases ?? []) {
  const nextUrl = urlsById.get(item.id);
  if (!nextUrl) {
    missing.push(item.id);
    continue;
  }
  if (item.thumbnailUrl !== nextUrl) {
    item.thumbnailUrl = nextUrl;
    changed += 1;
  }
}

if (!dryRun) {
  writeFileSync(outPath, JSON.stringify(seed, null, 2) + "\n");
  if (remote) {
    applyRemoteMapping(urlsById);
  }
}

console.log(`${dryRun ? "Would update" : "Updated"} ${changed} seed prompt case thumbnail URLs`);
if (remote && !dryRun) console.log(`Updated remote D1 prompt case thumbnail URLs: ${urlsById.size}`);
console.log(`Mapping entries: ${urlsById.size}`);
if (missing.length) {
  console.log(`Seed cases without mapping: ${missing.length}`);
  console.log(missing.join("\n"));
  process.exitCode = 1;
}

function readUrlsById(mapping) {
  const items = Array.isArray(mapping) ? mapping : mapping.items;
  if (!Array.isArray(items)) throw new Error("Mapping must be an array or an object with an items array");
  const urls = new Map();
  for (const item of items) {
    const id = item.id ?? item.caseId;
    const url = item.thumbnailUrl ?? item.publicUrl ?? item.url ?? item.newUrl;
    if (!id || !url || item.status === "failed") continue;
    urls.set(id, url);
  }
  return urls;
}

function applyRemoteMapping(urlsById) {
  const tmp = mkdtempSync(join(tmpdir(), "edge-muse-prompt-case-mapping-"));
  const sqlPath = join(tmp, "prompt-case-image-mapping.sql");
  try {
    const statements = [...urlsById.entries()].map(
      ([id, url]) => `UPDATE prompt_cases SET thumbnail_url = '${sql(url)}', updated_at = ${Date.now()} WHERE id = '${sql(id)}';`
    );
    writeFileSync(sqlPath, `${statements.join("\n")}\n`, "utf8");
    execFileSync(
      process.execPath,
      [wranglerBin, "d1", "execute", database, remoteArg, "--file", sqlPath],
      { cwd: serverRoot, stdio: "inherit" }
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
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

function sql(value) {
  return String(value ?? "").replaceAll("'", "''");
}
