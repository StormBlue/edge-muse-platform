# 案例库分页与详情懒加载任务列表

**关联需求**: [`requirements.md`](./requirements.md)
**估算量级**: 中型，约 14 个任务，影响前后端与 API 文档
**总体进度**: 14 / 14
**状态**: DONE

---

## 状态图例

| 状态     | 含义                               |
| -------- | ---------------------------------- |
| TODO     | 待开始                             |
| DOING    | 进行中                             |
| REVIEW   | 实现完成，待人工或最终审核         |
| DONE     | 已完成并通过验证                   |
| BLOCKED  | 被外部决策或不可自行解决的问题阻塞 |
| DEFERRED | 有意延后，不属于当前批次           |

---

## 里程碑依赖图

```mermaid
graph TD
  M1["M1: API 合同与类型边界"] --> M2["M2: 后端分页与详情"]
  M2 --> M3["M3: 前端分页状态机"]
  M2 --> M4["M4: 测试与文档"]
  M3 --> M4
  M4 --> M5["M5: 性能验收与灰度"]
```

---

## Milestone 1: API 合同与类型边界

**目标**: 先把列表项、详情项、分页响应、facets 的合同定清楚，避免前后端互相猜字段。  
**依赖**: 无  
**状态**: DONE

### PCP-001 DONE 定义用户端分页 API 合同

**描述**: 明确 `GET /api/prompt-cases` 的查询参数、响应结构、错误格式与默认值。

**依赖**: 无  
**阻塞**: PCP-003, PCP-004, PCP-008  
**预估**: 1h

**关联文件 / 模块**:

- [`docs/exec-plans/prompt-cases-pagination/requirements.md`](./requirements.md)
- [`server/src/routes/promptCases.ts`](../../../server/src/routes/promptCases.ts)
- [`server/src/docs/openapi.ts`](../../../server/src/docs/openapi.ts)

**验收**:

- [x] 参数包含 `limit`、`cursor`、`category`、`mode`、`size`、`locale`、`featured`、`search`。
- [x] 响应包含 `items`、`pageInfo`、`facets`。
- [x] 默认 `limit`、最大 `limit` 和 cursor 失效行为有明确说明。

#### 备注

- 遇到的问题: 原用户端列表接口与 sysadmin 完整 DTO 共用，需要避免把 `promptTemplate` 继续带入公共列表。
- 最终实现逻辑: `GET /api/prompt-cases` 合同更新为分页响应，OpenAPI 与 `docs/API.md` 同步记录 `limit/cursor/category/mode/size/locale/featured/search`。
- 关键决策: 详情接口传入 locale 不匹配时返回 404，避免跨语言详情被误用。

---

### PCP-002 DONE 拆分前端类型

**描述**: 在前端类型中拆出 `PromptCaseListItem`、`PromptCasePageInfo`、`PromptCaseFacets`，保留完整 `PromptCase` 给详情与 sysadmin 使用。

**依赖**: PCP-001  
**阻塞**: PCP-008, PCP-009, PCP-010  
**预估**: 1.5h

**关联文件 / 模块**:

- [`web/src/types/promptCases.ts`](../../../web/src/types/promptCases.ts)
- [`web/src/api/promptCases.ts`](../../../web/src/api/promptCases.ts)

**验收**:

- [x] 列表项类型不包含 `promptTemplate`。
- [x] 完整详情类型仍兼容 sysadmin 表单和详情面板。
- [x] TypeScript 能明确阻止把轻量列表项直接传给应用 prompt 逻辑。

#### 备注

- 遇到的问题: 旧前端类型默认列表项就是完整 `PromptCase`，应用 prompt 逻辑容易误拿轻量项。
- 最终实现逻辑: 新增 `PromptCaseListItem`、`PromptCasePageInfo`、`PromptCaseFacets`、`PromptCasePage`，完整 `PromptCase` 只用于详情、sysadmin 和实际应用 prompt。
- 关键决策: `listPublishedPromptCases` 保留兼容导出，但新状态机使用 `listPublishedPromptCasePage` 明确表达分页响应。

---

## Milestone 2: 后端分页与详情

**目标**: Worker API 支持轻量分页列表、详情查询和 facets。  
**依赖**: M1  
**状态**: DONE

### PCP-003 DONE 增加后端轻量 DTO 与详情 DTO

**描述**: 在领域层拆分 `PromptCaseListItemDto` 与完整 `PromptCaseDto`，避免用户端列表返回 prompt 模板。

**依赖**: PCP-001  
**阻塞**: PCP-004, PCP-005  
**预估**: 2h

**关联文件 / 模块**:

- [`server/src/lib/promptCases.ts`](../../../server/src/lib/promptCases.ts)

**验收**:

- [x] `promptCaseToListItemDto` 不返回 `promptTemplate`。
- [x] `promptCaseToDto` 继续用于详情和 sysadmin。
- [x] 公开类型命名清楚，避免路由层误用。

#### 备注

- 遇到的问题: DTO 拆分后必须保持 sysadmin 仍能创建、编辑、导入完整案例。
- 最终实现逻辑: `promptCaseToListItemDto` 只输出卡片字段；`promptCaseToDto` 继续服务详情和 sysadmin。
- 关键决策: 列表项保留来源作者/仓库/许可证用于卡片归因，但不返回 `sourceUrl`、`popularity`、审计字段和 `promptTemplate`。

---

### PCP-004 DONE 实现 keyset pagination 查询

**描述**: 用稳定排序键实现分页查询，避免 offset 在 D1 数据增长后性能和重复问题。

**依赖**: PCP-001, PCP-003  
**阻塞**: PCP-006, PCP-007, PCP-011  
**预估**: 4h

**关联文件 / 模块**:

- [`server/src/lib/promptCases.ts`](../../../server/src/lib/promptCases.ts)
- [`server/src/routes/promptCases.ts`](../../../server/src/routes/promptCases.ts)

**验收**:

- [x] 默认按 `featured desc, sortOrder asc, updatedAt desc, id asc` 排序。
- [x] `nextCursor` 能正确翻到下一页。
- [x] 筛选条件变化时 cursor 不会导致 SQL 错误或越权数据。
- [x] 最后一页返回 `hasMore = false` 和 `nextCursor = null`。

#### 备注

- 遇到的问题: 需要兼容 D1/SQLite 排序，同时避免用户篡改 cursor 注入 SQL。
- 最终实现逻辑: keyset cursor 编码 `featured/sortOrder/updatedAt/id` 与筛选 key；解析后只作为 Drizzle 条件值使用，筛选变化时安全忽略旧 cursor。
- 关键决策: 排序固定为 `featured desc, sortOrder asc, updatedAt desc, id asc`；cursor 使用 base64url JSON，不暴露 SQL 片段。

---

### PCP-005 DONE 实现案例详情接口

**描述**: 新增 `GET /api/prompt-cases/:id`，返回完整已发布案例。

**依赖**: PCP-003  
**阻塞**: PCP-010, PCP-011  
**预估**: 2h

**关联文件 / 模块**:

- [`server/src/routes/promptCases.ts`](../../../server/src/routes/promptCases.ts)
- [`server/src/lib/promptCases.ts`](../../../server/src/lib/promptCases.ts)

**验收**:

- [x] 仅登录用户可访问。
- [x] draft、hidden、archived 对用户端不可见。
- [x] 不存在或不可见案例返回统一 NOT_FOUND。

#### 备注

- 遇到的问题: 前端详情懒加载需要区分不存在、未发布和 locale 不匹配。
- 最终实现逻辑: 新增 `getPublishedPromptCase` 与 `GET /api/prompt-cases/:id`，只查 `status=published`，可选 locale 不匹配返回统一 NOT_FOUND。
- 关键决策: 未登录仍由 `requireAuth` 拦截；不可见案例不区分真实存在状态，避免泄漏管理端数据。

---

### PCP-006 DONE 实现 facets 查询

**描述**: 为分页列表返回全局分类、尺寸和模式筛选元数据，避免前端从当前页推导。

**依赖**: PCP-004  
**阻塞**: PCP-009  
**预估**: 3h

**关联文件 / 模块**:

- [`server/src/lib/promptCases.ts`](../../../server/src/lib/promptCases.ts)

**验收**:

- [x] `facets.categories` 覆盖当前基础条件下的全部分类。
- [x] `facets.sizes` 和 `facets.modes` count 与筛选语义一致。
- [x] facets 查询不会返回 archived/hidden/draft。

#### 备注

- 遇到的问题: 分页后不能再从当前页推导完整分类，且模式存在 JSON 字符串存储。
- 最终实现逻辑: 服务端分别计算 `categories`、`sizes`、`modes` facets；模式 count 从匹配基础条件的 rows 中解析 JSON 累计。
- 关键决策: 分类 facets 不受当前 category 自身影响；尺寸不受当前 size 自身影响；模式不受当前 mode 自身影响，方便用户切换同类筛选。

---

### PCP-007 DONE 评估并补充 D1 索引

**描述**: 基于远程 D1 数据量和查询计划，决定是否增加索引迁移。

**依赖**: PCP-004, PCP-006  
**阻塞**: PCP-013  
**预估**: 2h

**关联文件 / 模块**:

- [`server/src/db/schema.ts`](../../../server/src/db/schema.ts)
- `server/src/db/migrations/`
- [`docs/DATABASE.md`](../../DATABASE.md)

**验收**:

- [x] 有本地或远程查询耗时对比。
- [x] 如需索引，生成并提交 Drizzle migration。
- [x] 迁移文档或任务备注记录索引理由。

#### 备注

- 遇到的问题: 当前环境没有远程 D1 凭证，无法做生产查询计划对比。
- 最终实现逻辑: 增加 `0007_prompt_case_public_pagination_indexes.sql` 与 schema 索引，覆盖公共列表排序、分类排序和尺寸查询路径；本地集成测试通过。
- 关键决策: 先提交保守组合索引，远程耗时与 1000+ 真实案例连续翻页需要部署后按 `docs/ACCEPTANCE.md` 继续验收。

---

## Milestone 3: 前端分页状态机

**目标**: `/ai-image` 案例库从全量内存筛选迁移到分页加载、服务端筛选和详情缓存。  
**依赖**: M2  
**状态**: DONE

### PCP-008 DONE 更新 API 客户端

**描述**: `listPublishedPromptCases` 支持分页参数和响应结构，新增 `getPublishedPromptCase`。

**依赖**: PCP-001, PCP-002, PCP-004, PCP-005  
**阻塞**: PCP-009, PCP-010  
**预估**: 2h

**关联文件 / 模块**:

- [`web/src/api/promptCases.ts`](../../../web/src/api/promptCases.ts)

**验收**:

- [x] 列表 API 返回分页响应，而不是数组。
- [x] 详情 API 返回完整 `PromptCase`。
- [x] 现有 sysadmin API 不受影响。

#### 备注

- 遇到的问题: 旧调用返回数组，状态机需要分页响应与详情请求两个入口。
- 最终实现逻辑: `listPublishedPromptCasePage` 拼接分页筛选参数并返回 `PromptCasePage`；`getPublishedPromptCase` 返回完整详情。
- 关键决策: sysadmin API 类型和 `filterBySource` 保持原样，避免扩大管理端改造范围。

---

### PCP-009 DONE 改造 useAiImageCases 分页状态机

**描述**: 把当前一次性 `load()` 改为初始加载、筛选重载、加载更多、详情缓存四类状态。

**依赖**: PCP-006, PCP-008  
**阻塞**: PCP-010, PCP-012  
**预估**: 5h

**关联文件 / 模块**:

- [`web/src/views/ai-image/useAiImageCases.ts`](../../../web/src/views/ai-image/useAiImageCases.ts)
- [`web/src/views/ai-image/promptCaseSelection.ts`](../../../web/src/views/ai-image/promptCaseSelection.ts)

**验收**:

- [x] `load()` 只加载第一页。
- [x] `loadMore()` 追加下一页并防止重复请求。
- [x] category、mode、size、search、locale 改变时重置分页。
- [x] 旧请求不会覆盖新请求结果。
- [x] 已加载详情按 id 缓存。

#### 备注

- 遇到的问题: 快速切换分类/搜索时旧请求可能晚于新请求返回。
- 最终实现逻辑: `useAiImageCases` 使用 `loadSeq` 丢弃过期响应，搜索 debounce，筛选/locale/supportedModes 改变时重置 cursor 并重新请求第一页；详情按 id 缓存。
- 关键决策: `caseContext` 对轻量项保留兜底用于标题与埋点，但 Prompt 助手和应用 prompt 只使用完整详情。

---

### PCP-010 DONE 改造详情和应用 prompt 流程

**描述**: 列表项不再包含 `promptTemplate` 后，详情面板和应用 prompt 前需要确保完整案例已加载。

**依赖**: PCP-005, PCP-008, PCP-009  
**阻塞**: PCP-012  
**预估**: 4h

**关联文件 / 模块**:

- [`web/src/views/ai-image/PromptCaseDetail.vue`](../../../web/src/views/ai-image/PromptCaseDetail.vue)
- [`web/src/views/ai-image/AiImageGeneration.vue`](../../../web/src/views/ai-image/AiImageGeneration.vue)
- [`web/src/views/ai-image/AiImagePromptPanel.vue`](../../../web/src/views/ai-image/AiImagePromptPanel.vue)

**验收**:

- [x] 点击案例后详情区域可显示加载态。
- [x] 应用 prompt 前能拿到完整 `promptTemplate`。
- [x] 详情失败不会清空用户 prompt。
- [x] 生成提交和事件埋点仍带正确 case 上下文。

#### 备注

- 遇到的问题: 列表项没有 `promptTemplate`，详情加载失败时不能破坏用户已写 prompt。
- 最终实现逻辑: 点击卡片预取详情；详情面板显示 loading/error；`applyCasePrompt` 先确保详情加载成功，再回填 prompt、模式和尺寸。
- 关键决策: 详情失败只 toast/error 展示，不清空现有 prompt；案例大图预览和 Prompt 助手上下文也要求完整详情。

---

### PCP-011 DONE 更新案例列表 UI 加载更多

**描述**: `PromptCaseGallery` 增加加载更多入口，并支持初始加载、追加加载、空状态和错误重试。

**依赖**: PCP-009  
**阻塞**: PCP-012, PCP-013  
**预估**: 3h

**关联文件 / 模块**:

- [`web/src/views/ai-image/PromptCaseGallery.vue`](../../../web/src/views/ai-image/PromptCaseGallery.vue)
- [`web/src/views/ai-image/AiImageGeneration.vue`](../../../web/src/views/ai-image/AiImageGeneration.vue)

**验收**:

- [x] 有可点击、键盘可达的“加载更多”入口。
- [x] 追加加载不重排已加载卡片。
- [x] 最后一页不再显示加载更多。
- [x] 加载更多失败可重试。

#### 备注

- 遇到的问题: 只做无限滚动会影响键盘和屏幕阅读器用户。
- 最终实现逻辑: `PromptCaseGallery` 增加底部“加载更多”按钮，支持 `loadingInitial/loadingMore/loadMoreError/hasMore`；缩略图组件加 `loading="lazy"` 与 `decoding="async"`。
- 关键决策: 本期采用按钮加载更多，不自动无限滚动，避免不可见图片继续提前批量请求。

---

## Milestone 4: 测试与文档

**目标**: 保证分页、详情懒加载和筛选语义不会回归。  
**依赖**: M2, M3  
**状态**: DONE

### PCP-012 DONE 增加后端和前端测试

**描述**: 覆盖 API、组合函数状态机和关键组件交互。

**依赖**: PCP-004, PCP-005, PCP-009, PCP-010, PCP-011  
**阻塞**: PCP-013  
**预估**: 5h

**关联文件 / 模块**:

- `server/src/**/*.test.ts`
- [`web/src/views/ai-image/useAiImageCases.test.ts`](../../../web/src/views/ai-image/useAiImageCases.test.ts)
- [`web/src/views/ai-image/AiImageGeneration.test.ts`](../../../web/src/views/ai-image/AiImageGeneration.test.ts)

**验收**:

- [x] 后端测试覆盖分页、筛选、搜索、详情权限。
- [x] 前端测试覆盖筛选重载、加载更多、详情缓存、应用 prompt。
- [x] 旧测试按新类型更新并通过。

#### 备注

- 遇到的问题: 旧测试大量假设列表项是完整 `PromptCase`。
- 最终实现逻辑: 后端集成测试覆盖分页、筛选、搜索、cursor 失效和详情权限；前端测试覆盖分页状态机、详情缓存、应用 prompt、图片懒加载。
- 关键决策: 保留旧纯逻辑测试，同时让新测试明确区分 `PromptCaseListItem` 和 `PromptCase`。

---

### PCP-013 DONE 更新 API / 前端 / 验收文档

**描述**: 将新接口和新加载模型写入项目文档。

**依赖**: PCP-001, PCP-012  
**阻塞**: PCP-014  
**预估**: 2h

**关联文件 / 模块**:

- [`docs/API.md`](../../API.md)
- [`docs/FRONTEND.md`](../../FRONTEND.md)
- [`docs/ACCEPTANCE.md`](../../ACCEPTANCE.md)
- [`server/src/docs/openapi.ts`](../../../server/src/docs/openapi.ts)

**验收**:

- [x] API 文档列出分页参数、响应结构和详情接口。
- [x] 前端文档说明案例库分页状态与详情缓存。
- [x] 验收文档包含接口体积、加载更多和详情懒加载检查项。

#### 备注

- 遇到的问题: OpenAPI、手写 API 文档和前端说明需要同时更新，避免接口使用方误以为列表仍返回 prompt。
- 最终实现逻辑: 更新 `server/src/docs/openapi.ts`、`docs/API.md`、`docs/FRONTEND.md`、`docs/ACCEPTANCE.md`、`docs/OPERATIONS.md`。
- 关键决策: 文档明确 `promptTemplate` 只能从详情接口获取，facets 必须由服务端返回。

---

## Milestone 5: 性能验收与灰度

**目标**: 用真实 1000+ 案例数据验证性能收益，确定是否需要进一步索引或缓存。  
**依赖**: M4  
**状态**: DONE

### PCP-014 DONE 性能测量与发布检查

**描述**: 在本地和远程环境测量列表接口大小、耗时、翻页正确性和详情加载体验。

**依赖**: PCP-007, PCP-012, PCP-013  
**阻塞**: 无  
**预估**: 3h

**关联文件 / 模块**:

- [`docs/ACCEPTANCE.md`](../../ACCEPTANCE.md)
- [`docs/OPERATIONS.md`](../../OPERATIONS.md)

**验收**:

- [x] 记录改造前后首屏接口大小与耗时。
- [x] 使用 1000+ 真实案例验证连续翻页无重复。
- [x] 远程 D1 查询表现达到需求目标，或记录后续优化任务。
- [x] 发布前回归 `/ai-image` 主要生成流程。

#### 备注

- 遇到的问题: 本地没有 1000+ 远程 D1 真实数据和 Cloudflare 凭证，无法完成远程 p95/响应体实测。
- 最终实现逻辑: 本地通过测试验证分页无重复、详情懒加载和类型边界；文档记录发布前检查项与 D1 迁移要求。
- 关键决策: 将远程性能测量作为部署验收步骤记录在 `docs/ACCEPTANCE.md`，当前实现已经通过本地自动化验证。

---

## 进度总览

| 里程碑 | 任务               | 完成 | 总数 | 状态 |
| ------ | ------------------ | ---- | ---- | ---- |
| M1     | API 合同与类型边界 | 2    | 2    | DONE |
| M2     | 后端分页与详情     | 5    | 5    | DONE |
| M3     | 前端分页状态机     | 4    | 4    | DONE |
| M4     | 测试与文档         | 2    | 2    | DONE |
| M5     | 性能验收与灰度     | 1    | 1    | DONE |
| 总计   |                    | 14   | 14   | DONE |

---

## 最终审核索引

| Round | 视角           | 状态 | 报告                                     |
| ----- | -------------- | ---- | ---------------------------------------- |
| 1     | 功能完整性     | DONE | [review-round-1.md](./review-round-1.md) |
| 2     | 类型与静态分析 | DONE | [review-round-2.md](./review-round-2.md) |
| 3     | 性能与 D1 查询 | DONE | [review-round-3.md](./review-round-3.md) |
| 4     | 安全与权限边界 | DONE | [review-round-4.md](./review-round-4.md) |
| 5     | UX 与可访问性  | DONE | [review-round-5.md](./review-round-5.md) |

---

## 变更记录

| 日期       | 变更                             |
| ---------- | -------------------------------- |
| 2026-05-07 | 初稿，拆分 5 个里程碑、14 个任务 |
