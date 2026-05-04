import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const defaultSeedPath = join(scriptDir, "prompt-cases.seed.json");
const defaultOutRoot = join(repoRoot, "uploads", "prompt-cases");

const args = parseArgs(process.argv.slice(2));
const seedPath = args.seed ? resolveFromRepo(args.seed) : defaultSeedPath;
const outRoot = args.out ? resolveFromRepo(args.out) : defaultOutRoot;
const runId = args.runId ?? formatDate(new Date());
const archiveRoot = join(outRoot, runId);
const imageRoot = join(archiveRoot, "images");
const backupRoot = join(archiveRoot, "backup");
const reportRoot = join(archiveRoot, "reports");
const proxy = typeof args.proxy === "string" ? args.proxy : null;
const retries = Number.isFinite(Number(args.retries)) ? Number(args.retries) : 8;

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const cases = Array.isArray(seed.cases) ? seed.cases : [];

mkdirSync(imageRoot, { recursive: true });
mkdirSync(backupRoot, { recursive: true });
mkdirSync(reportRoot, { recursive: true });
writeFileSync(join(backupRoot, "prompt-cases.seed.json"), JSON.stringify(seed, null, 2) + "\n");

const manifest = {
  createdAt: new Date().toISOString(),
  seedPath: relative(repoRoot, seedPath).replaceAll("\\", "/"),
  source: seed.source ?? null,
  sourceUrl: seed.sourceUrl ?? null,
  total: cases.length,
  success: 0,
  failed: 0,
  items: []
};

for (const item of cases) {
  const originalUrl = item.thumbnailUrl ?? null;
  const categorySlug = slugify(item.category || "uncategorized");
  const caseDir = join(imageRoot, categorySlug);
  mkdirSync(caseDir, { recursive: true });

  const result = {
    id: item.id,
    title: item.title,
    category: item.category,
    sortOrder: item.sortOrder,
    originalUrl,
    status: "skipped",
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
    const download = proxy
      ? downloadWithCurl(originalUrl, proxy)
      : await downloadWithFetch(originalUrl);
    const contentType = download.contentType;
    const buffer = download.buffer;
    const ext = extensionFromContentType(contentType) ?? extensionFromUrl(originalUrl) ?? ".bin";
    const filename = `${String(item.sortOrder ?? 0).padStart(4, "0")}-${item.id}${ext}`;
    const localPath = join(caseDir, filename);
    writeFileSync(localPath, buffer);

    result.status = "downloaded";
    result.localPath = relative(repoRoot, localPath).replaceAll("\\", "/");
    result.contentType = contentType;
    result.byteSize = buffer.length;
    result.sha256 = createHash("sha256").update(buffer).digest("hex");
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

console.log(`Archived ${manifest.success}/${manifest.total} prompt case images`);
console.log(`Archive root: ${archiveRoot}`);
if (proxy) console.log(`Proxy: ${proxy}`);
if (manifest.failed) {
  console.log(`Failed or skipped: ${manifest.failed}. See reports/manifest.json`);
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
        "--proxy",
        proxyUrl,
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 EdgeMusePromptCaseArchiver/1.0",
        "--dump-header",
        headerPath,
        "--output",
        bodyPath,
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

function toCsv(items) {
  const headers = [
    "id",
    "title",
    "category",
    "sortOrder",
    "status",
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
- Seed backup: backup/prompt-cases.seed.json
- Images: images/<category>/<sortOrder>-<caseId>.<ext>
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
