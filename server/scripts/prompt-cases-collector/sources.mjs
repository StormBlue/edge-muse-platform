import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanAuthor,
  englishTitle,
  extractFirstCodeBlock,
  firstImage,
  firstSource,
  freestyleCategory,
  inferCategoryFromPrompt,
  localeSuffix,
  makeCase,
  resolveSourceImage,
  slugify,
  splitBilingualPrompt,
  stripMarkdown,
  zeroLuCategory,
  zhTitle
} from "./normalize.mjs";

function collectEvoLinkApi(root) {
  const pairs = [
    ["portrait", "人像与摄影"],
    ["ecommerce", "商品与广告"],
    ["ad-creative", "商品与广告"],
    ["poster", "海报与插画"],
    ["character", "角色与世界观"],
    ["ui", "UI 与社媒截图"],
    ["comparison", "信息图与知识卡"]
  ];
  const items = [];
  for (const [type, category] of pairs) {
    const enCases = parseEvoLinkCaseFile(
      join(root, "cases", `${type}.md`),
      root,
      type,
      category,
      "en-US"
    );
    const zhCases = parseEvoLinkCaseFile(
      join(root, "cases", `${type}_zh-CN.md`),
      root,
      type,
      category,
      "zh-CN"
    );
    for (const item of [...zhCases, ...enCases]) items.push(item);
  }
  return items;
}

function parseEvoLinkCaseFile(path, root, type, category, locale) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const heading = /^### Case (\d+): \[(.*?)\]\((.*?)\) \(by \[@(.*?)\]\((.*?)\)\)/gm;
  const matches = [...text.matchAll(heading)];
  const items = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const blockStart = match.index ?? 0;
    const blockEnd = matches[index + 1]?.index ?? text.length;
    const block = text.slice(blockStart, blockEnd);
    const caseNo = match[1];
    const title = match[2];
    const sourceUrl = match[3];
    const author = match[4];
    const prompt = extractFirstCodeBlock(block);
    const image = firstImage(block);
    const thumbnailUrl = resolveSourceImage(image, root);
    if (!prompt || !thumbnailUrl) continue;
    items.push(
      makeCase({
        id: `pcase_evolink_${slugify(type)}_${caseNo}_${localeSuffix(locale)}`,
        title: locale === "zh-CN" ? zhTitle(title, category) : title,
        category,
        promptTemplate: prompt,
        promptSummary:
          locale === "zh-CN"
            ? `来自 EvoLinkAI 案例库的「${zhTitle(title, category)}」提示词，适合${category}创作。`
            : `Prompt case from the EvoLinkAI collection for ${title}.`,
        thumbnailUrl,
        sourceUrl,
        sourceAuthor: author,
        sourceLicense: "CC BY 4.0",
        sourceRepo: "EvoLinkAI/awesome-gpt-image-2-API-and-Prompts",
        locale
      })
    );
  }
  return items;
}

function collectFreestyle(root) {
  const path = join(root, "data", "cases.json");
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf8"));
  const items = [];
  for (const item of data.cases ?? []) {
    const category = freestyleCategory(item.category);
    const image = item.image?.startsWith("/images/")
      ? join(root, "data", item.image.slice(1))
      : item.image;
    const split = splitBilingualPrompt(item.prompt ?? "");
    if (split.zh && /[\u4e00-\u9fff]/.test(split.zh)) {
      items.push(
        makeCase({
          id: `pcase_freestyle_${item.id}_zh`,
          title: item.title,
          category,
          tags: [...(item.styles ?? []), ...(item.scenes ?? [])],
          promptTemplate: split.zh,
          promptSummary: `来自 freestylefly 结构化画廊的「${item.title}」提示词，适合${category}场景。`,
          thumbnailUrl: image,
          sourceUrl: freestyleSourceUrl(item),
          sourceAuthor: cleanAuthor(item.sourceLabel),
          sourceLicense: "original",
          sourceRepo: "freestylefly/awesome-gpt-image-2",
          locale: "zh-CN"
        })
      );
    }
    if (split.en && /[A-Za-z]{4}/.test(split.en)) {
      items.push(
        makeCase({
          id: `pcase_freestyle_${item.id}_en`,
          title: englishTitle(item.title, split.en),
          category,
          tags: [...(item.styles ?? []), ...(item.scenes ?? [])],
          promptTemplate: split.en,
          promptSummary: `Prompt case from freestylefly's structured gallery for ${englishTitle(item.title, split.en)}.`,
          thumbnailUrl: image,
          sourceUrl: freestyleSourceUrl(item),
          sourceAuthor: cleanAuthor(item.sourceLabel),
          sourceLicense: "original",
          sourceRepo: "freestylefly/awesome-gpt-image-2",
          locale: "en-US"
        })
      );
    }
  }
  return items;
}

function freestyleSourceUrl(item) {
  return (
    cleanOptionalUrl(item.sourceUrl) ??
    cleanOptionalUrl(item.githubUrl) ??
    "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/data/cases.json"
  );
}

function cleanOptionalUrl(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function collectZeroLu(root) {
  return [
    ...parseZeroLuReadme(join(root, "README.zh-CN.md"), root, "zh-CN"),
    ...parseZeroLuReadme(join(root, "README.md"), root, "en-US")
  ];
}

function parseZeroLuReadme(path, root, locale) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const headings = [...text.matchAll(/^### (.+)$/gm)].filter(
    (match) => !/官方资源|社区/.test(match[1])
  );
  const items = [];
  let currentCategory = locale === "zh-CN" ? "海报与插画" : "Posters";
  const h2Matches = [...text.matchAll(/^## (.+)$/gm)];
  for (let index = 0; index < headings.length; index += 1) {
    const match = headings[index];
    const start = match.index ?? 0;
    const end = headings[index + 1]?.index ?? text.length;
    const block = text.slice(start, end);
    const title = stripMarkdown(match[1]);
    const prompt = extractFirstCodeBlock(block);
    const image = firstImage(block);
    const source = firstSource(block);
    const sourceUrl = source.url ?? zeroLuReadmeUrl(locale);
    const h2 = [...h2Matches].reverse().find((h2Match) => (h2Match.index ?? 0) < start);
    currentCategory = zeroLuCategory(h2?.[1] ?? currentCategory);
    if (!prompt || !image) continue;
    const idBase = sourceUrl ? sourceUrl.split("/status/")[1]?.split(/[?#/]/)[0] : slugify(title);
    items.push(
      makeCase({
        id: `pcase_zerolu_${slugify(idBase || title)}_${localeSuffix(locale)}`,
        title: locale === "zh-CN" ? title : englishTitle(title, prompt),
        category: currentCategory,
        promptTemplate: prompt,
        promptSummary:
          locale === "zh-CN"
            ? `ZeroLu 社区案例「${title}」，适合${currentCategory}生成与改写。`
            : `Community prompt case from ZeroLu's collection for ${englishTitle(title, prompt)}.`,
        thumbnailUrl: resolveSourceImage(image, root),
        sourceUrl,
        sourceAuthor: cleanAuthor(source.author) ?? "ZeroLu/awesome-gpt-image",
        sourceLicense: "CC BY 4.0",
        sourceRepo: "ZeroLu/awesome-gpt-image",
        locale
      })
    );
  }
  return items;
}

function zeroLuReadmeUrl(locale) {
  const readme = locale === "zh-CN" ? "README.zh-CN.md" : "README.md";
  return `https://github.com/ZeroLu/awesome-gpt-image/blob/main/${readme}`;
}

function collectGptImage2(root) {
  const zh = parseGptImage2Readme(join(root, "README_zh.md"), "zh-CN");
  const en = parseGptImage2Readme(join(root, "README.md"), "en-US");
  const enByOrdinal = new Map(en.map((item) => [item.sourceOrdinal, item]));
  const paired = [];
  for (const item of zh) {
    paired.push(item);
    const match = enByOrdinal.get(item.sourceOrdinal);
    if (match) paired.push(match);
  }
  return paired.map((item) => {
    const { sourceOrdinal: _sourceOrdinal, ...caseItem } = item;
    return caseItem;
  });
}

function parseGptImage2Readme(path, locale) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const headings = [...text.matchAll(/^### No\. (\d+): (.+)$/gm)];
  const items = [];
  for (let index = 0; index < headings.length; index += 1) {
    const match = headings[index];
    const start = match.index ?? 0;
    const end = headings[index + 1]?.index ?? text.length;
    const block = text.slice(start, end);
    const title = stripMarkdown(match[2]);
    const prompt = extractFirstCodeBlock(block);
    const image = firstImage(block);
    const source = firstSource(block);
    const tryId = block.match(/gptimage2api\.net\/\?id=(\d+)/)?.[1];
    if (!prompt || !image) continue;
    items.push(
      makeCase({
        id: `pcase_gptimage2_${tryId ?? `${match[1]}_${slugify(title)}`}_${localeSuffix(locale)}`,
        title: locale === "zh-CN" ? title : englishTitle(title, prompt),
        category: inferCategoryFromPrompt(prompt, title),
        promptTemplate: prompt,
        promptSummary:
          locale === "zh-CN"
            ? `gpt-image2 提示词库案例「${title}」，适合快速复用或继续改写。`
            : `Prompt case from the gpt-image2 prompt library for ${englishTitle(title, prompt)}.`,
        thumbnailUrl: image,
        sourceUrl: source.url,
        sourceAuthor: cleanAuthor(source.author),
        sourceLicense: "CC BY 4.0",
        sourceRepo: "gpt-image2/awesome-gptimage2-prompts",
        locale,
        sourceOrdinal: match[1]
      })
    );
  }
  return items;
}

function parseEvoLinkSiteItems(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const match = text.match(/"@type":"ItemList".*?"itemListElement":(\[.*?\])\s*[,}]/);
  if (!match) return [];
  try {
    return JSON.parse(match[1].replaceAll('\\"', '"'));
  } catch {
    return [];
  }
}

export {
  collectEvoLinkApi,
  collectFreestyle,
  collectGptImage2,
  collectZeroLu,
  parseEvoLinkSiteItems
};
