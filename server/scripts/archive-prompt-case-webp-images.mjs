import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, extname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");

const args = parseArgs(process.argv.slice(2));
const seedPath = args.seed ? resolveFromRepo(args.seed) : join(scriptDir, "prompt-cases.seed.json");
const outRoot = args.out ? resolveFromRepo(args.out) : join(repoRoot, "uploads", "prompt-cases");
const runId = args.runId ?? formatDate(new Date());
const archiveRoot = join(outRoot, runId);
const sourceRoot = join(archiveRoot, "source-images");
const imageRoot = join(archiveRoot, "images");
const reportRoot = join(archiveRoot, "reports");
const quality = intArg(args.quality, 90);
const usePillow = Boolean(args.pillow);
const python = args.python ?? "python3";
const maxConcurrent = Math.max(1, intArg(args.concurrency, 8));
const downloadRetries = intArg(args.retries, 8);
const downloadTimeoutMs = intArg(args.timeoutMs, 20_000);
const resume = Boolean(args.resume);
const keepVenv = Boolean(args.keepVenv);
const pillowVersion = args.pillowVersion ?? "11.3.0";

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const cases = Array.isArray(seed.cases) ? seed.cases : [];
const venvDir = usePillow ? mkdtempSync(join(tmpdir(), "edge-muse-pillow-venv-")) : null;

mkdirSync(sourceRoot, { recursive: true });
mkdirSync(imageRoot, { recursive: true });
mkdirSync(reportRoot, { recursive: true });

const manifest = {
  createdAt: new Date().toISOString(),
  seedPath: relativePath(seedPath),
  source: seed.source ?? null,
  sourceUrl: seed.sourceUrl ?? null,
  runId,
  quality,
  downloadRetries,
  downloadTimeoutMs,
  resume,
  converter: usePillow ? "pillow" : detectConverter(),
  total: cases.length,
  success: 0,
  failed: 0,
  items: []
};

try {
  if (usePillow) installPillow();
  await runPool(cases, maxConcurrent, async (item) => {
    const result = {
      id: item.id,
      title: item.title,
      category: item.category,
      sortOrder: item.sortOrder,
      originalUrl: item.thumbnailUrl ?? null,
      status: "pending",
      localPath: null,
      sourcePath: null,
      contentType: "image/webp",
      byteSize: 0,
      sha256: null,
      error: null
    };
    try {
      if (!item.thumbnailUrl) throw new Error("thumbnailUrl is empty");
      const categorySlug = slugify(item.category || "uncategorized");
      const caseDir = join(imageRoot, categorySlug);
      const sourceDir = join(sourceRoot, categorySlug);
      mkdirSync(caseDir, { recursive: true });
      mkdirSync(sourceDir, { recursive: true });
      const filenameBase = `${String(item.sortOrder ?? 0).padStart(6, "0")}-${item.id}`;
      const sourcePath = join(sourceDir, `${filenameBase}${extensionFromUrl(item.thumbnailUrl) ?? ".img"}`);
      const localPath = join(caseDir, `${filenameBase}.webp`);
      if (!canReuseWebp(localPath)) {
        await acquireImage(item.thumbnailUrl, sourcePath);
        convertToWebp(sourcePath, localPath);
      }
      const bytes = readFileSync(localPath);
      result.status = "downloaded";
      result.localPath = relativePath(localPath);
      result.sourcePath = existsSync(sourcePath) ? relativePath(sourcePath) : null;
      result.byteSize = bytes.length;
      result.sha256 = createHash("sha256").update(bytes).digest("hex");
      manifest.success += 1;
    } catch (error) {
      result.status = "failed";
      result.error = error instanceof Error ? error.message : String(error);
      manifest.failed += 1;
    }
    manifest.items.push(result);
  });
  manifest.items.sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
  writeFileSync(join(reportRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(reportRoot, "manifest.csv"), toCsv(manifest.items));
  writeFileSync(join(archiveRoot, "README.md"), renderReadme(manifest));
  console.log(`Archived ${manifest.success}/${manifest.total} prompt case images as WebP`);
  console.log(`Archive root: ${archiveRoot}`);
  if (manifest.failed) {
    console.log(`Failed: ${manifest.failed}. See reports/manifest.json`);
    process.exitCode = 1;
  }
} finally {
  if (venvDir && !keepVenv) rmSync(venvDir, { recursive: true, force: true });
}

async function acquireImage(value, outPath) {
  if (isLocalPath(value)) {
    const local = resolveFromRepo(value);
    if (!existsSync(local)) throw new Error(`Local image not found: ${local}`);
    copyFileSync(local, outPath);
    return;
  }
  const response = await fetchWithRetry(value, downloadRetries);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("Downloaded image is empty");
  writeFileSync(outPath, buffer);
}

async function fetchWithRetry(url, retries) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), downloadTimeoutMs);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; EdgeMusePromptCaseArchiver/2.0)"
        }
      });
      clearTimeout(timeout);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    } catch (error) {
      lastError = error?.name === "AbortError" ? new Error(`Download timed out after ${downloadTimeoutMs}ms`) : error;
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 500 * (attempt + 1)));
  }
  throw lastError ?? new Error("Download failed");
}

function canReuseWebp(path) {
  if (!resume || !existsSync(path)) return false;
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size < 12) return false;
    const header = readFileSync(path).subarray(0, 12).toString("ascii");
    return header.startsWith("RIFF") && header.endsWith("WEBP");
  } catch {
    return false;
  }
}

function convertToWebp(inputPath, outputPath) {
  if (usePillow) {
    execFileSync(pillowPython(), [pillowScriptPath(), inputPath, outputPath, String(quality)], {
      stdio: "pipe"
    });
    return;
  }
  const converter = manifest.converter;
  if (converter === "cwebp") {
    execFileSync("cwebp", ["-quiet", "-q", String(quality), inputPath, "-o", outputPath], { stdio: "pipe" });
    return;
  }
  if (converter === "magick") {
    execFileSync("magick", [inputPath, "-quality", String(quality), outputPath], { stdio: "pipe" });
    return;
  }
  throw new Error("No WebP converter available. Re-run with --pillow to use a temporary Pillow venv.");
}

function installPillow() {
  execFileSync(python, ["-m", "venv", venvDir], { stdio: "inherit" });
  execFileSync(pillowPython(), ["-m", "pip", "install", "--upgrade", "pip"], { stdio: "inherit" });
  execFileSync(pillowPython(), ["-m", "pip", "install", `Pillow==${pillowVersion}`], {
    stdio: "inherit"
  });
  writeFileSync(
    pillowScriptPath(),
    `from PIL import Image
import sys
src, dst, quality = sys.argv[1], sys.argv[2], int(sys.argv[3])
with Image.open(src) as im:
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    if im.mode == "RGBA":
        background = Image.new("RGBA", im.size, (255, 255, 255, 255))
        background.alpha_composite(im)
        im = background.convert("RGB")
    im.save(dst, "WEBP", quality=quality, method=6)
`
  );
}

function pillowPython() {
  return join(venvDir, "bin", "python");
}

function pillowScriptPath() {
  return join(venvDir, "convert_webp.py");
}

function detectConverter() {
  if (commandExists("cwebp")) return "cwebp";
  if (commandExists("magick")) return "magick";
  return "none";
}

function commandExists(command) {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function runPool(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function isLocalPath(value) {
  return !/^https?:\/\//i.test(String(value));
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
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolveFromRepo(path) {
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\")) return path;
  return join(repoRoot, path);
}

function relativePath(path) {
  return path.replace(repoRoot, "").replace(/^[\\/]/, "").replaceAll("\\", "/");
}

function extensionFromUrl(value) {
  const pathname = isLocalPath(value) ? value : new URL(value).pathname;
  const ext = extname(pathname.split("?")[0]).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"].includes(ext)) return ext;
  return null;
}

function slugify(value) {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "uncategorized"
  );
}

function toCsv(items) {
  const headers = [
    "id",
    "title",
    "category",
    "sortOrder",
    "status",
    "localPath",
    "sourcePath",
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
  const totalBytes = summary.items.reduce((total, item) => total + (Number(item.byteSize) || 0), 0);
  return `# Prompt Case WebP Image Archive

- Created at: ${summary.createdAt}
- Seed: ${summary.seedPath}
- Images: images/<category>/<sortOrder>-<caseId>.webp
- Source images: source-images/<category>/<sortOrder>-<caseId>.<ext>
- Manifest: reports/manifest.json
- CSV: reports/manifest.csv

## Summary

- Total: ${summary.total}
- Converted: ${summary.success}
- Failed: ${summary.failed}
- Quality: ${summary.quality}
- Converter: ${summary.converter}
- Output bytes: ${totalBytes}

## Categories

${categoryLines}
`;
}

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
}
