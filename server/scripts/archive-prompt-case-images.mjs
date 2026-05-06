import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(scriptDir, "..");
const repoRoot = join(scriptDir, "..", "..");
const defaultSeedPath = join(scriptDir, "prompt-cases.seed.json");
const defaultOutRoot = join(repoRoot, "uploads", "prompt-cases");
const wranglerBin = join(serverRoot, "node_modules", "wrangler", "bin", "wrangler.js");

const args = parseArgs(process.argv.slice(2));
const seedPath = args.seed ? resolveFromRepo(args.seed) : defaultSeedPath;
const outRoot = args.out ? resolveFromRepo(args.out) : defaultOutRoot;
const runId = args.runId ?? formatDate(new Date());
const archiveRoot = join(outRoot, runId);
const originalImageRoot = join(archiveRoot, "originals");
const imageRoot = join(archiveRoot, "images");
const backupRoot = join(archiveRoot, "backup");
const reportRoot = join(archiveRoot, "reports");
const proxy = typeof args.proxy === "string" ? args.proxy : null;
const retries = Number.isFinite(Number(args.retries)) ? Number(args.retries) : 8;
const useCurl = Boolean(args.curl);
const shouldCompressWebp = Boolean(args.webp);
const webpQuality = Number.isFinite(Number(args.webpQuality)) ? Number(args.webpQuality) : 90;
const squooshNode = typeof args.squooshNode === "string" ? args.squooshNode : process.execPath;
const squooshCache = args.squooshCache ? resolveFromRepo(args.squooshCache) : join(archiveRoot, ".squoosh-npm-cache");
const keepSquooshCache = Boolean(args.keepSquooshCache);
const remote = Boolean(args.remote);
const remoteArg = args.local ? "--local" : "--remote";
const database = args.database ?? "edge-muse";

const seed = remote ? null : JSON.parse(readFileSync(seedPath, "utf8"));
const cases = remote ? loadRemotePromptCases() : Array.isArray(seed.cases) ? seed.cases : [];

mkdirSync(originalImageRoot, { recursive: true });
mkdirSync(imageRoot, { recursive: true });
mkdirSync(backupRoot, { recursive: true });
mkdirSync(reportRoot, { recursive: true });
if (seed) {
  writeFileSync(join(backupRoot, "prompt-cases.seed.json"), JSON.stringify(seed, null, 2) + "\n");
} else {
  writeFileSync(join(backupRoot, "prompt-cases.remote.json"), JSON.stringify({ cases }, null, 2) + "\n");
}

const manifest = {
  createdAt: new Date().toISOString(),
  sourceKind: remote ? "remote-d1" : "seed",
  seedPath: remote ? null : relative(repoRoot, seedPath).replaceAll("\\", "/"),
  database: remote ? database : null,
  source: seed?.source ?? null,
  sourceUrl: seed?.sourceUrl ?? null,
  webp: shouldCompressWebp
    ? {
        quality: webpQuality,
        encoder: "squoosh-cli"
      }
    : null,
  total: cases.length,
  success: 0,
  failed: 0,
  items: []
};

for (const item of cases) {
  const originalUrl = item.thumbnailUrl ?? null;
  const categorySlug = slugify(item.category || "uncategorized");
  const originalCaseDir = join(originalImageRoot, categorySlug);
  const caseDir = join(imageRoot, categorySlug);
  mkdirSync(originalCaseDir, { recursive: true });
  mkdirSync(caseDir, { recursive: true });

  const result = {
    id: item.id,
    title: item.title,
    category: item.category,
    sortOrder: item.sortOrder,
    originalUrl,
    status: "skipped",
    originalLocalPath: null,
    originalContentType: null,
    originalByteSize: 0,
    originalSha256: null,
    localPath: null,
    contentType: null,
    byteSize: 0,
    sha256: null,
    error: null
  };

  if (!originalUrl) {
    result.error = "thumbnailUrl is empty";
    manifest.failed += 1;
    manifest.items.push(result);
    continue;
  }

  try {
    const downloadUrl = normalizeDownloadUrl(originalUrl);
    const download =
      proxy || useCurl
        ? downloadWithCurl(downloadUrl, proxy)
        : await downloadWithFetch(downloadUrl).catch(() => downloadWithCurl(downloadUrl, proxy));
    const contentType = download.contentType;
    const buffer = download.buffer;
    const ext = extensionFromContentType(contentType) ?? extensionFromUrl(originalUrl) ?? ".bin";
    const filename = `${String(item.sortOrder ?? 0).padStart(4, "0")}-${item.id}${ext}`;
    const originalLocalPath = join(originalCaseDir, filename);
    writeFileSync(originalLocalPath, buffer);

    result.originalLocalPath = relative(repoRoot, originalLocalPath).replaceAll("\\", "/");
    result.originalContentType = contentType;
    result.originalByteSize = buffer.length;
    result.originalSha256 = createHash("sha256").update(buffer).digest("hex");

    const finalPath = shouldCompressWebp
      ? compressToWebp(originalLocalPath, caseDir, { quality: webpQuality })
      : copyOriginalToImageRoot(buffer, caseDir, filename);
    const finalBuffer = readFileSync(finalPath);

    result.status = "downloaded";
    result.localPath = relative(repoRoot, finalPath).replaceAll("\\", "/");
    result.contentType = shouldCompressWebp ? "image/webp" : contentType;
    result.byteSize = finalBuffer.length;
    result.sha256 = createHash("sha256").update(finalBuffer).digest("hex");
    manifest.success += 1;
  } catch (error) {
    result.status = "failed";
    result.error = error instanceof Error ? error.message : String(error);
    manifest.failed += 1;
  }
  manifest.items.push(result);
}

writeFileSync(join(reportRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(reportRoot, "manifest.csv"), toCsv(manifest.items));
writeFileSync(join(archiveRoot, "README.md"), renderReadme(manifest));
if (shouldCompressWebp && !keepSquooshCache) {
  rmSync(squooshCache, { recursive: true, force: true });
}

console.log(`Archived ${manifest.success}/${manifest.total} prompt case images`);
console.log(`Archive root: ${archiveRoot}`);
if (proxy) console.log(`Proxy: ${proxy}`);
if (manifest.failed) {
  console.log(`Failed or skipped: ${manifest.failed}. See reports/manifest.json`);
}

function loadRemotePromptCases() {
  const sql = `
SELECT id,
       title,
       category,
       sort_order AS sortOrder,
       thumbnail_url AS thumbnailUrl
FROM prompt_cases
WHERE thumbnail_url IS NOT NULL
  AND thumbnail_url <> ''
ORDER BY sort_order ASC, id ASC;
`;
  const output = execFileSync(
    process.execPath,
    [wranglerBin, "d1", "execute", database, remoteArg, "--json", "--command", sql],
    { cwd: serverRoot, encoding: "utf8", stdio: "pipe" }
  );
  const parsed = JSON.parse(output);
  const rows = parsed.flatMap((chunk) => chunk.results ?? []);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    sortOrder: row.sortOrder,
    thumbnailUrl: row.thumbnailUrl
  }));
}

async function downloadWithFetch(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; EdgeMusePromptCaseArchiver/1.0; +https://example.local)"
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: normalizeContentType(response.headers.get("content-type"))
  };
}

function downloadWithCurl(url, proxyUrl) {
  const tmp = mkdtempSync(join(tmpdir(), "edge-muse-case-image-"));
  const bodyPath = join(tmp, "image");
  const headerPath = join(tmp, "headers.txt");
  try {
    execFileSync(
      "curl.exe",
      [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--max-time",
        "90",
        "--connect-timeout",
        "30",
        "--retry",
        String(retries),
        "--retry-all-errors",
        "--retry-delay",
        "1",
        "--ssl-no-revoke",
        "--http1.1",
        "--tlsv1.2",
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 EdgeMusePromptCaseArchiver/1.0",
        "--dump-header",
        headerPath,
        "--output",
        bodyPath,
        ...(proxyUrl ? ["--proxy", proxyUrl] : []),
        url
      ],
      { stdio: "pipe" }
    );
    return {
      buffer: readFileSync(bodyPath),
      contentType: normalizeContentType(readContentType(headerPath))
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function normalizeDownloadUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname === "pbs.twimg.com" && !url.searchParams.has("format")) {
      const ext = extensionFromUrl(value)?.replace(".", "");
      if (ext) url.searchParams.set("format", ext === "jpeg" ? "jpg" : ext);
      url.searchParams.set("name", "large");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function copyOriginalToImageRoot(buffer, caseDir, filename) {
  const targetPath = join(caseDir, filename);
  writeFileSync(targetPath, buffer);
  return targetPath;
}

function compressToWebp(inputPath, outputDir, { quality }) {
  mkdirSync(squooshCache, { recursive: true });
  const nodeDir = dirname(squooshNode);
  const npxCli = join(nodeDir, "node_modules", "npm", "bin", "npx-cli.js");
  if (!existsSync(npxCli)) {
    throw new Error(`Cannot find npm npx-cli.js next to squoosh node: ${npxCli}`);
  }
  const oldPath = process.env.PATH ?? "";
  try {
    process.env.PATH = `${nodeDir};${oldPath}`;
    execFileSync(
      squooshNode,
      [
        npxCli,
        "--cache",
        squooshCache,
        "-p",
        "@squoosh/cli",
        "squoosh-cli",
        "--output-dir",
        outputDir,
        "--webp",
        JSON.stringify({ quality }),
        inputPath
      ],
      { cwd: repoRoot, stdio: "pipe" }
    );
  } finally {
    process.env.PATH = oldPath;
  }
  const outputPath = findSquooshWebpOutput(inputPath, outputDir);
  if (!outputPath) {
    throw new Error(`Squoosh did not produce a WebP file for ${inputPath}`);
  }
  return outputPath;
}

function findSquooshWebpOutput(inputPath, outputDir) {
  const inputName = basenameWithoutExtension(inputPath);
  const candidates = [
    join(outputDir, `${inputName}.webp`),
    join(outputDir, `${inputName}-${inputName}.webp`),
    `${inputPath}.webp`,
    join(dirname(inputPath), `${inputName}.webp`)
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const files = [...getFiles(outputDir), ...getFiles(dirname(inputPath))]
    .filter((file) => file.toLowerCase().endsWith(".webp"))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  const latest = files[0] ?? null;
  if (!latest) return null;
  const target = join(outputDir, `${inputName}.webp`);
  if (resolve(latest) !== resolve(target)) {
    writeFileSync(target, readFileSync(latest));
    return target;
  }
  return latest;
}

function getFiles(dir) {
  try {
    return execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Get-ChildItem -LiteralPath ${JSON.stringify(dir)} -File | Select-Object -ExpandProperty FullName`
    ], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readContentType(headerPath) {
  const headers = readFileSync(headerPath, "utf8").split(/\r?\n/).reverse();
  const contentType = headers.find((line) => /^content-type:/i.test(line));
  return contentType?.split(":").slice(1).join(":").trim() ?? null;
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

function formatDate(date) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ];
  return parts.join("");
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

function normalizeContentType(value) {
  if (!value) return null;
  return value.split(";")[0]?.trim().toLowerCase() || null;
}

function extensionFromContentType(contentType) {
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  if (contentType === "image/svg+xml") return ".svg";
  return null;
}

function extensionFromUrl(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    const match = pathname.match(/\.(jpg|jpeg|png|webp|gif|svg)$/);
    if (!match) return null;
    const ext = extname(match[0]) || match[0];
    return ext === ".jpeg" ? ".jpg" : ext;
  } catch {
    return null;
  }
}

function basenameWithoutExtension(path) {
  const name = path.split(/[\\/]/).pop() ?? path;
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

function toCsv(items) {
  const headers = [
    "id",
    "title",
    "category",
    "sortOrder",
    "status",
    "originalLocalPath",
    "originalContentType",
    "originalByteSize",
    "originalSha256",
    "localPath",
    "contentType",
    "byteSize",
    "sha256",
    "originalUrl",
    "error"
  ];
  const rows = [headers, ...items.map((item) => headers.map((header) => item[header] ?? ""))];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value) {
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function renderReadme(summary) {
  const categories = new Map();
  for (const item of summary.items) {
    categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
  }
  const categoryLines = [...categories.entries()]
    .sort(([left], [right]) => String(left).localeCompare(String(right), "zh-CN"))
    .map(([category, count]) => `- ${category}: ${count}`)
    .join("\n");

  return `# Prompt Case Image Archive

- Created at: ${summary.createdAt}
- Source: ${summary.sourceKind}
- Backup: ${summary.sourceKind === "remote-d1" ? "backup/prompt-cases.remote.json" : "backup/prompt-cases.seed.json"}
- WebP: ${summary.webp ? `Squoosh quality ${summary.webp.quality}` : "disabled"}
- Images: images/<category>/<sortOrder>-<caseId>.<ext>
- Originals: originals/<category>/<sortOrder>-<caseId>.<ext>
- Manifest: reports/manifest.json
- CSV: reports/manifest.csv

## Summary

- Total: ${summary.total}
- Downloaded: ${summary.success}
- Failed or skipped: ${summary.failed}

## Categories

${categoryLines}
`;
}
