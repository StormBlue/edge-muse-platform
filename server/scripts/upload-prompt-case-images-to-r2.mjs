import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(scriptDir, "..");
const repoRoot = join(serverRoot, "..");
const wranglerBin = join(serverRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const execFileAsync = promisify(execFile);

const args = parseArgs(process.argv.slice(2));
const manifestPath = args.manifest
  ? resolveFromRepo(args.manifest)
  : join(repoRoot, "uploads", "prompt-cases", "2026-05-04-prompt-cases", "reports", "manifest.json");
const bucket = args.bucket ?? "edge-muse-assets";
const prefix = trimSlashes(args.prefix ?? `prompt-cases/${new Date().getUTCFullYear()}`);
const publicBaseUrl = trimTrailingSlash(args.publicBaseUrl ?? "");
const outPath = args.out
  ? resolveFromRepo(args.out)
  : join(dirname(manifestPath), "r2-upload-mapping.json");
const dryRun = Boolean(args.dryRun);
const remote = args.local ? "--local" : "--remote";
const retries = Number.isFinite(Number(args.retries)) ? Math.max(1, Number(args.retries)) : 5;
const progressEvery = Number.isFinite(Number(args.progressEvery)) ? Math.max(1, Number(args.progressEvery)) : 50;
const concurrency = Number.isFinite(Number(args.concurrency)) ? Math.max(1, Number(args.concurrency)) : 1;

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
  concurrency,
  success: 0,
  failed: 0,
  items: []
};

let completed = 0;

await runPool(downloaded, concurrency, async (item) => {
  const localPath = resolveFromRepo(item.localPath);
  const objectKey = `${prefix}/${categoryPathSegment(item.category)}/${basename(localPath)}`;
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
      await runWithRetries([
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
      ]);
    }
    result.status = dryRun ? "dry-run" : "uploaded";
    mapping.success += 1;
  } catch (error) {
    result.status = "failed";
    result.error = commandErrorMessage(error);
    mapping.failed += 1;
  }
  mapping.items.push(result);
  completed += 1;
  if (completed % progressEvery === 0 || completed === downloaded.length) {
    console.log(`${dryRun ? "Prepared" : "Uploaded"} ${completed}/${downloaded.length}`);
  }
});

mapping.items.sort((left, right) => (left.objectKey || "").localeCompare(right.objectKey || ""));

mkdirSync(dirname(outPath), { recursive: true });
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
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\")) return path;
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

function categoryPathSegment(value) {
  const explicit = {
    "人像与摄影": "portrait-photography",
    "商品与广告": "product-advertising",
    "海报与插画": "poster-illustration",
    "角色与世界观": "character-worldbuilding",
    "UI 与社媒截图": "ui-social-screenshots",
    "信息图与知识卡": "infographics-knowledge-cards",
    "视频感关键帧": "cinematic-keyframes",
    "摄影写实与胶片": "photoreal-film",
    "商品广告与营销": "product-marketing",
    "电商商品展示": "ecommerce-products",
    "食品餐饮广告": "food-restaurant-ads",
    "Logo 与品牌系统": "logo-brand-identity",
    "海报与字体设计": "poster-typography",
    "插画艺术与风格化": "illustration-stylized-art",
    "古典历史与国风": "classical-chinese-history",
    "角色设定与参考图": "character-reference-sheets",
    "IP 角色与世界观": "character-worldbuilding",
    "UI 界面与产品图": "ui-product-screens",
    "聊天与社交截图": "chat-social-screenshots",
    "直播与短视频界面": "live-short-video-screens",
    "信息图表与数据": "infographics-data",
    "知识卡片与科普": "knowledge-science-cards",
    "文档排版与出版": "document-publication-layout",
    "电影分镜与关键帧": "cinematic-storyboard-keyframes",
    "游戏与娱乐场景": "game-entertainment-scenes",
    "建筑空间与室内": "architecture-interiors",
    "社交媒体截图": "social-media-screenshots"
  };
  return explicit[String(value ?? "").trim()] ?? slugify(value || "uncategorized");
}

function slugify(value) {
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{ASCII}]/gu, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "uncategorized";
}

async function runWithRetries(args) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await execFileAsync(process.execPath, args, { cwd: serverRoot, maxBuffer: 1024 * 1024 * 8 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      const delayMs = Math.min(5000, 500 * attempt);
      await new Promise((resolveTimer) => setTimeout(resolveTimer, delayMs));
    }
  }
  throw lastError;
}

async function runPool(items, maxConcurrent, worker) {
  let index = 0;
  const runners = Array.from({ length: maxConcurrent }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function commandErrorMessage(error) {
  if (!error || typeof error !== "object") return String(error);
  const stderr = "stderr" in error && error.stderr ? String(error.stderr) : "";
  const stdout = "stdout" in error && error.stdout ? String(error.stdout) : "";
  const message = error instanceof Error ? error.message : String(error);
  return [message, stderr, stdout].filter(Boolean).join("\n").trim();
}
