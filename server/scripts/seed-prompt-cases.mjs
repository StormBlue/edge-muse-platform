import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(scriptDir, "..");
const seedPath = join(scriptDir, "prompt-cases.seed.json");
const wranglerBin = join(serverRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const timestamp = Date.now();
const remoteArg = process.argv.includes("--remote") ? "--remote" : "--local";

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

// 种子案例走 UPSERT：可重复执行，便于本地演示和远端首批案例发布。
const command = `
INSERT INTO prompt_cases (
  id, title, category, modes, recommended_size, tags, prompt_template, prompt_summary,
  thumbnail_url, source_url, source_author, source_license, source_repo, popularity,
  status, featured, sort_order, locale, created_by, updated_by, created_at, updated_at
) VALUES
${seed.cases.map(toRow).join(",\n")}
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

const tmp = mkdtempSync(join(tmpdir(), "edge-muse-prompt-cases-"));
const sqlPath = join(tmp, "seed-prompt-cases.sql");

try {
  writeFileSync(sqlPath, command, "utf8");
  execFileSync(
    process.execPath,
    [wranglerBin, "d1", "execute", "edge-muse", remoteArg, "--file", sqlPath],
    {
      cwd: serverRoot,
      stdio: "inherit"
    }
  );
  console.log(`Seeded ${seed.cases.length} prompt cases from ${seed.source}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
