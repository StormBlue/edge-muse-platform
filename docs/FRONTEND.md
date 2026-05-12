# 前端（Vue 3）

SPA 位于 [`web/`](../web/)，构建产物由 Worker 以静态资源形式提供。

## 入口与全局

| 文件                                                    | 职责                            |
| ------------------------------------------------------- | ------------------------------- |
| [`web/src/main.ts`](../web/src/main.ts)                 | 创建应用、Pinia、i18n、全局样式 |
| [`web/src/App.vue`](../web/src/App.vue)                 | 根布局                          |
| [`web/src/router/index.ts`](../web/src/router/index.ts) | 路由与导航守卫                  |

## 双入口与 UI 产品线

原单独的「前端 UI 重设计 brief」已收拢到本节与 [`design-docs/ai-image-generation-page.md`](./design-docs/ai-image-generation-page.md)（已实现说明）。

- **专业工作台**：[`/workspace`](../web/src/views/workspace/Workspace.vue) — 完整模式、尺寸、参考图与张数组合；沿用会话与 WebSocket 管线。
- **AI 图像生成**：[`/ai-image`](../web/src/views/ai-image/AiImageGeneration.vue) — 普通用户导向：案例、Prompt 助手、再进入同一套 `/api/generate` 任务。
- **侧边栏与默认落地页**：普通用户可见项由 **`generationEntry`**（`/api/me`）与 sysadmin [`/sysadmin/generation-entry`](../web/src/views/sysadmin/) 配置；详见 [`EXPERIMENTS.md`](./EXPERIMENTS.md)。sysadmin 始终可见两入口以便验收。

运行时行为以代码与 EXPERIMENTS 为准；不包含历史文档中的「按用户哈希的流量百分比 A/B」模型。

### AI 图像生成案例加载

`/ai-image` 的案例库由 [`useAiImageCases`](../web/src/views/ai-image/useAiImageCases.ts) 管理：

- 首屏只请求 `GET /api/prompt-cases?limit=60` 的轻量列表项，列表项不包含 `promptTemplate`。
- 分类、模式、尺寸、搜索和 locale 切换都会重置 cursor 并重新请求服务端；分类与尺寸按钮来自服务端 `facets`，不再从当前页推导全局选项。
- “加载更多”通过 `pageInfo.nextCursor` 追加下一页，并对重复 id 做前端去重。
- 用户预览或应用案例时会按需调用 `GET /api/prompt-cases/:id`，完整详情按 id 缓存；应用 prompt、Prompt 助手上下文和案例大图预览只使用已加载的完整详情。
- 案例缩略图组件使用浏览器原生 `loading="lazy"` 与 `decoding="async"`，避免不可见卡片图片立即全量加载。

## Pinia 与全局状态

| Store                                                       | 用途                                              |
| ----------------------------------------------------------- | ------------------------------------------------- |
| [`web/src/stores/auth.ts`](../web/src/stores/auth.ts)       | 登录态、用户 profile、`providerCapabilities`      |
| [`web/src/stores/session.ts`](../web/src/stores/session.ts) | 当前会话列表、消息、乐观更新与 WebSocket 事件合并 |
| [`web/src/stores/ui.ts`](../web/src/stores/ui.ts)           | UI 偏好（主题等）                                 |

## 主要视图

| 路径前缀  | 文件                                                                                      | 说明                                          |
| --------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| AI 生图页 | [`views/ai-image/AiImageGeneration.vue`](../web/src/views/ai-image/AiImageGeneration.vue) | 普通用户新入口；与实验 `navTarget` 对齐       |
| 工作台    | [`views/workspace/Workspace.vue`](../web/src/views/workspace/Workspace.vue)               | 经典生图主界面；按 provider 能力过滤模式/尺寸 |
| 历史      | [`views/history/History.vue`](../web/src/views/history/History.vue)                       | 会话搜索与排序                                |
| 登录      | [`views/auth/Login.vue`](../web/src/views/auth/Login.vue)                                 | 地区化验证码 + 表单                           |
| 管理      | [`views/admin/UserList.vue`](../web/src/views/admin/UserList.vue)                         | 管理员：用户与配额                            |
| 系统管理  | [`views/sysadmin/*.vue`](../web/src/views/sysadmin/)                                      | 看板、密钥、生成实验配置、案例库、会话审计等  |

## 关键组件

- **输入与参数**：[`web/src/components/chat/ChatInput.vue`](../web/src/components/chat/ChatInput.vue) — 尺寸选项与参考图上限来自 store 中的能力快照。
- **消息与看图**：[`ChatMessage.vue`](../web/src/components/chat/ChatMessage.vue)、[`ImageMessage.vue`](../web/src/components/image/ImageMessage.vue)、[`ImageViewer.vue`](../web/src/components/image/ImageViewer.vue)。
- **实时任务**：[`web/src/composables/useTaskWebSocket.ts`](../web/src/composables/useTaskWebSocket.ts)。

## API 客户端

[`web/src/api/client.ts`](../web/src/api/client.ts) — 统一处理 base URL、Cookie、CSRF 头与错误解析。

## 相关文档

- [`DESIGN.md`](./DESIGN.md) — 前后端共同约定
- [`design-docs/ai-image-generation-page.md`](./design-docs/ai-image-generation-page.md) — AI 图像页背景、信息架构与非目标边界
- [`API.md`](./API.md) — 后端契约
- [`EXPERIMENTS.md`](./EXPERIMENTS.md) — `generationEntry`、导航与 `POST /api/generation/events`
- [`USER_GUIDE.md`](./USER_GUIDE.md) — 功能层说明
