import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(scriptDir, "..");
const repoRoot = join(serverRoot, "..");

const args = parseArgs(process.argv.slice(2));
const runId = args.runId ?? formatDate(new Date());
const outRoot = args.out ? resolveFromRepo(args.out) : join(repoRoot, "uploads", "prompt-cases", runId);
const reportRoot = join(outRoot, "reports");
const seedPath = args.seed ? resolveFromRepo(args.seed) : join(scriptDir, "prompt-cases.seed.json");
const outSeedPath = args.outSeed ? resolveFromRepo(args.outSeed) : join(reportRoot, "prompt-cases.generated.seed.json");
const maxYouMind = intArg(args.maxYouMind, 240);
const maxEvoLink = intArg(args.maxEvoLink, 360);
const maxFreestyle = intArg(args.maxFreestyle, 780);
const maxZeroLu = intArg(args.maxZeroLu, 160);

const sourceRootA = args.sourceRootA ? resolve(args.sourceRootA) : "/tmp/edge-muse-prompt-sources";
const sourceRootB = args.sourceRootB ? resolve(args.sourceRootB) : "/tmp/edge-muse-prompt-sources-2";
const siteRoot = args.siteRoot ? resolve(args.siteRoot) : "/tmp/edge-muse-prompt-site";

const sources = {
  gptimage2: join(sourceRootA, "awesome-gptimage2-prompts"),
  evolinkApi: join(sourceRootA, "awesome-gpt-image-2-API-and-Prompts"),
  freestyle: join(sourceRootB, "awesome-gpt-image-2"),
  zeroLu: join(sourceRootB, "awesome-gpt-image"),
  evolinkSite: join(siteRoot, "evolink-gpt-image-2-prompts.html")
};

const CATEGORY_ALIASES = {
  "商品与广告": "商品广告与营销",
  "UI 与社媒截图": "UI 界面与产品图",
  "信息图与知识卡": "知识卡片与科普",
  "海报与插画": "海报与插画",
  "品牌标识与 Logo": "Logo 与品牌系统",
  "角色与世界观": "角色设定与参考图",
  "视频感关键帧": "电影分镜与关键帧"
};

const CATEGORY_GROUPS = {
  "人像与摄影": "photo",
  "摄影写实与胶片": "photo",
  "商品与广告": "commerce",
  "商品广告与营销": "commerce",
  "电商商品展示": "commerce",
  "食品餐饮广告": "commerce",
  "品牌标识与 Logo": "commerce",
  "Logo 与品牌系统": "commerce",
  "海报与插画": "poster",
  "海报与字体设计": "poster",
  "插画艺术与风格化": "poster",
  "古典历史与国风": "poster",
  "角色与世界观": "character",
  "角色设定与参考图": "character",
  "IP 角色与世界观": "character",
  "UI 与社媒截图": "ui",
  "UI 界面与产品图": "ui",
  "聊天与社交截图": "ui",
  "直播与短视频界面": "ui",
  社交媒体截图: "ui",
  "信息图与知识卡": "info",
  "信息图表与数据": "info",
  "知识卡片与科普": "info",
  "文档排版与出版": "info",
  "视频感关键帧": "cinematic",
  "电影分镜与关键帧": "cinematic",
  "游戏与娱乐场景": "cinematic",
  "建筑空间与室内": "space"
};

const CATEGORY_RULES = [
  { category: "直播与短视频界面", group: "ui", pattern: /直播截图|直播界面|直播间|live stream screenshot|douyin live|tiktok live|弹幕界面/ },
  { category: "聊天与社交截图", group: "ui", pattern: /朋友圈截图|微信聊天|小红书主页|小红书截图|推文页面|x post page|social feed screenshot|chat interface|聊天界面|社交截图|homepage screenshot/ },
  { category: "游戏与娱乐场景", group: "cinematic", pattern: /游戏截图|第一人称|game screenshot|screenshot from .*game|rpg|black myth|wukong|pokemon|minecraft|手游抽卡|游戏界面|关卡|boss|电竞/ },
  { category: "UI 界面与产品图", group: "ui", pattern: /dashboard|app ui|ui design|ui system|ux|interface|wireframe|landing page|web page|网页界面|移动端界面|产品界面|操作台|控制台|设计系统/ },
  { category: "电商商品展示", group: "commerce", pattern: /电商主图|商品主图|商品图|详情页|product listing|e-?commerce|淘宝详情|amazon|shopify|packshot|货架展示|白底图/ },
  { category: "食品餐饮广告", group: "commerce", pattern: /食品广告|饮品广告|餐饮广告|restaurant menu|菜谱|recipe|美食地图|food map|beverage ad|茶饮|奶茶|饮料|牛排|海鲜|咖啡旅程|菜单图/ },
  { category: "商品广告与营销", group: "commerce", pattern: /商品广告|ad creative|advertising campaign|marketing campaign|promo poster|promotion|营销海报|促销海报|海报广告|卖点|转化率|banner ad/ },
  { category: "Logo 与品牌系统", group: "commerce", pattern: /logo概念|logo design|brand identity|visual identity|品牌系统|品牌身份|vi系统|brand book|徽标设计/ },
  { category: "信息图表与数据", group: "info", pattern: /信息图|infographic|diagram|chart|timeline|graph|flowchart|数据图表|流程图|时间轴|关系图|架构图|拆解图|可视化/ },
  { category: "知识卡片与科普", group: "info", pattern: /knowledge card|science encyclopedia|encyclopedia|education card|tutorial card|科普|知识卡|教学卡|百科|课程图|学习卡|讲解图/ },
  { category: "文档排版与出版", group: "info", pattern: /document layout|publication|magazine spread|book cover|newspaper|resume|slide deck|ppt|report card|文档排版|杂志跨页|书籍封面|报纸版式|简历|幻灯片|报告卡片|出版物/ },
  { category: "海报与字体设计", group: "poster", pattern: /typography poster|font poster|lettering|title design|字体海报|文字海报|排版海报|标题字|字形设计|招贴/ },
  { category: "古典历史与国风", group: "poster", pattern: /ancient|classical|history|museum|chinese style|ink wash|国风|古风|历史|古典|水墨|宋代|唐代|明代|博物馆|诗词|长卷/ },
  { category: "角色设定与参考图", group: "character", pattern: /character sheet|reference sheet|model sheet|turnaround|角色设定|三视图|参考图|设定图|人物设定|角色图鉴/ },
  { category: "IP 角色与世界观", group: "character", pattern: /worldbuilding|mascot|creature|角色世界观|角色海报|角色卡牌|吉祥物|精灵|机甲|怪物|人物卡/ },
  { category: "电影分镜与关键帧", group: "cinematic", pattern: /cinematic keyframe|film still|storyboard|movie poster|电影关键帧|电影海报|分镜|关键帧|剧照|镜头/ },
  { category: "建筑空间与室内", group: "space", pattern: /architecture|interior design|room design|apartment|building exterior|city map|建筑空间|室内设计|空间设计|房间|公寓|城市地图|景观|店铺空间/ },
  { category: "人像与摄影", group: "photo", pattern: /portrait|selfie|headshot|couple photo|人像|写真|肖像|情侣写真|胶片人像|杂志人像/ },
  { category: "摄影写实与胶片", group: "photo", pattern: /photography|camera|film photo|35mm|iphone photo|raw photo|dslr|摄影|胶片|相机|手机照片|纪实|街拍|棚拍/ },
  { category: "插画艺术与风格化", group: "poster", pattern: /illustration|anime|cartoon|watercolor|sketch|comic|manga|pixel art|插画|漫画|动漫|水彩|手绘|线稿|涂鸦|像素|艺术风格/ }
];

const SOURCE_TAG_ALIASES = {
  tech: "科技",
  commerce: "商业",
  ui: "UI",
  poster: "海报",
  realistic: "写实",
  character: "角色",
  social: "社交媒体",
  illustration: "插画",
  fashion: "时尚",
  infographic: "信息图",
  creative: "创意",
  brand: "品牌",
  product: "商品",
  story: "叙事",
  travel: "旅行",
  food: "餐饮",
  education: "教育",
  history: "历史",
  classical: "古典",
  documents: "文档",
  products: "商品",
  characters: "角色",
  photography: "摄影",
  architecture: "建筑",
  scenes: "场景",
  "other use cases": null
};

const TAG_RULES = [
  { tag: "参考图编辑", pattern: /参考图|上传|原图|attached image|reference image|same subject|same person|edit|redesign|style transfer|重绘|改造|换风格/ },
  { tag: "文字渲染", pattern: /文字|text|typography|font|标题|标语|caption|label|slogan|字形/ },
  { tag: "长文本", pattern: /整篇|全文|menu|document|report|long text|dense text|大量文字|文档|菜单/ },
  { tag: "中文内容", pattern: /中文|汉字|国风|诗词|微信|小红书|淘宝|中国/ },
  { tag: "英文内容", pattern: /english|headline|poster text|brand slogan|copywriting/ },
  { tag: "信息密度高", pattern: /infographic|diagram|chart|timeline|知识|科普|图解|流程|关系图|拆解|架构/ },
  { tag: "写实摄影", pattern: /photo|photography|camera|iphone|raw|dslr|realistic|真实|写实|纪实|街拍|棚拍/ },
  { tag: "胶片感", pattern: /film|35mm|kodak|fuji|grain|胶片|颗粒|复古摄影/ },
  { tag: "商业广告", pattern: /advert|campaign|marketing|promo|商品|广告|营销|促销|卖点|转化/ },
  { tag: "品牌设计", pattern: /brand|logo|identity|品牌|标志|视觉识别|vi/ },
  { tag: "电商", pattern: /e-?commerce|商品图|详情页|淘宝|amazon|shopify|主图|货架/ },
  { tag: "餐饮", pattern: /food|restaurant|coffee|tea|drink|餐饮|咖啡|奶茶|饮料|美食|菜单/ },
  { tag: "社交媒体", pattern: /social|wechat|微信|小红书|instagram|twitter|朋友圈|社交|聊天/ },
  { tag: "直播界面", pattern: /live stream|直播|弹幕|douyin live|tiktok live/ },
  { tag: "移动端", pattern: /mobile|phone|smartphone|app|手机|移动端|竖屏/ },
  { tag: "仪表盘", pattern: /dashboard|analytics|数据看板|控制台|后台|图表面板/ },
  { tag: "地图", pattern: /map|地图|city map|路线|区域图/ },
  { tag: "时间轴", pattern: /timeline|时间轴|chronology/ },
  { tag: "角色一致性", pattern: /same character|consistent character|character sheet|reference sheet|同一角色|一致性|三视图/ },
  { tag: "游戏场景", pattern: /game|rpg|游戏|关卡|boss|电竞/ },
  { tag: "电影感", pattern: /cinematic|film still|keyframe|storyboard|movie|电影|分镜|关键帧|镜头/ },
  { tag: "建筑空间", pattern: /architecture|interior|room|building|建筑|室内|空间|房间/ },
  { tag: "国风古典", pattern: /ancient|classical|history|ink wash|国风|古风|历史|古典|水墨|诗词/ },
  { tag: "插画", pattern: /illustration|cartoon|anime|watercolor|sketch|插画|漫画|动漫|水彩|手绘/ },
  { tag: "3D", pattern: /3d|isometric|render|clay|blender|三维|立体|等距/ },
  { tag: "扁平设计", pattern: /flat|vector|矢量|扁平/ },
  { tag: "极简", pattern: /minimal|minimalist|极简|留白|简洁/ },
  { tag: "复古", pattern: /retro|vintage|nostalgic|复古|怀旧/ },
  { tag: "奢华", pattern: /luxury|premium|gold|高端|奢华|黑金/ },
  { tag: "可爱", pattern: /cute|kawaii|可爱|萌/ },
  { tag: "赛博朋克", pattern: /cyberpunk|neon|赛博|霓虹/ }
];

mkdirSync(reportRoot, { recursive: true });
ensureSources();

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
console.log(`Collected ${report.added} new prompt cases (${finalCases.length} total in generated seed)`);
console.log(`Generated seed: ${outSeedPath}`);
console.log(`Skipped duplicate=${report.skippedDuplicate}, unsafe=${report.skippedUnsafe}, invalid=${report.skippedInvalid}`);

function ensureSources() {
  mkdirSync(sourceRootA, { recursive: true });
  mkdirSync(sourceRootB, { recursive: true });
  mkdirSync(siteRoot, { recursive: true });
  ensureGitRepo("https://github.com/gpt-image2/awesome-gptimage2-prompts.git", sources.gptimage2, sourceRootA);
  ensureGitRepo(
    "https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts.git",
    sources.evolinkApi,
    sourceRootA
  );
  ensureGitRepo("https://github.com/freestylefly/awesome-gpt-image-2.git", sources.freestyle, sourceRootB);
  ensureGitRepo("https://github.com/ZeroLu/awesome-gpt-image.git", sources.zeroLu, sourceRootB);
  if (!existsSync(sources.evolinkSite)) {
    execFileSync(
      "curl",
      [
        "-L",
        "--compressed",
        "-A",
        "Mozilla/5.0 EdgeMusePromptCollector/1.0",
        "https://evolink.ai/zh/gpt-image-2-prompts",
        "-o",
        sources.evolinkSite
      ],
      { stdio: "inherit" }
    );
  }
}

function ensureGitRepo(url, path, cwd) {
  if (existsSync(join(path, ".git"))) return;
  execFileSync("git", ["-C", cwd, "clone", "--depth", "1", url], { stdio: "inherit" });
}

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
    const enCases = parseEvoLinkCaseFile(join(root, "cases", `${type}.md`), root, type, category, "en-US");
    const zhCases = parseEvoLinkCaseFile(join(root, "cases", `${type}_zh-CN.md`), root, type, category, "zh-CN");
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
    items.push(makeCase({
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
    }));
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
      items.push(makeCase({
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
      }));
    }
    if (split.en && /[A-Za-z]{4}/.test(split.en)) {
      items.push(makeCase({
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
      }));
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
  const headings = [...text.matchAll(/^### (.+)$/gm)].filter((match) => !/官方资源|社区/.test(match[1]));
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
    items.push(makeCase({
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
    }));
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
    items.push(makeCase({
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
    }));
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
  const modes = Array.isArray(input.modes) && input.modes.length ? input.modes : inferModes(promptTemplate, input.category);
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
  if (/参考图|上传|原图|基于.*图|attached image|reference image|same subject|same person|edit|redesign|style transfer/.test(text)) {
    return text.includes("generate") || text.includes("生成") ? ["text2image", "image2image"] : ["image2image"];
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
  if (!item.id || !item.title || !item.category || !item.promptTemplate || !item.thumbnailUrl || !item.locale) {
    return false;
  }
  if (item.locale === "zh-CN" && !/[\u4e00-\u9fff]/.test(item.promptTemplate)) return false;
  if (item.locale === "en-US" && !/[A-Za-z]{4}/.test(item.promptTemplate)) return false;
  return true;
}

function isUnsafePrompt(prompt) {
  const text = prompt.toLowerCase();
  if (/(underage|minor|teenage|schoolgirl|school girl|18-year-old|18 year old|未成年|少女|高中生|校服)/.test(text)) {
    if (/(sexy|seductive|cleavage|lingerie|nude|erotic|sensual|temptation|性感|诱惑|裸|内衣|暴露)/.test(text)) {
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
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
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
  return String(value ?? "").replace(/^@/, "").trim() || null;
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

function intArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function limitBySource(items, max) {
  const zh = items.filter((item) => item.locale === "zh-CN");
  const en = items.filter((item) => item.locale === "en-US");
  const selected = [];
  const seen = new Set();
  for (const item of zh) {
    if (selected.length >= max) break;
    selected.push(item);
    seen.add(item.id);
    const enId = item.id.replace(/_zh$/, "_en");
    const enMatch = en.find((candidate) => candidate.id === enId);
    if (enMatch && selected.length < max) {
      selected.push(enMatch);
      seen.add(enMatch.id);
    }
  }
  for (const item of en) {
    if (selected.length >= max) break;
    if (seen.has(item.id)) continue;
    selected.push(item);
  }
  return selected;
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

function relativePath(path) {
  return path.replace(repoRoot, "").replace(/^[\\/]/, "").replaceAll("\\", "/");
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
