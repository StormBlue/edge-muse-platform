import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatDate, intArg, limitBySource, parseArgs } from "./prompt-cases-collector/cli.mjs";
import {
  assignSortOrders,
  caseKey,
  finalizeCase,
  isUnsafePrompt,
  isValidCase,
  trimPrompt,
  trimText
} from "./prompt-cases-collector/normalize.mjs";
import { ensureSources } from "./prompt-cases-collector/sourceSetup.mjs";
import {
  collectEvoLinkApi,
  collectFreestyle,
  collectGptImage2,
  collectZeroLu,
  parseEvoLinkSiteItems
} from "./prompt-cases-collector/sources.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(scriptDir, "..");
const repoRoot = join(serverRoot, "..");

const args = parseArgs(process.argv.slice(2));
const runId = args.runId ?? formatDate(new Date());
const outRoot = args.out
  ? resolveFromRepo(args.out)
  : join(repoRoot, "uploads", "prompt-cases", runId);
const reportRoot = join(outRoot, "reports");
const seedPath = args.seed ? resolveFromRepo(args.seed) : join(scriptDir, "prompt-cases.seed.json");
const outSeedPath = args.outSeed
  ? resolveFromRepo(args.outSeed)
  : join(reportRoot, "prompt-cases.generated.seed.json");
const maxYouMind = intArg(args.maxYouMind, 240);
const maxEvoLink = intArg(args.maxEvoLink, 360);
const maxFreestyle = intArg(args.maxFreestyle, 780);
const maxZeroLu = intArg(args.maxZeroLu, 160);

const sourceRootA = args.sourceRootA ? resolve(args.sourceRootA) : "/tmp/edge-muse-prompt-sources";
const sourceRootB = args.sourceRootB
  ? resolve(args.sourceRootB)
  : "/tmp/edge-muse-prompt-sources-2";
const siteRoot = args.siteRoot ? resolve(args.siteRoot) : "/tmp/edge-muse-prompt-site";

const sources = {
  gptimage2: join(sourceRootA, "awesome-gptimage2-prompts"),
  evolinkApi: join(sourceRootA, "awesome-gpt-image-2-API-and-Prompts"),
  freestyle: join(sourceRootB, "awesome-gpt-image-2"),
  zeroLu: join(sourceRootB, "awesome-gpt-image"),
  evolinkSite: join(siteRoot, "evolink-gpt-image-2-prompts.html")
};

mkdirSync(reportRoot, { recursive: true });
ensureSources({ sources, sourceRootA, sourceRootB, siteRoot });

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const existingCases = Array.isArray(seed.cases) ? seed.cases : [];
const existingKeys = new Set(existingCases.map(caseKey));
const existingIds = new Set(existingCases.map((item) => item.id));
const nextCases = [...existingCases];
const report = {
  createdAt: new Date().toISOString(),
  runId,
  sources,
  existing: existingCases.length,
  added: 0,
  skippedDuplicate: 0,
  skippedUnsafe: 0,
  skippedInvalid: 0,
  bySource: {},
  siteItemsSeen: parseEvoLinkSiteItems(sources.evolinkSite).length,
  generatedSeed: relativePath(outSeedPath),
  cases: []
};

const collected = [
  ...limitBySource(collectFreestyle(sources.freestyle), maxFreestyle),
  ...limitBySource(collectZeroLu(sources.zeroLu), maxZeroLu),
  ...limitBySource(collectGptImage2(sources.gptimage2), maxYouMind),
  ...limitBySource(collectEvoLinkApi(sources.evolinkApi), maxEvoLink)
];

for (const item of collected) {
  report.bySource[item.sourceRepo] = (report.bySource[item.sourceRepo] ?? 0) + 1;
  if (!isValidCase(item)) {
    report.skippedInvalid += 1;
    continue;
  }
  if (isUnsafePrompt(item.promptTemplate)) {
    report.skippedUnsafe += 1;
    continue;
  }
  const key = caseKey(item);
  if (existingKeys.has(key) || existingIds.has(item.id)) {
    report.skippedDuplicate += 1;
    continue;
  }
  const normalized = {
    ...item,
    title: trimText(item.title, 120),
    promptTemplate: trimPrompt(item.promptTemplate),
    promptSummary: trimText(item.promptSummary, 800),
    status: "published",
    featured: false
  };
  nextCases.push(normalized);
  existingKeys.add(key);
  existingIds.add(normalized.id);
  report.added += 1;
  report.cases.push({
    id: normalized.id,
    title: normalized.title,
    locale: normalized.locale,
    category: normalized.category,
    sourceRepo: normalized.sourceRepo,
    sourceUrl: normalized.sourceUrl,
    thumbnailUrl: normalized.thumbnailUrl
  });
}

const finalCases = assignSortOrders(nextCases.map(finalizeCase));

const output = {
  source: `multi-source prompt cases collected ${new Date().toISOString().slice(0, 10)}`,
  sourceUrl: "https://github.com/gpt-image2/awesome-gptimage2-prompts",
  cases: finalCases
};

writeFileSync(outSeedPath, JSON.stringify(output, null, 2) + "\n");
writeFileSync(join(reportRoot, "collect-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(
  `Collected ${report.added} new prompt cases (${finalCases.length} total in generated seed)`
);
console.log(`Generated seed: ${outSeedPath}`);
console.log(
  `Skipped duplicate=${report.skippedDuplicate}, unsafe=${report.skippedUnsafe}, invalid=${report.skippedInvalid}`
);

function resolveFromRepo(path) {
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\")) return path;
  return join(repoRoot, path);
}

function relativePath(path) {
  return path
    .replace(repoRoot, "")
    .replace(/^[\\/]/, "")
    .replaceAll("\\", "/");
}
