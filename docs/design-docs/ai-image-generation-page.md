# AI 图像生成页面与 A/B 测试方案

状态：proposal  
日期：2026-04-28  
关联任务：[`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)

## 背景

现有 `/workspace` 图像生成页偏专业工作台：用户需要先理解模式、尺寸、张数、参考图，再自行编写 prompt。这个入口适合熟悉模型能力的用户，但普通用户更需要“先选用途、看案例、让 AI 帮我写”的路径。

本方案把体验拆成两条产品线：

- **图像生成**：保留现有 `/workspace`，定位为专业工作台，继续承载文生图、图生图、连续对话、历史会话、失败重试等完整能力。
- **AI 图像生成**：新增独立页面，定位为普通用户入口，主流程是“案例启发 -> AI 问答写 prompt -> 确认 prompt -> 调用现有生成任务”。

系统管理员新增两类管理能力：一是管理 AI 图像生成页的案例库，二是在“图像生成”和“AI 图像生成”之间做 A/B 测试流量分配、用户分组、实验状态管理和指标查看。

## 目标

1. 新建面向普通用户的 `AI 图像生成` 页面，不在现有工作台里堆叠更多模块。
2. 保留 `图像生成` 专业页，避免打断当前熟练用户和管理员的工作流。
3. 典型案例库参考 [EvoLinkAI/awesome-gpt-image-2-prompts](https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts)，以“可复用场景 + 效果预览 + 来源归因”的方式精选，而不是简单复制所有 prompt。
4. 仅在 `text2image`、`image2image` 模式启用 AI 提示词助手；`chat` 仍由现有工作台处理。
5. 系统管理员能管理案例：新增、编辑、导入、上下线、排序、归因、标记精选。
6. 系统管理员能管理生成入口 A/B 测试：启停实验、设置变体、分配流量、查看曝光与转化。

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

| 页面         | 路由                                    | 定位           | 入口策略                    |
| ------------ | --------------------------------------- | -------------- | --------------------------- |
| 图像生成     | `/workspace`、`/workspace/s/:sessionId` | 专业工作台     | 保留现状，作为 A/B 变体 A。 |
| AI 图像生成  | `/ai-image`                             | 普通用户入口   | 新增页面，作为 A/B 变体 B。 |
| 历史记录     | `/history`                              | 会话与图片历史 | 两个生成页共享。            |
| 案例管理     | `/sysadmin/prompt-cases`                | 系统管理员配置 | 管理 AI 图像生成案例库。    |
| A/B 测试管理 | `/sysadmin/experiments/generation`      | 系统管理员配置 | 仅 sysadmin 可见。          |

A/B 测试运行时，普通用户侧边栏只突出一个主入口：

- 变体 A 用户看到主入口“图像生成”，指向 `/workspace`。
- 变体 B 用户看到主入口“AI 图像生成”，指向 `/ai-image`。
- 直接访问另一个路由不强制禁止，但需要记录 `direct_access` 事件，避免污染主入口转化判断。

系统管理员不受实验分配影响，侧边栏应同时显示两个入口，并能预览任一变体。

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
2. 助手根据模式、案例、provider 能力和参考图数量发起 6-10 轮短问答。
3. 每轮只问 1-2 个问题，信息足够时允许第 6 轮提前输出。
4. 输出结构化 brief、最终 prompt、推荐尺寸、风险提醒。
5. 用户确认后回填 prompt，手动点击“生成图片”。

### 文生图问答骨架

| 轮次 | 目标                                            |
| ---- | ----------------------------------------------- |
| 1    | 确认用途、受众、发布渠道。                      |
| 2    | 确认主体、核心卖点或故事。                      |
| 3    | 确认风格：摄影、3D、插画、广告、电影感等。      |
| 4    | 确认场景、背景、时间、环境。                    |
| 5    | 确认构图、镜头、留白和比例。                    |
| 6    | 确认光线、材质、色彩、质感。                    |
| 7    | 确认图片内文字和必须逐字出现的内容。            |
| 8    | 确认避免项：水印、无关 Logo、额外文字、变形等。 |
| 9    | 生成 2-3 个方向供用户选。                       |
| 10   | 输出最终 prompt 与推荐尺寸。                    |

### 图生图问答骨架

| 轮次 | 目标                                                   |
| ---- | ------------------------------------------------------ |
| 1    | 确认参考图要保留的核心元素。                           |
| 2    | 确认希望改变什么：背景、服装、风格、构图、文案、材质。 |
| 3    | 确认参考图角色：主体、构图、风格、品牌或氛围。         |
| 4    | 确认不可改变项：身份、比例、颜色、Logo、文字、物品。   |
| 5    | 确认目标构图、尺寸和画面比例。                         |
| 6    | 确认新背景、光线、材质和情绪。                         |
| 7    | 确认新增或移除的文字。                                 |
| 8    | 确认绝对不要发生的变化。                               |
| 9    | 选择保守改图或大胆重塑。                               |
| 10   | 输出 edit prompt，并列出 preserve/change。             |

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

## A/B 测试管理

### 实验变体

| 变体 | 路由         | 名称        | 目标                               |
| ---- | ------------ | ----------- | ---------------------------------- |
| A    | `/workspace` | 图像生成    | 当前专业工作台体验。               |
| B    | `/ai-image`  | AI 图像生成 | 场景化、案例驱动、AI 帮写 prompt。 |

### 管理能力

系统管理员页面 `/sysadmin/experiments/generation` 需要支持：

- 查看当前实验状态：draft、running、paused、archived。
- 设置入口策略：并列展示、强制旧版、强制新版、A/B 测试。
- 设置流量：A/B 百分比，MVP 支持 0/25/50/75/100。
- 设置适用范围：全部普通用户、指定 admin 名下用户、指定用户白名单。
- 设置分配方式：按 `userId + experimentKey + salt` 稳定哈希；也允许手动覆盖。
- 查看核心指标：曝光、首次生成、prompt 回填、任务成功、失败重试、返回历史、直接访问另一路由。
- 暂停实验后保持既有用户分配，但不再新增分配。

### 指标事件

| 事件名                      | 触发时机                | 关键字段                                   |
| --------------------------- | ----------------------- | ------------------------------------------ |
| `generation_entry_exposed`  | 用户看到生成入口        | `variant`, `route`, `navLabel`             |
| `generation_page_opened`    | 页面 mounted            | `variant`, `route`, `directAccess`         |
| `prompt_case_selected`      | 选择案例                | `caseId`, `category`, `sourceRepo`         |
| `assistant_started`         | 打开 AI 助手            | `mode`, `caseId`                           |
| `assistant_prompt_filled`   | 最终 prompt 回填        | `turnCount`, `caseId`, `promptLength`      |
| `generate_submitted`        | 调用 `/api/generate` 前 | `mode`, `size`, `n`, `referenceImageCount` |
| `generate_succeeded`        | WS `task.done`          | `taskId`, `imageCount`                     |
| `generate_failed`           | WS `task.failed`        | `taskId`, `errorCode`                      |
| `variant_switched_directly` | 用户直达另一个变体      | `fromVariant`, `toVariant`                 |

指标只记录结构化字段，不记录完整 prompt、参考图内容或 API Key。

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
- `web/src/views/sysadmin/GenerationExperiment.vue`

调整：

- `web/src/router/index.ts`：增加 `/ai-image` 与 `/sysadmin/experiments/generation`。
- `web/src/components/layout/AppShell.vue`：根据实验分配决定普通用户主入口；sysadmin 同时显示两个入口。
- `web/src/stores/auth.ts`：`/api/me` 返回 `generationExperience` 分配快照。
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
- `server/src/routes/sysadmin/generationExperiment.ts`
- `server/src/lib/experiments.ts`

调整：

- `server/src/index.ts`：挂载 `/api/prompt-assistant`。
- `server/src/index.ts`：挂载 `/api/prompt-cases` 用户端只读路由。
- `server/src/routes/sysadmin.ts`：注册案例管理和生成体验实验管理路由。
- `server/src/routes/me.ts`：返回当前用户的 `generationExperience`。
- `server/wrangler.jsonc`：增加 Workers AI binding。
- `server/src/db/schema.ts`：新增案例、实验与事件表。

建议 API：

```text
POST /api/prompt-assistant/turn
POST /api/experiments/events
GET /api/sysadmin/experiments/generation
PATCH /api/sysadmin/experiments/generation
GET /api/sysadmin/experiments/generation/metrics
GET /api/prompt-cases
GET /api/sysadmin/prompt-cases
POST /api/sysadmin/prompt-cases
PATCH /api/sysadmin/prompt-cases/:id
POST /api/sysadmin/prompt-cases/import
```

### 数据库

建议新增 D1 表：

| 表                       | 目的                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `prompt_cases`           | 存 AI 图像生成案例、prompt 模板、分类、状态、归因、排序和精选标记。   |
| `prompt_case_imports`    | 存外部案例导入批次、来源、导入人、导入结果与错误。                    |
| `experiments`            | 存实验 key、状态、入口策略、流量配置、salt、适用范围、创建/更新时间。 |
| `experiment_assignments` | 存用户到变体的稳定分配与手动覆盖。                                    |
| `experiment_events`      | 存曝光、页面打开、prompt 回填、生成提交、任务结果等结构化事件。       |

MVP 可以只建一个固定实验 `generation_experience`，不做通用实验平台抽象。

### Cloudflare Workers AI

- 使用 `env.AI.run()` 调文本模型生成结构化 JSON。
- 模型名称配置为环境变量，例如 `PROMPT_ASSISTANT_MODEL`。
- 每用户每天默认 30 轮助手请求。
- 每轮输入最大 6,000 字符，输出最大 1,500 字符。
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
- 实现 6-10 轮问答。
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
| AI 助手输出 provider 不支持能力 | 生成失败             | 每轮请求带 `providerCapabilities`，最终 prompt 只回填，不绕过服务端校验。        |
| Workers AI 不稳定或额度不足     | 用户阻塞             | feature flag、KV 日限额、静态模板降级。                                          |

## 相关文档

- [`../FRONTEND.md`](../FRONTEND.md)
- [`../API.md`](../API.md)
- [`../DATABASE.md`](../DATABASE.md)
- [`../SECURITY.md`](../SECURITY.md)
- [`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)
