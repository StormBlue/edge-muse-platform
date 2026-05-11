import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CATEGORY_ALIASES,
  CATEGORY_GROUPS,
  CATEGORY_RULES,
  SOURCE_TAG_ALIASES,
  TAG_RULES
} from "./rules.mjs";

function makeCase(input) {
  const modes = inferModes(input.promptTemplate, input.category);
  const category = refineCategory(input.category, input.promptTemplate, input.title);
  return {
    id: input.id,
    title: input.title,
    category,
    modes,
    recommendedSize: inferSize(input.promptTemplate),
    tags: buildTags(category, modes, input.promptTemplate, input.title, input.tags),
    promptTemplate: normalizePrompt(input.promptTemplate),
    promptSummary: input.promptSummary,
    thumbnailUrl: input.thumbnailUrl,
    sourceUrl: input.sourceUrl ?? null,
    sourceAuthor: input.sourceAuthor ?? null,
    sourceLicense: input.sourceLicense,
    sourceRepo: input.sourceRepo,
    popularity: {},
    status: "published",
    featured: false,
    sortOrder: 0,
    locale: input.locale,
    ...(input.sourceOrdinal ? { sourceOrdinal: input.sourceOrdinal } : {})
  };
}

function finalizeCase(input) {
  const promptTemplate = normalizePrompt(input.promptTemplate);
  const modes =
    Array.isArray(input.modes) && input.modes.length
      ? input.modes
      : inferModes(promptTemplate, input.category);
  const category = refineCategory(input.category, promptTemplate, input.title);
  return {
    ...input,
    category,
    modes,
    tags: buildTags(category, modes, promptTemplate, input.title, input.tags),
    promptTemplate
  };
}

function splitBilingualPrompt(prompt) {
  const text = normalizePrompt(prompt);
  const zhMatch = text.match(/\[中文\]([\s\S]*?)(?=\[English\]|$)/i);
  const enMatch = text.match(/\[English\]([\s\S]*)/i);
  const zh = zhMatch?.[1]?.trim();
  const en = enMatch?.[1]?.trim();
  if (zh || en) return { zh, en };
  const hasZh = /[\u4e00-\u9fff]/.test(text);
  const hasEn = /[A-Za-z]{4}/.test(text);
  return {
    zh: hasZh ? text : null,
    en: hasEn ? text : null
  };
}

function extractFirstCodeBlock(block) {
  return block.match(/```(?:text|json|prompt|markdown)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? "";
}

function firstImage(block) {
  return (
    block.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ??
    block.match(/!\[[^\]]*]\(([^)]+)\)/)?.[1] ??
    null
  );
}

function firstSource(block) {
  const sourceLine = block
    .split(/\r?\n/)
    .find((line) => /来源|Source|作者|Author/i.test(line) && /\]\(https?:\/\//.test(line));
  if (!sourceLine) return { author: null, url: null };
  const links = [...sourceLine.matchAll(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g)];
  const preferred = links.find((link) => /x\.com|twitter\.com/.test(link[2])) ?? links[0];
  return preferred ? { author: preferred[1], url: preferred[2] } : { author: null, url: null };
}

function resolveSourceImage(value, root) {
  if (!value) return null;
  const clean = value.replace(/&amp;/g, "&");
  if (/^https?:\/\//i.test(clean)) {
    const rawMatch = clean.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/);
    if (rawMatch) {
      const local = join(root, rawMatch[1]);
      if (existsSync(local)) return local;
    }
    return clean;
  }
  const local = join(root, clean.replace(/^\.\//, ""));
  return existsSync(local) ? local : clean;
}

function inferModes(prompt, category) {
  const text = `${prompt} ${category}`.toLowerCase();
  if (
    /参考图|上传|原图|基于.*图|attached image|reference image|same subject|same person|edit|redesign|style transfer/.test(
      text
    )
  ) {
    return text.includes("generate") || text.includes("生成")
      ? ["image2image", "text2image"]
      : ["image2image"];
  }
  return ["text2image"];
}

function inferSize(prompt) {
  const text = prompt.toLowerCase();
  if (/16[:：]9|widescreen|横版|landscape/.test(text)) return "1536x1024";
  if (/1[:：]1|square|方图|正方形/.test(text)) return "1024x1024";
  return "1024x1536";
}

function inferCategoryFromPrompt(prompt, title) {
  return refineCategory("海报与插画", prompt, title);
}

function freestyleCategory(value) {
  const map = {
    "Architecture & Spaces": "建筑空间与室内",
    "Brand & Logos": "品牌标识与 Logo",
    "Characters & People": "角色与世界观",
    "Charts & Infographics": "信息图表与数据",
    "Documents & Publishing": "文档排版与出版",
    "History & Classical Themes": "古典历史与国风",
    "Illustration & Art": "海报与插画",
    "Other Use Cases": "海报与插画",
    "Photography & Realism": "人像与摄影",
    "Posters & Typography": "海报与字体设计",
    "Products & E-commerce": "电商商品展示",
    "Scenes & Storytelling": "视频感关键帧",
    "UI & Interfaces": "UI 界面与产品图"
  };
  return map[value] ?? "海报与插画";
}

function zeroLuCategory(value) {
  const text = String(value).toLowerCase();
  if (/photography|摄影|照片/.test(text)) return "人像与摄影";
  if (/game|游戏/.test(text)) return "游戏与娱乐场景";
  if (/video|animation|视频|动画/.test(text)) return "视频感关键帧";
  if (/social|社交/.test(text)) return "社交媒体截图";
  if (/ui|ux|界面/.test(text)) return "UI 界面与产品图";
  if (/typography|排版/.test(text)) return "海报与字体设计";
  if (/poster|海报/.test(text)) return "海报与插画";
  if (/infographic|信息图/.test(text)) return "信息图表与数据";
  if (/education|教育/.test(text)) return "知识科普与教学";
  if (/document|文档/.test(text)) return "文档排版与出版";
  if (/character|角色/.test(text)) return "角色与世界观";
  return "海报与插画";
}

function refineCategory(baseCategory, prompt, title) {
  const titleText = normalizeSearchText(title);
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(titleText)) return rule.category;
  }
  const text = normalizeSearchText(`${title} ${positivePromptText(prompt)}`);
  const base = CATEGORY_ALIASES[baseCategory] ?? baseCategory ?? "海报与插画";
  const baseGroup = CATEGORY_GROUPS[base] ?? CATEGORY_GROUPS[baseCategory] ?? "poster";
  for (const rule of CATEGORY_RULES) {
    if (rule.group === baseGroup && rule.pattern.test(text)) return rule.category;
  }
  return base;
}

function buildTags(category, modes, prompt, title, sourceTags = []) {
  const text = normalizeSearchText(`${title} ${positivePromptText(prompt)}`);
  const tags = [category];
  for (const value of sourceTags) {
    const mapped = normalizeSourceTag(value);
    if (mapped) tags.push(mapped);
  }
  if (modes.includes("image2image")) tags.push("参考图改造");
  for (const rule of TAG_RULES) {
    if (rule.pattern.test(text)) tags.push(rule.tag);
  }
  return uniqueTags(tags);
}

function positivePromptText(prompt) {
  return normalizePrompt(prompt)
    .split(/\n/)
    .filter((line) => !/^(约束|不要|无水印|negative|avoid|no\b)/i.test(line.trim()))
    .join("\n");
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

function normalizeSourceTag(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return null;
  const mapped = SOURCE_TAG_ALIASES[cleaned.toLowerCase()] ?? cleaned;
  if (!mapped) return null;
  return trimText(mapped, 40);
}

function uniqueTags(values) {
  const tags = [];
  const seen = new Set();
  for (const value of values) {
    const cleaned = String(value ?? "")
      .replace(/[^\p{Letter}\p{Number}\s&/ -]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
    const key = cleaned.toLowerCase();
    if (cleaned && !seen.has(key)) {
      tags.push(cleaned);
      seen.add(key);
    }
    if (tags.length >= 16) break;
  }
  return tags;
}

function assignSortOrders(cases) {
  const counters = new Map();
  return cases.map((item) => {
    const categoryIndex = categoryOrder(item.category);
    const counter = (counters.get(item.category) ?? 0) + 1;
    counters.set(item.category, counter);
    return {
      ...item,
      sortOrder: 10_000 + categoryIndex * 1_000 + counter
    };
  });
}

function isValidCase(item) {
  if (
    !item.id ||
    !item.title ||
    !item.category ||
    !item.promptTemplate ||
    !item.thumbnailUrl ||
    !item.locale
  ) {
    return false;
  }
  if (item.locale === "zh-CN" && !/[\u4e00-\u9fff]/.test(item.promptTemplate)) return false;
  if (item.locale === "en-US" && !/[A-Za-z]{4}/.test(item.promptTemplate)) return false;
  return true;
}

function isUnsafePrompt(prompt) {
  const text = prompt.toLowerCase();
  if (
    /(underage|minor|teenage|schoolgirl|school girl|18-year-old|18 year old|未成年|少女|高中生|校服)/.test(
      text
    )
  ) {
    if (
      /(sexy|seductive|cleavage|lingerie|nude|erotic|sensual|temptation|性感|诱惑|裸|内衣|暴露)/.test(
        text
      )
    ) {
      return true;
    }
  }
  return /(nude|porn|explicit sexual|未成年.*性感|儿童.*性感)/.test(text);
}

function normalizePrompt(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function trimPrompt(value) {
  const text = normalizePrompt(value);
  if (text.length <= 4000) return text;
  return `${text.slice(0, 3960).trim()}\n\n[内容较长，已截断；完整版本见来源链接]`;
}

function trimText(value, max) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function caseKey(item) {
  return [item.locale, item.sourceUrl ?? "", item.title].join("|").toLowerCase();
}

function englishTitle(title, prompt) {
  if (!/[\u4e00-\u9fff]/.test(title)) return trimText(title, 120);
  const first = normalizePrompt(prompt)
    .replace(/\{argument name="[^"]+"\s+default="([^"]+)"\}/g, "$1")
    .replace(/[{}[\]":,]/g, " ")
    .split(/\s+/)
    .filter((word) => /^[A-Za-z][A-Za-z-]{2,}$/.test(word))
    .slice(0, 7)
    .join(" ");
  return toTitleCase(first || "GPT Image Prompt Case");
}

function zhTitle(title, category) {
  if (/[\u4e00-\u9fff]/.test(title)) return title;
  return `${title}（${category}）`;
}

function toTitleCase(value) {
  return value.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function cleanAuthor(value) {
  return (
    String(value ?? "")
      .replace(/^@/, "")
      .trim() || null
  );
}

function slugify(value) {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return slug || "case";
}

function stripMarkdown(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`#]/g, "")
    .trim();
}

function localeSuffix(locale) {
  return locale === "zh-CN" ? "zh" : "en";
}

function categoryOrder(category) {
  const categories = [
    "摄影写实与胶片",
    "人像与摄影",
    "商品广告与营销",
    "电商商品展示",
    "食品餐饮广告",
    "Logo 与品牌系统",
    "海报与字体设计",
    "海报与插画",
    "插画艺术与风格化",
    "古典历史与国风",
    "角色与世界观",
    "角色设定与参考图",
    "IP 角色与世界观",
    "UI 界面与产品图",
    "聊天与社交截图",
    "直播与短视频界面",
    "信息图表与数据",
    "知识卡片与科普",
    "文档排版与出版",
    "电影分镜与关键帧",
    "视频感关键帧",
    "游戏与娱乐场景",
    "建筑空间与室内"
  ];
  const index = categories.indexOf(category);
  return index >= 0 ? index + 1 : categories.length + 1;
}

export {
  assignSortOrders,
  caseKey,
  cleanAuthor,
  englishTitle,
  extractFirstCodeBlock,
  finalizeCase,
  firstImage,
  firstSource,
  freestyleCategory,
  inferCategoryFromPrompt,
  isUnsafePrompt,
  isValidCase,
  localeSuffix,
  makeCase,
  resolveSourceImage,
  slugify,
  splitBilingualPrompt,
  stripMarkdown,
  trimPrompt,
  trimText,
  zeroLuCategory,
  zhTitle
};
