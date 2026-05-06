import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(scriptDir, "..");
const repoRoot = join(serverRoot, "..");
const args = parseArgs(process.argv.slice(2));
const seedPath = args.seed ? resolveFromRepo(args.seed) : join(scriptDir, "prompt-cases.seed.json");
const wranglerBin = join(serverRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const timestamp = Date.now();
const remoteArg = args.remote ? "--remote" : "--local";
const batchSize = Math.max(1, intArg(args.batchSize ?? args["batch-size"], 10));
const statementsPerFile = Math.max(
  1,
  intArg(args.statementsPerFile ?? args["statements-per-file"], args.remote ? 20 : 1)
);
const retries = Math.max(1, intArg(args.retries, 3));
const quiet = Boolean(args.quiet);
const progressEvery = Math.max(1, intArg(args.progressEvery ?? args["progress-every"], 1));

const seed = JSON.parse(readFileSync(seedPath, "utf8"));

function sql(value) {
  return String(value ?? "").replaceAll("'", "''");
}

function nullable(value) {
  return value === null || value === undefined || value === "" ? "NULL" : `'${sql(value)}'`;
}

function json(value) {
  return `'${sql(JSON.stringify(value))}'`;
}

function toRow(item) {
  return `(
  '${sql(item.id)}',
  '${sql(item.title)}',
  '${sql(item.category)}',
  ${json(item.modes)},
  '${sql(item.recommendedSize)}',
  ${json(item.tags)},
  '${sql(item.promptTemplate)}',
  '${sql(item.promptSummary)}',
  ${nullable(item.thumbnailUrl)},
  ${nullable(item.sourceUrl)},
  ${nullable(item.sourceAuthor)},
  '${sql(item.sourceLicense)}',
  ${nullable(item.sourceRepo)},
  ${json(item.popularity ?? {})},
  '${sql(item.status)}',
  ${item.featured ? 1 : 0},
  ${Number(item.sortOrder) || 0},
  '${sql(item.locale)}',
  NULL,
  NULL,
  ${timestamp},
  ${timestamp}
)`;
}

function renderCommand(items) {
  // 种子案例走 UPSERT：可重复执行，便于本地演示和远端首批案例发布。
  return `
INSERT INTO prompt_cases (
  id, title, category, modes, recommended_size, tags, prompt_template, prompt_summary,
  thumbnail_url, source_url, source_author, source_license, source_repo, popularity,
  status, featured, sort_order, locale, created_by, updated_by, created_at, updated_at
) VALUES
${items.map(toRow).join(",\n")}
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  category = excluded.category,
  modes = excluded.modes,
  recommended_size = excluded.recommended_size,
  tags = excluded.tags,
  prompt_template = excluded.prompt_template,
  prompt_summary = excluded.prompt_summary,
  thumbnail_url = excluded.thumbnail_url,
  source_url = excluded.source_url,
  source_author = excluded.source_author,
  source_license = excluded.source_license,
  source_repo = excluded.source_repo,
  popularity = excluded.popularity,
  status = excluded.status,
  featured = excluded.featured,
  sort_order = excluded.sort_order,
  locale = excluded.locale,
  updated_at = excluded.updated_at;
`;
}

const tmp = mkdtempSync(join(tmpdir(), "edge-muse-prompt-cases-"));

try {
  const cases = Array.isArray(seed.cases) ? seed.cases : [];
  let fileNumber = 0;
  for (let index = 0; index < cases.length; index += batchSize * statementsPerFile) {
    fileNumber += 1;
    const fileStart = index;
    const commands = [];
    for (
      let statementIndex = index;
      statementIndex < Math.min(index + batchSize * statementsPerFile, cases.length);
      statementIndex += batchSize
    ) {
      commands.push(renderCommand(cases.slice(statementIndex, statementIndex + batchSize)));
    }
    const sqlPath = join(tmp, `seed-prompt-cases-${fileNumber}.sql`);
    writeFileSync(sqlPath, commands.join("\n"), "utf8");
    executeD1File(sqlPath);
    const fileEnd = Math.min(index + batchSize * statementsPerFile, cases.length);
    if (fileNumber % progressEvery === 0 || fileEnd >= cases.length) {
      console.log(`Seeded prompt case batch ${fileStart + 1}-${fileEnd}/${cases.length}`);
    }
  }
  console.log(`Seeded ${cases.length} prompt cases from ${seed.source ?? seedPath}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function executeD1File(sqlPath) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      execFileSync(
        process.execPath,
        [wranglerBin, "d1", "execute", "edge-muse", remoteArg, "--file", sqlPath],
        {
          cwd: serverRoot,
          stdio: quiet ? "pipe" : "inherit"
        }
      );
      return;
    } catch (error) {
      lastError = error;
      if (quiet) printCommandOutput(error);
      if (attempt >= retries) break;
      console.warn(`D1 batch failed, retrying ${attempt + 1}/${retries}...`);
      sleep(1000 * attempt);
    }
  }
  throw lastError;
}

function intArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function printCommandOutput(error) {
  for (const output of [error.stdout, error.stderr]) {
    const text = output?.toString?.();
    if (text) process.stderr.write(text);
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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

function resolveFromRepo(path) {
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\")) return path;
  return join(repoRoot, path);
}
