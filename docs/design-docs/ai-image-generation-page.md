# AI 图像生成页面与生成入口方案

状态：implemented
日期：2026-05-06
关联任务（已归档）：[`../archive/ai-image-generation-page-tasks.md`](../archive/ai-image-generation-page-tasks.md)

## 背景

现有 `/workspace` 图像生成页偏专业工作台：用户需要先理解模式、尺寸、张数、参考图，再自行编写 prompt。这个入口适合熟悉模型能力的用户，但普通用户更需要“先选用途、看案例、让 AI 帮我写”的路径。

本方案把体验拆成两条产品线：

- **图像生成**：保留现有 `/workspace`，定位为专业工作台，继续承载文生图、图生图、历史会话、失败重试等完整能力。
- **AI 图像生成**：新增独立页面，定位为普通用户入口，主流程是“案例启发 -> AI 问答写 prompt -> 确认 prompt -> 调用现有生成任务”。

系统管理员新增两类管理能力：一是管理 AI 图像生成页的案例库，二是配置普通用户是否可见「工作台 / AI 图像生成」及相关用量事件（[`../EXPERIMENTS.md`](../EXPERIMENTS.md)）。

## 实现状态

截至 2026-05-06，AI 图像页、案例库、Prompt 助手与**生成入口**管理已在工程侧落地。任务书（含灰度运营的运维勾选备忘）见 [`../archive/ai-image-generation-page-tasks.md`](../archive/ai-image-generation-page-tasks.md)。运行时以代码及 [`../EXPERIMENTS.md`](../EXPERIMENTS.md) 为准：**当前无多臂随机 A/B 表**，取而代之的是 `generation_entry_settings` + `generation_events`。

> **与原 PRD 的差异**：归档任务书中的「流量档位、experiment 分配、旧路径 `/sysadmin/experiments/generation`」对应**早期设计**；请以 `EXPERIMENTS.md` 与 `generationEntry` 为准。

## 目标

1. 新建面向普通用户的 `AI 图像生成` 页面，不在现有工作台里堆叠更多模块。
2. 保留 `图像生成` 专业页，避免打断当前熟练用户和管理员的工作流。
3. 典型案例库参考 [EvoLinkAI/awesome-gpt-image-2-prompts](https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts)，以“可复用场景 + 效果预览 + 来源归因”的方式精选，而不是简单复制所有 prompt。
4. 仅在 `text2image`、`image2image` 模式启用 AI 提示词助手。
5. 系统管理员能管理案例：新增、编辑、导入、上下线、排序、归因、标记精选。
6. 系统管理员能配置**生成入口**（普通用户可见的工作台 / AI 图像页）、查看最近用量摘要，并按 [`../EXPERIMENTS.md`](../EXPERIMENTS.md) 采集漏斗事件。

## 非目标

- 不替换现有 `/api/generate` 任务链路、配额预扣、WebSocket 推送、R2 图片存储。
- 不让 AI 助手直接消耗图片配额；最终仍由用户点击“生成图片”。
- MVP 不把参考图二进制发送给 Workers AI；只发送用户输入的参考图描述与数量。
- MVP 不做公开注册、营销落地页或外部 prompt 市场。

## 外部参考

| 来源                                                                                    | 观察                                                                                                                                                           | 产品启发                                                                                                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [awesome-gpt-image-2-prompts](https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts) | 仓库按人像摄影、海报插画、角色设计、UI/社媒截图、对比实验等整理 GPT-Image-2 案例；`gpt_image2_prompts.json` 含公开来源、作者、语言、热度、图片尺寸与媒体信息。 | 案例库应支持来源、作者、标签、推荐尺寸、图像比例、热度、语言和许可归因；先精选 20-30 个适合国内用户的案例，不做全量镜像。 |
| Adobe Firefly                                                                           | 文生图入口提供 prompt enhancement、style reference、composition reference 等控件。                                                                             | `AI 图像生成` 页面应把风格、构图、参考图角色做成显式选项。                                                                |
| Ideogram Magic Prompt                                                                   | Magic Prompt 可开关，增强结果保留原 prompt 与增强 prompt。                                                                                                     | AI 改写必须可预览、可撤销、可复制，不覆盖用户原始意图。                                                                   |
| Leonardo.Ai                                                                             | Improve Prompt 和 prompt 结构建议强调 Subject、Style、Environment、Lighting、Mood。                                                                            | 助手应先形成结构化 brief，再输出最终 prompt。                                                                             |
| Midjourney                                                                              | Image Prompt / Style Reference 将参考图分成内容、风格、角色等用途。                                                                                            | 图生图必须先问清参考图角色：主体、构图、风格、品牌或氛围。                                                                |
| Runway                                                                                  | 视频提示强调主体运动、场景运动、镜头运动和时间推进。                                                                                                           | 案例库可加入“视频感关键帧 / 分镜海报”分类，让静态图也具备镜头语言。                                                       |
| Cloudflare Workers AI                                                                   | Worker binding 可直接调 `env.AI.run()`；JSON Mode 可要求结构化输出；AI Gateway 可做日志、限流、缓存与 fallback。                                               | Prompt 助手适合用 Workers AI 做低成本旁路服务，但必须加 feature flag、日限额和失败降级。                                  |

引用许可说明：`awesome-gpt-image-2-prompts` 使用 CC BY 4.0。若导入其 prompt 或图片素材，页面和数据结构必须保留来源 URL、作者和许可证；MVP 优先“精选归因 + 链接来源”，避免无归因复制。

## 信息架构

### 页面与导航

| 页面           | 路由                                    | 定位           | 入口策略                                                                                             |
| -------------- | --------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| 图像生成       | `/workspace`、`/workspace/s/:sessionId` | 专业工作台     | sysadmin 可关闭对普通用户的展示；详见 `generation_entry_settings.show_workspace`。                   |
| AI 图像生成    | `/ai-image`                             | 普通用户入口   | sysadmin 可关闭 `show_ai_image`。                                                                    |
| 历史记录       | `/history`                              | 会话与图片历史 | 两个生成页共享。                                                                                     |
| 案例管理       | `/sysadmin/prompt-cases`                | 系统管理员配置 | 管理 AI 图像生成案例库。                                                                             |
| 生成入口与用量 | `/sysadmin/generation-entry`            | 系统管理员配置 | 配置上述开关 + 近 30 天按页提交的提交/成功/失败计数（见 [`../EXPERIMENTS.md`](../EXPERIMENTS.md)）。 |

运行时普通用户侧边栏展示的入口集合由 **`generationEntry`**（`/api/me`）决定：`showWorkspace`、`showAiImage` 及默认 `navTarget`。

> **与原稿「A/B 变体」表述的关系**：已不再按用户哈希分配流量百分比；两端可同时开启以供用户切换。

### AI 图像生成页面布局

桌面端：

- 顶部：场景分类 tabs、当前配额、生成按钮状态。
- 左侧：案例库与筛选，按“人像摄影 / 商品广告 / 海报插画 / 角色设定 / UI截图 / 视频关键帧 / 信息图”分类。
- 中间：案例详情与效果预览，显示 prompt 摘要、适用模式、推荐尺寸、来源归因。
- 右侧：AI 提示词助手与最终 prompt 预览。
- 底部或右侧固定：模式、尺寸、参考图上传、最终生成按钮。

移动端：

- 案例分类横向滚动。
- 案例详情用 bottom sheet。
- AI 助手进入全屏对话。
- 最终 prompt 确认后回到生成面板。

## 案例库需求

### MVP 分类

参考开源项目的实际分区，MVP 先做 7 类：

| 分类           | 适用模式        | 示例方向                                            |
| -------------- | --------------- | --------------------------------------------------- |
| 人像与摄影     | 文生图 / 图生图 | 35mm 胶片、电影感人像、职业照、复古修复、人像换风格 |
| 商品与广告     | 文生图 / 图生图 | 商品主图、产品摄影、促销海报、包装展示              |
| 海报与插画     | 文生图          | 城市海报、旅行海报、电影海报、新中式水墨、漫画风    |
| 角色与世界观   | 文生图 / 图生图 | 角色设定、动漫人物、游戏角色、故事分镜              |
| UI 与社媒截图  | 文生图 / 图生图 | App 截图、游戏状态页、社媒封面、信息流卡片          |
| 信息图与知识卡 | 文生图          | 科普百科图、流程图、关系图、模块化知识卡            |
| 视频感关键帧   | 文生图 / 图生图 | 电影镜头、运动瞬间、分镜海报、短视频封面            |

### 案例管理策略

案例库建议直接纳入系统管理员功能，而不是长期写死在前端：

- 用户端 `/ai-image` 只读取已发布、当前语言可见、当前 provider 能力可用的案例。
- 系统管理员在 `/sysadmin/prompt-cases` 管理案例，支持创建、编辑、导入、上下线、排序、精选和归因。
- MVP 可以保留一份代码内置种子案例，用于初始化 D1 或 Workers AI / D1 故障时降级展示。
- 从 `awesome-gpt-image-2-prompts` 导入时必须先进入 draft 状态，经人工改写、补齐归因、确认标签后才能发布。
- 外部图片默认只存 URL；若要缓存到 R2，需要保存来源、许可证、导入时间和原始 URL。

### 案例数据结构

前端展示类型可以保持轻量，权威数据存 D1：

```ts
export type PromptCase = {
  id: string;
  title: string;
  category: string;
  modes: Array<"text2image" | "image2image">;
  recommendedSize: string;
  tags: string[];
  promptTemplate: string;
  promptSummary: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  sourceAuthor?: string;
  sourceLicense?: "CC BY 4.0" | "original" | "internal";
  sourceRepo?: string;
  status: "draft" | "published" | "hidden" | "archived";
  featured: boolean;
  sortOrder: number;
  locale: "zh-CN" | "en-US";
  popularity?: {
    likes?: number;
    views?: number;
  };
};
```

导入原则：

- 每个分类先精选 3-5 个案例，总量 20-30 个。
- 不直接展示外部 prompt 全文作为默认值；先做中文化摘要和可填槽位模板。
- 来源案例必须显示作者、来源链接和许可证。
- 外部图片可先不缓存到本项目；若缓存到 R2，需要保存来源和授权说明。

### 系统管理员案例管理

`/sysadmin/prompt-cases` 需要支持：

- 列表：按状态、分类、模式、语言、来源、精选、搜索词筛选。
- 编辑：标题、分类、标签、适用模式、推荐尺寸、prompt 摘要、prompt 模板、缩略图 URL、排序、精选。
- 归因：来源 URL、作者、许可证、来源仓库、原始热度数据。
- 状态流转：draft -> published -> hidden -> archived；archived 不再在用户端展示。
- 批量导入：粘贴 JSON 或导入脚本产物，进入 draft，不直接发布。
- 批量操作：发布、隐藏、归档、调整分类、设置精选。
- 预览：以普通用户视角打开案例详情，检查 prompt 回填效果。

权限边界：

- 仅 sysadmin 可写。
- 普通用户只读已发布案例。
- 外部来源字段只允许 sysadmin 修改，防止归因被误删。

## AI 提示词助手

### 工作流

1. 用户选择案例或分类，也可以从空白开始。
2. 助手根据模式、案例、provider 能力和参考图数量，以自然聊天方式连续追问。
3. AI 与用户最多来回问答 8 次；每次只问 1-2 个短问题，信息足够时提前输出最终 prompt。
4. 输出结构化 brief、最终 prompt、推荐尺寸、风险提醒。
5. 用户在最终 prompt 确认区可先手动编辑，再回填到提示词框并点击“生成图片”。

### 文生图信息收集重点

| 阶段 | 目标                                            |
| ---- | ----------------------------------------------- |
| A    | 确认用途、受众、发布渠道。                      |
| B    | 确认主体、核心卖点或故事。                      |
| C    | 确认风格：摄影、3D、插画、广告、电影感等。      |
| D    | 确认场景、背景、时间、环境。                    |
| E    | 确认构图、镜头、留白和比例。                    |
| F    | 确认光线、材质、色彩、质感。                    |
| G    | 确认图片内文字和必须逐字出现的内容。            |
| H    | 确认避免项：水印、无关 Logo、额外文字、变形等。 |

### 图生图信息收集重点

| 阶段 | 目标                                                   |
| ---- | ------------------------------------------------------ |
| A    | 确认参考图要保留的核心元素。                           |
| B    | 确认希望改变什么：背景、服装、风格、构图、文案、材质。 |
| C    | 确认参考图角色：主体、构图、风格、品牌或氛围。         |
| D    | 确认不可改变项：身份、比例、颜色、Logo、文字、物品。   |
| E    | 确认目标构图、尺寸和画面比例。                         |
| F    | 确认新背景、光线、材质和情绪。                         |
| G    | 确认新增或移除的文字。                                 |
| H    | 确认保守改图或大胆重塑，以及绝对不要发生的变化。       |

### 最终 prompt 输出

文生图：

```text
用途：用于[业务用途]的[图片类型]。
画面：在[场景/环境]中，[主体]呈现[动作/状态]。
主体细节：[材质、颜色、形状、人物/产品细节]。
构图：[景别、角度、主体位置、留白、背景层次]。
风格与光线：[摄影/插画/3D/电影感]，[光线]，[色彩]，[质感]。
文字：[如需出现文字，逐字引用；不需要则写无文字]。
约束：无水印、无无关 Logo、无额外文字；保持[关键限制]。
```

图生图：

```text
基于参考图进行图像编辑。
目标：把参考图改成[用途/目标画面]。
改变：仅改变[背景/光线/服装/风格/文案/材质]。
保持：保持参考图中的[身份/主体比例/产品形状/Logo/构图/颜色]不变。
新增细节：[需要新增的元素]。
构图与光线：[目标构图、镜头、光线、色彩]。
文字：[逐字引用，或明确无文字]。
约束：不要改变未提及元素；不要添加水印、无关 Logo、额外文字。
```

## 生成入口与行为事件（当前实现）

原「流量 A/B」专节已收缩为与代码一致的行为说明，见 **[`../EXPERIMENTS.md`](../EXPERIMENTS.md)**。要点：**无** `experiments` / `experiment_assignments` / `experiment_events` 三表实现；服务端用 `generation_entry_settings` 控制展示，并写入 **`generation_events`**（事件名与安全 metadata 校验见 [`server/src/lib/generationEntry.ts`](../../server/src/lib/generationEntry.ts)）。

| 关注点     | 当前实现概要                                                                    |
| ---------- | ------------------------------------------------------------------------------- |
| 管理 UI    | `web/src/views/sysadmin/GenerationEntry.vue`，路由 `/sysadmin/generation-entry` |
| 客户端上报 | `POST /api/generation/events`，仅允许客户端白名单内事件名                       |
| 任务归因   | `POST /api/generate` 可带 `generationEvent`；任务终态由服务端补齐成功/失败事件  |

以下表格为早期 PRD 中的**事件起名参考**；请以代码内 Zod schema 为最终枚举。

| 事件名（示意）          | 说明                                             |
| ----------------------- | ------------------------------------------------ |
| `entry_exposed`         | 导航或曝光（实现见前端 `generationEntryEvents`） |
| `page_opened`           | 页面打开                                         |
| `prompt_case_selected`  | 选中案例                                         |
| `assistant_*`           | 助手相关                                         |
| `generate_submitted` 等 | 提交与结果                                       |

## 技术方案

### 前端

新增：

- `web/src/views/ai-image/AiImageGeneration.vue`
- `web/src/views/ai-image/promptCases.ts`
- `web/src/views/ai-image/PromptCaseGallery.vue`
- `web/src/views/ai-image/PromptCaseDetail.vue`
- `web/src/views/ai-image/PromptAssistantPanel.vue`
- `web/src/views/ai-image/useAiImageGenerationController.ts`
- `web/src/views/sysadmin/PromptCases.vue`
- `web/src/views/sysadmin/GenerationEntry.vue`

调整：

- `web/src/router/index.ts`：增加 `/ai-image` 与 **`/sysadmin/generation-entry`**。
- **布局**：`AppShell`/侧栏控制器根据 `/api/me` 的 **`generationEntry`**（`navTarget`、`showWorkspace`、`showAiImage`）决定是否展示工作台与 AI 图像页。
- **`web/src/stores/auth.ts`**：持久化 `generationEntry`，与 Bootstrap 对齐。
- `web/src/stores/session.ts` 或新增 composable：复用现有 `/api/generate` 与 WebSocket 合并逻辑。
- `web/src/locales/zh-CN.json`、`web/src/locales/en-US.json`：新增页面、案例、案例管理、实验管理文案。

### 后端

新增：

- `server/src/routes/promptAssistant.ts`
- `server/src/lib/promptAssistant.ts`
- `server/src/lib/promptAssistantSchema.ts`
- `server/src/routes/promptCases.ts`
- `server/src/routes/sysadmin/promptCases.ts`
- `server/src/lib/promptCases.ts`
- `server/src/routes/sysadmin/generationEntry.ts`
- **`server/src/lib/generationEntry.ts`**（设置、解析、客户端/服务端事件、用量窗口聚合）
- **`server/src/routes/generationEvents.ts`** → `POST /api/generation/events`

调整：

- `server/src/index.ts`：挂载 `/api/generation`、`/api/prompt-assistant`、`/api/prompt-cases`。
- **`server/src/routes/me.ts`**：`/api/me` 返回 `generationEntry`。
- `server/wrangler.jsonc`：增加 Workers AI binding。
- `server/src/db/schema.ts`：新增案例、实验与事件表。

建议 API：

```text
POST /api/prompt-assistant/turn
POST /api/generation/events
GET /api/sysadmin/generation-entry
PATCH /api/sysadmin/generation-entry
GET /api/prompt-cases
GET /api/sysadmin/prompt-cases
POST /api/sysadmin/prompt-cases
PATCH /api/sysadmin/prompt-cases/:id
POST /api/sysadmin/prompt-cases/import
```

### 数据库

| 表                          | 目的说明                                                   |
| --------------------------- | ---------------------------------------------------------- |
| `prompt_cases`              | AI 图像生成案例（见 [`../DATABASE.md`](../DATABASE.md)）。 |
| `prompt_case_imports`       | 外部案例导入批次。                                         |
| `generation_entry_settings` | 单行配置：普通用户是否可见工作台 / AI 图像页。             |
| `generation_events`         | 页面与漏斗事件、任务归因；sysadmin 用量窗口内聚合。        |

**历史说明**：原计划中的 `experiments` / `experiment_assignments` / `experiment_events` 三表（多臂流量 A/B）未在当前主线采用，已由 `generation_*` 两张表取代；归档任务书中仍可能出现旧表名，以当前 schema 为准。

### Cloudflare Workers AI

- 使用 `env.AI.run()` 调文本模型生成结构化 JSON。
- 模型名称配置为环境变量，例如 `PROMPT_ASSISTANT_MODEL`。
- 每用户每天默认 30 次助手请求。
- 单次输入最大 6,000 字符，输出最大 1,500 字符。
- 达到限额或 Workers AI 失败时降级为静态案例模板。
- 通过 AI Gateway 或结构化日志记录调用量、延迟、失败率和降级次数。

## 分阶段落地

### Phase 1：独立 AI 图像生成页面骨架

- 新增 `/ai-image` 路由。
- 新增案例分类、案例卡片、详情预览。
- 复用现有 `/api/generate` 创建任务。
- 保留 `/workspace` 不变。

### Phase 2：案例库管理、精选与归因

- 新增 D1 案例表和 sysadmin 管理页。
- 支持手工创建、编辑、上下线、排序和导入 draft。
- 基于 `awesome-gpt-image-2-prompts` 精选 20-30 个案例。
- 统一中文标题、分类、标签、推荐尺寸和 prompt 模板。
- 保留来源 URL、作者、许可证。
- 做基础筛选和搜索。

### Phase 3：AI 提示词助手

- 接入 Workers AI。
- 实现自然连续对话式问答，最多 8 次来回。
- 输出 brief、finalPrompt、recommendedSize、warnings。
- 支持回填、复制、继续调整。

### Phase 4：A/B 测试管理

- 新增实验表、分配逻辑和事件采集。
- sysadmin 页面支持启停、流量、范围和指标。
- `/api/me` 返回当前用户生成入口变体。
- 普通用户侧边栏根据分配展示主入口。

### Phase 5：验证与发布

- 补 API、store、页面和实验逻辑测试。
- 做桌面/移动端视觉验收。
- 灰度启用 25% B 变体，观察指标。
- 达标后扩大到 50% 或全量。

## 成功指标

- AI 图像生成页的首次生成提交率高于图像生成页。
- AI 图像生成页从打开到首次提交的中位时间下降。
- AI 助手打开后的 prompt 回填率大于 50%。
- AI 图像生成页的任务失败后立即重试率低于图像生成页。
- Workers AI 降级率低于 2%。
- A/B 实验事件丢失率低于 1%。

## 风险与缓解

| 风险                            | 影响                 | 缓解                                                                             |
| ------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| 新页面与旧工作台共享状态复杂    | 任务和历史展示不一致 | 生成任务仍走 `/api/generate`，只把 prompt 构造前置；会话与任务权威数据仍在后端。 |
| 案例库版权或归因不清            | 合规风险             | sysadmin 导入后默认 draft；发布前必须补齐作者、来源和许可证；用户端展示归因。    |
| 案例编辑误伤线上体验            | 普通用户看到坏模板   | 案例有 draft/published/hidden/archived 状态；编辑草稿预览通过后再发布。          |
| A/B 指标污染                    | 决策不可信           | 记录 direct access 和 sysadmin 预览事件，指标默认排除 sysadmin。                 |
| AI 助手输出 provider 不支持能力 | 生成失败             | 每次助手请求带 `providerCapabilities`，最终 prompt 只回填，不绕过服务端校验。    |
| Workers AI 不稳定或额度不足     | 用户阻塞             | feature flag、KV 日限额、静态模板降级。                                          |

## 相关文档

- [`../FRONTEND.md`](../FRONTEND.md)
- [`../API.md`](../API.md)
- [`../DATABASE.md`](../DATABASE.md)
- [`../SECURITY.md`](../SECURITY.md)
- [`../archive/ai-image-generation-page-tasks.md`](../archive/ai-image-generation-page-tasks.md)
