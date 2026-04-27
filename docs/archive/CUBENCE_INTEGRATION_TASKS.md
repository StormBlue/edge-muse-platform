# Cubence gpt-image-2 接入开发任务清单

更新时间：2026-04-27

总体状态：代码开发与审核修复已完成，真实 Cubence key 端到端验证待执行

适用范围：Edge Muse Platform 服务端 provider 适配层、异步生图任务链路、系统管理员配置页面、测试与运维文档。

## 1. 状态约定

为方便开发过程追踪，所有任务使用统一状态。

| 状态     | 含义                               |
| -------- | ---------------------------------- |
| `未开始` | 尚未进入开发                       |
| `进行中` | 正在开发或验证                     |
| `阻塞`   | 需要外部信息、账号、密钥或产品决策 |
| `待验证` | 代码已完成，等待测试或真实环境验证 |
| `已完成` | 已实现并通过约定验收               |
| `暂缓`   | 已确认暂不做，但保留记录           |

优先级说明：

| 优先级 | 含义                       |
| ------ | -------------------------- |
| `P0`   | 接入上线必须完成           |
| `P1`   | 上线前强烈建议完成         |
| `P2`   | 可后续优化，不阻塞首版接入 |

## 2. 需求背景

当前图片生成平台已具备多服务商数据模型和 provider 抽象，但实际可用接入仍以现有 OpenAI-compatible / 米醋类协议为主。现在需要接入 Cubence 的 `gpt-image-2` 图片生成能力，使系统管理员可以配置 Cubence provider、创建 Cubence API key，并把该 key 分配给管理员或用户用于文生图和图生图。

Cubence 文档地址：

- gpt-image-2 接入文档：https://docs.cubence.com/en/docs/image-models/gpt-image-2
- Cubence endpoint 列表：https://docs.cubence.com/en/docs/guides/endpoints
- Cubence pricing 说明：https://docs.cubence.com/en/docs/guides/pricing

## 3. Cubence 协议要点

### 3.1 Base URL

Cubence 提供多个可选 base URL：

| endpoint                | base URL                       | 建议             |
| ----------------------- | ------------------------------ | ---------------- |
| DMIT Optimized          | `https://api-dmit.cubence.com` | 当前文档推荐     |
| BandwagonHost Optimized | `https://api-bwg.cubence.com`  | 网络不稳定时备选 |
| CF CDN                  | `https://api-cf.cubence.com`   | CDN 备选         |

项目配置时应填写不带 `/v1` 的 base URL，例如 `https://api-dmit.cubence.com`。适配器负责拼接 `/v1/images/generations` 或 `/v1/images/edits`。

### 3.2 鉴权

使用 Bearer token：

```http
Authorization: Bearer <API_KEY>
```

Cubence 侧需要在控制台为 API key 配置 OpenAI share group，并选择 `gpt-image-2`。未配置 share group 时，图片端点会返回错误。

### 3.3 文生图

文生图端点：

```http
POST {BASE_URL}/v1/images/generations
Content-Type: application/json
```

核心请求字段：

```json
{
  "model": "gpt-image-2",
  "prompt": "a gray tabby cat in an orange scarf",
  "n": 1,
  "size": "2048x2048"
}
```

响应为 OpenAI Images 风格：

```json
{
  "created": 1735200000,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA..."
    }
  ]
}
```

### 3.4 图生图 / 编辑

图生图端点：

```http
POST {BASE_URL}/v1/images/edits
Content-Type: multipart/form-data
```

核心表单字段：

| 字段     | 说明                                 |
| -------- | ------------------------------------ |
| `model`  | `gpt-image-2`                        |
| `image`  | 待编辑图片文件                       |
| `prompt` | 编辑指令                             |
| `n`      | 生成数量，首版建议每次请求固定为 `1` |
| `size`   | 输出尺寸                             |

响应结构与文生图一致：`data[].b64_json`。

### 3.5 协议限制与首版假设

| 项           | 首版策略                                                                         |
| ------------ | -------------------------------------------------------------------------------- |
| 返回图片形式 | 只要求支持 `data[].b64_json`，现有解析器已支持                                   |
| 多图生成     | 沿用项目任务层按 `n` 拆为多次单图请求                                            |
| 多参考图编辑 | 文档示例只展示一个 `image` 字段，首版按单参考图处理                              |
| Chat 模式    | Cubence gpt-image-2 文档未明确支持 chat/completions，首版不建议开放              |
| 图片大小     | Cubence multipart 总请求体上限 50 MB，项目上传单文件当前上限 10 MB，满足首版要求 |

## 4. 项目当前现状

### 4.1 已具备能力

| 能力                       | 当前实现                                                     | 状态                       |
| -------------------------- | ------------------------------------------------------------ | -------------------------- |
| 多服务商表结构             | `providers`、`provider_keys`、`user_provider_keys` 已存在    | 已具备                     |
| provider 抽象              | `ImageProvider` 定义了 `health` 和 `generate`                | 已具备                     |
| provider registry          | 通过 `providers.request_format` 选择适配器                   | 已具备，但仅注册一个适配器 |
| 异步任务                   | `POST /api/generate` 创建任务，Workflow / waitUntil 异步执行 | 已具备                     |
| 多图任务                   | `params.n` 在任务层拆为多个单图 provider 调用                | 已具备                     |
| base64 图片落库            | `ProviderImage.kind = "base64"` 会解码并写入 R2              | 已具备                     |
| 图生图参考图上传           | `/api/uploads` 支持最多 5 张参考图，写入 R2                  | 已具备                     |
| 管理后台 provider/key CRUD | sysadmin 可以创建 provider 和 key                            | 已具备，但字段暴露不足     |

### 4.2 主要缺口

| 缺口                                                                 | 影响                                                          | 优先级 |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ------ |
| 当前 `openai_compatible` 适配器优先调用 `/v1/responses`              | Cubence 文生图会先走错误路径，依赖 fallback，不够干净         | P0     |
| 当前图生图 fallback 走 `/v1/chat/completions`                        | Cubence 要求 `/v1/images/edits` multipart，图生图不可稳定工作 | P0     |
| registry 未注册 Cubence / OpenAI Images 专用适配器                   | 无法通过 `request_format` 选择正确协议                        | P0     |
| 后台 provider 表单不暴露 `requestFormat/defaultModel/supportedSizes` | sysadmin 无法直接配置 Cubence 协议形态                        | P0     |
| `supported_sizes` 只存库，生成时未按 provider 校验                   | 用户可能选择上游不支持的尺寸                                  | P1     |
| Cubence key 的 share group 只能靠真实图片请求确认                    | `/v1/models` 健康检查无法覆盖真实可用性                       | P1     |
| Cubence chat 模式未定义产品策略                                      | 选择 Cubence key 后 chat 模式可能失败或行为不明确             | P1     |
| 缺少 Cubence 真实环境操作文档                                        | 运维配置和排障成本高                                          | P1     |

## 5. 接入目标

### 5.1 首版必须达成

1. 系统管理员可以配置 Cubence provider。
2. 系统管理员可以创建 Cubence API key，并绑定给管理员或用户。
3. 使用 Cubence key 发起文生图时，服务端直接调用 `/v1/images/generations`。
4. 使用 Cubence key 发起图生图时，服务端调用 `/v1/images/edits` multipart。
5. Cubence 返回的 `data[].b64_json` 能被解析、落 R2、写入消息附件并通过 WebSocket 推送给前端。
6. Provider 错误能被记录到 `tasks.provider_raw_response`，前端仍能展示失败和重试入口。
7. 单元测试覆盖 Cubence 文生图、图生图请求形态和响应解析。

### 5.2 首版明确不做

| 项                           | 原因                                      | 状态 |
| ---------------------------- | ----------------------------------------- | ---- |
| Cubence chat 模式            | 文档未明确 image chat endpoint            | 暂缓 |
| 多参考图一次 multipart edits | 文档示例只展示单 `image` 字段，需真实验证 | 暂缓 |
| 自动同步 Cubence 模型列表    | 当前项目模型由 provider/key 配置控制      | 暂缓 |
| 真实扣费 smoke test 默认开启 | 会消耗 Cubence 额度，需要显式确认         | 暂缓 |

## 6. 需求追踪矩阵

| 需求 ID     | 需求描述                                | 当前状态 | 开发改造                                                           | 验收标准                                                                      |
| ----------- | --------------------------------------- | -------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| REQ-CUB-001 | 支持 Cubence 文生图                     | 待验证   | 新增 Images API 适配器，调用 `/v1/images/generations`              | mock fetch 已断言 URL、headers、JSON body；真实 key smoke test 待执行         |
| REQ-CUB-002 | 支持 Cubence 图生图                     | 待验证   | 新增 multipart edits 调用 `/v1/images/edits`                       | mock fetch 已断言 `FormData` 字段；真实 key smoke test 待执行                 |
| REQ-CUB-003 | 保持现有米醋 / OpenAI-compatible 不回归 | 已完成   | 新适配器独立注册，不改现有默认行为                                 | 现有 provider 测试全部通过                                                    |
| REQ-CUB-004 | 后台可配置 Cubence provider             | 已完成   | 删除服务商页，改为内置米醋API + Cubence provider，密钥页选择服务商 | sysadmin 创建 key 时可选择米醋API或 Cubence；内置 provider 被软删后可自动恢复 |
| REQ-CUB-005 | 后台可创建和测试 Cubence key            | 待验证   | key test 支持 Cubence health 策略，并在密钥页提供测试按钮          | 错误 key 返回不可用；正确 key 至少能通过低成本鉴权检查                        |
| REQ-CUB-006 | 生成参数符合 Cubence 能力               | 已完成   | 按 request format 限制 chat、多参考图、尺寸                        | 不支持场景在任务创建前返回清晰错误                                            |
| REQ-CUB-007 | 运行日志可排障                          | 已完成   | multipart 请求记录字段形态、文件数量、字节数，不记录敏感内容       | Worker logs 可看 endpoint/status/latency/error shape                          |
| REQ-CUB-008 | 文档可运维落地                          | 已完成   | 更新操作文档与用户指南                                             | sysadmin 可按文档完成配置                                                     |

## 7. 分层级开发任务

### CUB-0 方案冻结与接入准备

状态：已完成

目标：把 Cubence 接入范围、协议细节、首版边界确认清楚，避免开发中反复改协议方向。

#### CUB-0.1 确认 Cubence 生产配置

| 字段     | 内容                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                                                                                                 |
| 状态     | 已完成                                                                                                                                                                             |
| 目标     | 确认首发使用的 base URL、API key 获取方式、share group 配置步骤                                                                                                                    |
| 当前现状 | 当前默认使用 `https://api-dmit.cubence.com`；内置 provider 元数据由代码 catalog 统一刷新                                                                                           |
| 开发内容 | 不写代码；整理部署配置记录                                                                                                                                                         |
| 交付物   | 运维文档中的 Cubence 配置章节                                                                                                                                                      |
| 验收     | sysadmin 能按文档创建 Cubence key，并确认 share group 已绑定 `gpt-image-2`                                                                                                         |
| 备注     | 真实 key 不应写入仓库；只进入后台密钥表并加密存储。2026-04-28 回顾：Cubence 默认改为 `https://api-dmit.cubence.com`，内置 provider 配置直接以 catalog 为准，不保留旧域名兼容分支。 |

#### CUB-0.2 冻结首版协议决策

| 字段     | 内容                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                                                      |
| 状态     | 已完成                                                                                                                                  |
| 目标     | 明确首版只支持 text2image 和 image2image，不支持 Cubence chat                                                                           |
| 当前现状 | 项目有 `chat` 模式，但 Cubence 文档页只说明 generations 和 edits                                                                        |
| 开发内容 | 在任务校验和 UI 交互中体现不支持策略                                                                                                    |
| 交付物   | 代码限制与文档说明                                                                                                                      |
| 验收     | 用户使用 Cubence key 发起 chat 时，不会进入长任务后才失败                                                                               |
| 备注     | 后续如 Cubence 明确 chat/image endpoint，可新增任务扩展。2026-04-27 回顾：首版只实现文生图和图生图，Cubence chat 明确在任务校验层拦截。 |

#### CUB-0.3 建立开发分支和基线验证

| 字段     | 内容                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| 优先级   | P1                                                                                                           |
| 状态     | 已完成                                                                                                       |
| 目标     | 接入前确认当前测试、lint、typecheck 状态                                                                     |
| 当前现状 | 未执行本次基线验证                                                                                           |
| 开发内容 | 运行 `pnpm -F server test`、`pnpm -F server typecheck`、必要时全仓 `pnpm lint`                               |
| 交付物   | 开发记录中的基线结果                                                                                         |
| 验收     | 明确接入前是否已有失败项，避免把旧问题混入 Cubence 改造                                                      |
| 备注     | 2026-04-27 基线验证通过：`pnpm -F server test` 7 个测试文件 18 个用例通过；`pnpm -F server typecheck` 通过。 |

### CUB-1 Provider 适配层改造

状态：已完成

目标：新增 Cubence / OpenAI Images API 协议适配器，与现有 `openai_compatible` 并存。

#### CUB-1.1 新增 `OpenAIImagesProvider` 或 `CubenceImagesProvider`

| 字段     | 内容                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                                                                         |
| 状态     | 已完成                                                                                                                                                     |
| 目标     | 增加一个直接面向 `/v1/images/*` 的 provider 实现                                                                                                           |
| 当前现状 | 只有 `OpenAICompatibleProvider`，优先 `/v1/responses`                                                                                                      |
| 开发内容 | 新建 `server/src/providers/openai-images.ts` 或 `server/src/providers/cubence-images.ts`                                                                   |
| 交付物   | 新 provider 类，实现 `ImageProvider`                                                                                                                       |
| 验收     | `generate()` 能按 mode 分派到 generations / edits；不影响现有适配器                                                                                        |
| 备注     | 已新增 `server/src/providers/openai-images.ts`，命名为 `openai_images`。2026-04-27 回顾：新适配器独立于米醋 API 的 `openai_compatible`，避免协议互相污染。 |

#### CUB-1.2 实现文生图 JSON 请求

| 字段     | 内容                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                   |
| 状态     | 已完成                                                                                               |
| 目标     | `text2image` 直接调用 `{baseUrl}/v1/images/generations`                                              |
| 当前现状 | 文生图现在先试 `/v1/responses`，再 fallback `/v1/images/generations`                                 |
| 开发内容 | 构造 JSON body：`model`、`prompt`、`n: 1`、`size`                                                    |
| 交付物   | provider 内 `generations()` 方法                                                                     |
| 验收     | 单元测试断言 URL、method、Authorization、Content-Type、body                                          |
| 备注     | 已实现 JSON 请求，provider 内固定 `n=1`。2026-04-27 回顾：任务层仍负责多图循环，未引入重复扣费逻辑。 |

#### CUB-1.3 实现图生图 multipart 请求

| 字段     | 内容                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 优先级   | P0                                                                                                                             |
| 状态     | 已完成                                                                                                                         |
| 目标     | `image2image` 调用 `{baseUrl}/v1/images/edits`                                                                                 |
| 当前现状 | 图生图主路走 `/v1/responses`，fallback 走 `/v1/chat/completions`，缺少 `/v1/images/edits`                                      |
| 开发内容 | 使用 `FormData` 添加 `model`、`prompt`、`n`、`size`、`image` 文件                                                              |
| 交付物   | provider 内 `edits()` 方法                                                                                                     |
| 验收     | 单元测试断言请求 body 是 `FormData`，包含 `image` 文件字段                                                                     |
| 备注     | 已实现 multipart edits，未手动设置 `Content-Type`。2026-04-27 回顾：保留 Authorization/Accept 头，boundary 由 fetch 自动生成。 |

#### CUB-1.4 处理参考图文件名和 MIME

| 字段     | 内容                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| 优先级   | P0                                                                                                                 |
| 状态     | 已完成                                                                                                             |
| 目标     | 让 Cubence 能识别上传图片类型                                                                                      |
| 当前现状 | `GenerateRequest.referenceImages` 只有 `bytes` 和 `mime`                                                           |
| 开发内容 | multipart 中用 `Blob` / `File` 包装字节，文件名按 MIME 生成，如 `reference.png`、`reference.jpg`、`reference.webp` |
| 交付物   | MIME 到扩展名的 helper                                                                                             |
| 验收     | 单元测试覆盖 png/jpeg/webp 文件名和 type                                                                           |
| 备注     | 已按 MIME 生成 `reference.png/jpg/webp`，并用 `toArrayBuffer()` 规避 Node/Workers `BlobPart` 类型差异。            |

#### CUB-1.5 复用并必要时导出通用解析工具

| 字段     | 内容                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| 优先级   | P0                                                                             |
| 状态     | 已完成                                                                         |
| 目标     | Cubence 响应 `data[].b64_json` 能复用现有解析                                  |
| 当前现状 | `parseProviderImages()` 已能解析 `b64_json`                                    |
| 开发内容 | 直接 import `parseProviderImages`；如出现循环依赖，再抽到 `providers/parse.ts` |
| 交付物   | 解析复用或独立工具模块                                                         |
| 验收     | `data: [{ b64_json }]` 返回 `ProviderImage.kind = "base64"`                    |
| 备注     | 已复用 `parseProviderImages()`，首版不需要改 R2 落库逻辑。                     |

#### CUB-1.6 增加 provider fetch 日志与错误包装

| 字段     | 内容                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                          |
| 状态     | 已完成                                                                                                                      |
| 目标     | Cubence 错误可排查，但不泄漏 prompt 全文、API key、base64 图片                                                              |
| 当前现状 | `openai_compatible` 有 JSON providerFetch 日志；multipart 尚无                                                              |
| 开发内容 | 增加 JSON 和 multipart fetch helper，记录 endpoint、status、latency、request shape、response shape                          |
| 交付物   | provider 内私有 fetch helper，或抽公共 helper                                                                               |
| 验收     | 失败时抛 `ProviderError`，带 status 和脱敏 body                                                                             |
| 备注     | 已增加 JSON/multipart fetch helper，multipart request shape 只记录字段名、图片数量、总字节数，不记录 prompt 全文和 base64。 |

#### CUB-1.7 实现 Cubence health 策略

| 字段     | 内容                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                    |
| 状态     | 已完成                                                                                                                                |
| 目标     | 后台 key test 能覆盖基础鉴权                                                                                                          |
| 当前现状 | `OpenAICompatibleProvider.health()` 调 `/v1/models`；无法确认 Cubence image share group                                               |
| 开发内容 | 首版可先调 `/v1/models` 或轻量 endpoint；另提供可选真实图片 smoke test 设计                                                           |
| 交付物   | `health()` 方法与文档说明                                                                                                             |
| 验收     | 错误 key 返回 false；正确 key 至少通过鉴权检查                                                                                        |
| 备注     | 已实现 `/v1/models` 基础 health。2026-04-27 回顾：该检查不消耗图片额度，但不能证明 share group 已配置；真实 smoke test 仍需人工确认。 |

### CUB-2 Registry 与 provider 配置

状态：已完成

目标：让数据库中的 `request_format` 可以选择新适配器。

#### CUB-2.1 注册新 request format

| 字段     | 内容                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                     |
| 状态     | 已完成                                                                                 |
| 目标     | `getProvider("openai_images")` 返回新适配器                                            |
| 当前现状 | registry 仅包含 `openai_compatible`                                                    |
| 开发内容 | 修改 `server/src/providers/registry.ts`，注册 `openai_images`                          |
| 交付物   | registry 映射                                                                          |
| 验收     | 单元测试或直接断言能取到新 provider                                                    |
| 备注     | 已注册 `openai_images`；未知 request format 仍回退 `openai_compatible`，保持现有兼容。 |

#### CUB-2.2 决定数据库配置策略

| 字段     | 内容                                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                                                                                                                                                                      |
| 状态     | 已完成                                                                                                                                                                                                                                                  |
| 目标     | Cubence provider 能通过后台或 seed 创建                                                                                                                                                                                                                 |
| 当前现状 | provider schema 允许任意 `requestFormat`，但前端不暴露                                                                                                                                                                                                  |
| 开发内容 | 确认是否需要新增 seed 示例；生产建议通过后台创建                                                                                                                                                                                                        |
| 交付物   | 示例配置文档或 seed 扩展                                                                                                                                                                                                                                |
| 验收     | D1 中 provider 行包含 `request_format = "openai_images"`                                                                                                                                                                                                |
| 备注     | 已新增内置 provider catalog，`GET /sysadmin/providers` 和密钥创建会自动补齐米醋API与 Cubence provider；不写入真实 provider key。2026-04-27 审核修复：内置 provider 会恢复 `enabled/deleted_at` 并校正名称、协议和尺寸，避免服务商页删除后缺少配置兜底。 |

#### CUB-2.3 默认尺寸策略

| 字段     | 内容                                                                             |
| -------- | -------------------------------------------------------------------------------- |
| 优先级   | P1                                                                               |
| 状态     | 已完成                                                                           |
| 目标     | Cubence provider 的 `supported_sizes` 与前端选择一致                             |
| 当前现状 | 前端只展示 `1024x1024`、`1024x1536`、`1536x1024`、`auto`                         |
| 开发内容 | 设置 Cubence provider 默认尺寸；如要支持 `2048x2048`，需同步前端选项             |
| 交付物   | 配置默认值与 UI 选项调整                                                         |
| 验收     | 用户不能选到明显不支持或未配置的尺寸                                             |
| 备注     | Cubence 内置 provider 已声明 `2048x2048` 等尺寸；前端尺寸动态化已在 CUB-5 完成。 |

### CUB-3 任务层与参数校验

状态：已完成

目标：在任务创建或执行前阻止 Cubence 不支持的模式和参数。

#### CUB-3.1 provider 能力描述扩展

| 字段     | 内容                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                             |
| 状态     | 已完成                                                                                                         |
| 目标     | 让任务层知道 provider 支持哪些模式                                                                             |
| 当前现状 | `ImageProvider` 只有 `supportedSizes`，没有 supported modes                                                    |
| 开发内容 | 可扩展接口增加 `supportedModes`，或在任务层按 `request_format` 临时判断                                        |
| 交付物   | 能力判断函数                                                                                                   |
| 验收     | Cubence key 下 chat 模式能被拦截                                                                               |
| 备注     | 已在 `ImageProvider` 增加 `supportedModes` 与 `maxReferenceImages` 可选能力声明，避免散落 requestFormat 判断。 |

#### CUB-3.2 限制 Cubence chat 模式

| 字段     | 内容                                                                                         |
| -------- | -------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                           |
| 状态     | 已完成                                                                                       |
| 目标     | 避免 Cubence chat 进入 provider 后失败                                                       |
| 当前现状 | `generateSchema` 允许 `chat`，任务层也会传给 provider                                        |
| 开发内容 | 在 `createGenerateTask` 解析 provider key 后校验 mode                                        |
| 交付物   | 清晰业务错误：当前服务商不支持对话模式                                                       |
| 验收     | Cubence key + chat 请求返回 400 或 422 类校验错误，不扣配额                                  |
| 备注     | 已在 `createGenerateTask` 中 provider key 解析后、消息/任务插入和 `tryConsumeQuota` 前校验。 |

#### CUB-3.3 限制 Cubence 图生图参考图数量

| 字段     | 内容                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                               |
| 状态     | 已完成                                                                                                           |
| 目标     | 首版按单参考图调用 `/v1/images/edits`                                                                            |
| 当前现状 | 前端和后端最多允许 5 张参考图                                                                                    |
| 开发内容 | 对 `openai_images` provider，`image2image` 时 `referenceImageIds.length` 必须为 1                                |
| 交付物   | 参数校验                                                                                                         |
| 验收     | Cubence key + 多参考图请求在任务创建阶段失败，不扣配额                                                           |
| 备注     | 已通过 `maxReferenceImages = 1` 限制 Cubence/OpenAI Images 图生图单参考图；后续验证支持多 `image` 字段后可放开。 |

#### CUB-3.4 按 provider 校验尺寸

| 字段     | 内容                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| 优先级   | P1                                                                                                           |
| 状态     | 已完成                                                                                                       |
| 目标     | 使用 `providers.supported_sizes` 控制实际可选尺寸                                                            |
| 当前现状 | `generateSchema` 只用全局 `allowedSizes`，注释提到 provider 能力但未实现                                     |
| 开发内容 | 在 `createGenerateTask` 拿到 provider 后校验 `params.size` 是否属于 provider.supportedSizes 或符合自定义策略 |
| 交付物   | 尺寸校验函数                                                                                                 |
| 验收     | provider 未声明的尺寸不能提交                                                                                |
| 备注     | 已按 `providers.supported_sizes` 校验，支持 `*` 作为全开放兜底；`auto` 是否允许由 provider 配置决定。        |

#### CUB-3.5 确认 multipart 请求体大小

| 字段     | 内容                                                              |
| -------- | ----------------------------------------------------------------- |
| 优先级   | P2                                                                |
| 状态     | 已完成                                                            |
| 目标     | 避免大参考图导致 Cubence 50 MB multipart 上限                     |
| 当前现状 | 上传接口单文件限制 10 MB，最多 5 张；Cubence 首版只发 1 张        |
| 开发内容 | 如果后续支持多参考图，计算 multipart 总字节数并在 provider 前拦截 |
| 交付物   | 大小校验 helper                                                   |
| 验收     | 超限请求返回清晰错误                                              |
| 备注     | 单参考图首版可暂不额外开发                                        |

### CUB-4 管理后台改造

状态：已完成

目标：让 sysadmin 可以在 UI 中完整配置 Cubence provider，而不是依赖隐藏默认值。

#### CUB-4.1 Provider 创建表单暴露 request format

| 字段     | 内容                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                                                                   |
| 状态     | 已完成                                                                                                                                               |
| 目标     | 创建 provider 时可选择 `OpenAI Compatible` 或 `OpenAI Images / Cubence`                                                                              |
| 当前现状 | 前端创建表单只提交 name/baseUrl，隐藏默认 `openai_compatible`                                                                                        |
| 开发内容 | 修改 `web/src/views/sysadmin/Providers.vue` 表单和类型，增加 requestFormat                                                                           |
| 交付物   | UI 下拉和提交字段                                                                                                                                    |
| 验收     | 创建 Cubence provider 后数据库 `request_format` 正确                                                                                                 |
| 备注     | 需求已调整：删除服务商页面，改为在密钥页选择服务商。旧 `/sysadmin/providers` 重定向到 `/sysadmin/keys`，服务商协议由后端内置 provider catalog 决定。 |

#### CUB-4.2 Provider 创建/编辑表单暴露 default model

| 字段     | 内容                                                                             |
| -------- | -------------------------------------------------------------------------------- |
| 优先级   | P0                                                                               |
| 状态     | 已完成                                                                           |
| 目标     | sysadmin 可设置 `gpt-image-2` 或未来模型名                                       |
| 当前现状 | 默认固定 `gpt-image-2`，编辑页面不显示                                           |
| 开发内容 | 表单增加 `defaultModel` 输入框                                                   |
| 交付物   | UI 字段与 PATCH 提交                                                             |
| 验收     | 编辑 provider 后默认模型生效                                                     |
| 备注     | 密钥页选择服务商时自动带出 `defaultModel`，sysadmin 仍可在密钥表单里覆盖模型名。 |

#### CUB-4.3 Provider 创建/编辑表单支持 supported sizes

| 字段     | 内容                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| 优先级   | P1                                                                                                                       |
| 状态     | 已完成                                                                                                                   |
| 目标     | sysadmin 能配置该 provider 允许的尺寸                                                                                    |
| 当前现状 | supportedSizes 仅后端返回，前端不展示不编辑                                                                              |
| 开发内容 | 提供 textarea JSON 或 tag input；首版可用逗号分隔字符串                                                                  |
| 交付物   | UI 字段、解析校验、错误提示                                                                                              |
| 验收     | 输入无效尺寸时不提交；保存后列表可查看                                                                                   |
| 备注     | 需求已调整：服务商页面删除后不再提供 provider 编辑表单；supported sizes 由内置 Cubence provider 和既有 provider 行维护。 |

#### CUB-4.4 Provider 列表展示 request format 和模型

| 字段     | 内容                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                            |
| 状态     | 已完成                                                                                        |
| 目标     | sysadmin 一眼看出某 provider 是 Cubence 还是旧兼容协议                                        |
| 当前现状 | 列表只展示 name、baseUrl、status                                                              |
| 开发内容 | 表格新增 request format、default model 列                                                     |
| 交付物   | UI 列表改造                                                                                   |
| 验收     | Cubence provider 在列表可识别                                                                 |
| 备注     | 需求已调整：服务商列表页已删除；密钥页展示所选服务商名称，并在表单中展示默认模型和 base URL。 |

#### CUB-4.5 增加 Cubence 配置提示

| 字段     | 内容                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                     |
| 状态     | 已完成                                                                                 |
| 目标     | 降低 sysadmin 配错 base URL 或忘配 share group 的概率                                  |
| 当前现状 | providerDomainPlaceholder 只提示 example.com 或 mock                                   |
| 开发内容 | 当 request format 选 Cubence / OpenAI Images 时，显示 base URL 示例和 share group 提醒 |
| 交付物   | 前端提示文案和 i18n                                                                    |
| 验收     | 中英文 locale 都有对应文案                                                             |
| 备注     | 密钥表单展示服务商默认模型和 base URL；share group 等长说明放运维文档。                |

#### CUB-4.6 密钥页增加连通性测试入口

| 字段     | 内容                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                    |
| 状态     | 已完成                                                                                                                                |
| 目标     | sysadmin 创建 Cubence key 后能在同一页面做低成本鉴权检查                                                                              |
| 当前现状 | 后端已有 `/provider-keys/:id/test`，前端密钥页没有入口                                                                                |
| 开发内容 | 在密钥列表操作区增加测试按钮，调用现有 health endpoint                                                                                |
| 交付物   | `web/src/views/sysadmin/Keys.vue` 测试按钮与 i18n 文案                                                                                |
| 验收     | 点击测试后能看到通过/失败 toast；不需要恢复服务商页面                                                                                 |
| 备注     | 已完成。2026-04-27 回顾：Cubence health 仍是 `/v1/models` 基础鉴权，不证明 share group 可用；真实图片 smoke test 继续保留在 CUB-6.5。 |

### CUB-5 前台交互与模式约束

状态：已完成

目标：避免用户在 Cubence provider 下选择不支持的模式或参数。

#### CUB-5.1 前台获取当前 key/provider 能力

| 字段     | 内容                                                                                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                                                                                                                                                                                                   |
| 状态     | 已完成                                                                                                                                                                                                                                                               |
| 目标     | 前端能根据当前用户绑定的 provider 限制模式和尺寸                                                                                                                                                                                                                     |
| 当前现状 | 前端 `ChatInput` 固定 size options，不知道 provider 能力                                                                                                                                                                                                             |
| 开发内容 | 扩展 `/api/me` 或新增 endpoint 返回当前 provider capabilities                                                                                                                                                                                                        |
| 交付物   | API 和 store 字段                                                                                                                                                                                                                                                    |
| 验收     | Cubence key 下前端不显示 chat 或多参考图入口                                                                                                                                                                                                                         |
| 备注     | 已新增 `server/src/lib/providerKeys.ts`，集中复用 provider key 解析规则；`/api/me`、登录、刷新返回 `providerCapabilities`，前端 auth store 持久化该能力快照。2026-04-27 回顾：仅无可用 key/provider 时返回空能力，不吞真实数据库异常；安全边界仍保留在任务创建校验。 |

#### CUB-5.2 尺寸选项与 provider 配置联动

| 字段     | 内容                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                                                                                                                                                        |
| 状态     | 已完成                                                                                                                                                                                                                    |
| 目标     | 前台尺寸按钮来自 provider.supportedSizes                                                                                                                                                                                  |
| 当前现状 | `ChatInput` 硬编码四个尺寸                                                                                                                                                                                                |
| 开发内容 | 把 sizeOptions 改为 props 或 store 派生                                                                                                                                                                                   |
| 交付物   | 动态尺寸 UI                                                                                                                                                                                                               |
| 验收     | Cubence provider 支持 `2048x2048` 时，用户可以选择                                                                                                                                                                        |
| 备注     | `Workspace.vue` 已按当前 provider 能力过滤模式、生成动态尺寸按钮，并把参考图上限传入 `ChatInput.vue`；只读历史消息仍用当前消息尺寸兜底展示。2026-04-27 回顾：`pnpm -F web typecheck` 与 `pnpm -F server typecheck` 通过。 |

### CUB-6 测试计划

状态：待验证

目标：用单元测试覆盖协议形态，用人工测试覆盖真实 provider。

#### CUB-6.1 Provider 文生图单元测试

| 字段     | 内容                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                             |
| 状态     | 已完成                                                                                                         |
| 目标     | 确保 Cubence 文生图请求正确                                                                                    |
| 当前现状 | provider 测试只覆盖响应解析和 chat 文本                                                                        |
| 开发内容 | stub `fetch`，调用新 provider `generate(text2image)`                                                           |
| 交付物   | `server/test/provider.test.ts` 或新测试文件                                                                    |
| 验收     | 断言 URL 为 `/v1/images/generations`，body 包含 `n: 1`                                                         |
| 备注     | 已新增测试断言 `/v1/images/generations` URL、Authorization、JSON body 与 base64 响应解析；不需要真实 API key。 |

#### CUB-6.2 Provider 图生图单元测试

| 字段     | 内容                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                   |
| 状态     | 已完成                                                                                               |
| 目标     | 确保 Cubence 图生图使用 multipart edits                                                              |
| 当前现状 | 无 multipart provider 测试                                                                           |
| 开发内容 | stub `fetch`，检查 `RequestInit.body` 是 `FormData`                                                  |
| 交付物   | 单元测试                                                                                             |
| 验收     | 断言 endpoint、Authorization header、FormData 字段                                                   |
| 备注     | 已新增测试断言 `/v1/images/edits` multipart、`image` 文件字段、无手写 Content-Type；不依赖文件系统。 |

#### CUB-6.3 响应解析测试

| 字段     | 内容                                                         |
| -------- | ------------------------------------------------------------ |
| 优先级   | P0                                                           |
| 状态     | 已完成                                                       |
| 目标     | 覆盖 Cubence `data[].b64_json`                               |
| 当前现状 | 已有 legacy image url 测试，但建议补 b64_json 明确用例       |
| 开发内容 | 增加 `parseProviderImages({ data: [{ b64_json }] })` 测试    |
| 交付物   | 单元测试                                                     |
| 验收     | 返回一张 base64 图片                                         |
| 备注     | 已新增 `data[].b64_json` 解析用例，复用现有 1x1 png base64。 |

#### CUB-6.4 任务层参数校验测试

| 字段     | 内容                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                      |
| 状态     | 已完成                                                                                  |
| 目标     | 确保 Cubence 不支持场景不会扣配额                                                       |
| 当前现状 | 现有测试有 generationPolicy，但没有 provider capability 校验                            |
| 开发内容 | 构造 D1/miniflare 环境或提取纯函数测试                                                  |
| 交付物   | 单元测试                                                                                |
| 验收     | Cubence + chat / 多参考图返回校验错误                                                   |
| 备注     | 已将 provider 能力校验函数导出并增加纯函数测试，覆盖 Cubence chat、多参考图和尺寸拒绝。 |

#### CUB-6.5 手工真实环境测试

| 字段     | 内容                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                  |
| 状态     | 阻塞                                                                                                                |
| 目标     | 用真实 Cubence key 验证端到端链路                                                                                   |
| 当前现状 | 无真实 Cubence 环境记录                                                                                             |
| 开发内容 | 创建 provider/key，执行文生图和图生图各 1 次                                                                        |
| 交付物   | 测试记录：taskId、providerRequestId、耗时、图片结果                                                                 |
| 验收     | 图片可在前端看到、历史可查看、R2 有对象、D1 有 image_objects                                                        |
| 备注     | 代码路径、测试入口和操作文档已完成；该项需要真实 Cubence key、OpenAI share group 和额度，当前无法在仓库环境内执行。 |

### CUB-7 文档与运维

状态：已完成

目标：让上线后的配置、排障、回滚有明确路径。

#### CUB-7.1 更新架构文档

| 字段     | 内容                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| 优先级   | P1                                                                                                                 |
| 状态     | 已完成                                                                                                             |
| 目标     | 说明 provider registry 支持 OpenAI-compatible 和 OpenAI Images 两类协议                                            |
| 当前现状 | `docs/ARCHITECTURE.md` 只写 OpenAI-compatible image provider                                                       |
| 开发内容 | 更新架构图和 Runtime Shape                                                                                         |
| 交付物   | 文档修改                                                                                                           |
| 验收     | 新同学能理解 Cubence 走哪个 adapter                                                                                |
| 备注     | 已更新架构文档，说明 `openai_compatible` 与 `openai_images` adapter 分工，以及服务商页删除后的内置 provider 机制。 |

#### CUB-7.2 更新运维文档

| 字段     | 内容                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                  |
| 状态     | 已完成                                                                                                              |
| 目标     | 记录 Cubence provider/key 配置步骤                                                                                  |
| 当前现状 | `docs/OPERATIONS.md` 没有 Cubence 配置                                                                              |
| 开发内容 | 增加 Cubence provider 创建、key 创建、share group、测试、常见错误章节                                               |
| 交付物   | 文档修改                                                                                                            |
| 验收     | sysadmin 可按步骤完成生产配置                                                                                       |
| 备注     | 已更新运维文档，包含 Cubence key 创建、share group、smoke test、日志排障与回滚说明，并强调 baseUrl 由内置配置维护。 |

#### CUB-7.3 更新用户指南

| 字段     | 内容                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                 |
| 状态     | 已完成                                                                             |
| 目标     | 说明用户使用 Cubence provider 时的模式限制                                         |
| 当前现状 | `docs/USER_GUIDE.md` 只写通用生图流程                                              |
| 开发内容 | 增加“不同服务商能力可能不同”的说明                                                 |
| 交付物   | 文档修改                                                                           |
| 验收     | 用户知道为什么 Cubence key 下 chat 或多参考图不可用                                |
| 备注     | 已更新用户指南，说明 Cubence 支持文生图/图生图，暂不支持对话，图生图首版单参考图。 |

#### CUB-7.4 增加发布检查清单

| 字段     | 内容                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                |
| 状态     | 已完成                                                                                            |
| 目标     | 上线前有明确 checklist                                                                            |
| 当前现状 | 接入特定 checklist 不存在                                                                         |
| 开发内容 | 在本文或 `docs/ACCEPTANCE.md` 增加发布前检查                                                      |
| 交付物   | checklist                                                                                         |
| 验收     | 发布前能逐项勾选                                                                                  |
| 备注     | 已更新验收与运维 smoke test，包含真实 key、share group、provider assignment、R2、Workflow、日志。 |

### CUB-8 上线与回滚

状态：待验证

目标：降低接入新 provider 对现有用户的风险。

#### CUB-8.1 灰度策略

| 字段     | 内容                                                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                                                                                  |
| 状态     | 待验证                                                                                                                                                                                              |
| 目标     | Cubence 先只分配给 sysadmin 或测试 admin                                                                                                                                                            |
| 当前现状 | provider key 可按用户绑定                                                                                                                                                                           |
| 开发内容 | 不需要代码，按后台分配策略执行                                                                                                                                                                      |
| 交付物   | 灰度操作记录                                                                                                                                                                                        |
| 验收     | 未绑定 Cubence key 的用户仍走原 provider                                                                                                                                                            |
| 备注     | 代码与后台绑定能力已具备；真实灰度操作需等 Cubence key 创建后执行并记录。2026-04-27 审核修复：`resolveProviderKey` 已移除全局最新 key fallback，未显式绑定 Cubence key 的用户不会被动切到 Cubence。 |

#### CUB-8.2 监控重点

| 字段     | 内容                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                |
| 状态     | 已完成                                                                                            |
| 目标     | 上线初期快速发现 Cubence 异常                                                                     |
| 当前现状 | Worker logs 已有 provider/task 结构化日志                                                         |
| 开发内容 | 观察 `provider.fetch.failed`、`task.generation.failed`、`task.slow`、Cubence status code          |
| 交付物   | 监控查询说明                                                                                      |
| 验收     | 可定位错误是鉴权、share group、尺寸、multipart 还是上游超时                                       |
| 备注     | 已在 `docs/OPERATIONS.md` 写入 Cubence 日志排障重点；首版无需新增监控系统，先用 Cloudflare Logs。 |

#### CUB-8.3 回滚方案

| 字段     | 内容                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                    |
| 状态     | 待验证                                                                                |
| 目标     | Cubence 异常时能快速切回旧 provider                                                   |
| 当前现状 | 用户 provider key 绑定可更新                                                          |
| 开发内容 | 文档化回滚步骤：禁用 Cubence provider/key，改绑用户到旧 key                           |
| 交付物   | 运维文档回滚章节                                                                      |
| 验收     | 禁用 Cubence 后新任务不再使用 Cubence，历史图片仍可访问                               |
| 备注     | 回滚步骤已写入 `docs/OPERATIONS.md`；实际演练需在有旧 key 与 Cubence key 的环境完成。 |

### CUB-9 审核问题修复

状态：已完成

目标：修复 Cubence 接入审核中发现的灰度、权限和内置 provider 生命周期问题，确保服务商页面删除后仍有明确、可恢复、不可误删的服务商配置来源。

#### CUB-9.1 移除未绑定用户全局 key fallback

| 字段     | 内容                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                                                                                                                          |
| 状态     | 已完成                                                                                                                                                                                                                                      |
| 目标     | 未绑定 provider key 的用户不能自动使用全局最新启用 key                                                                                                                                                                                      |
| 当前现状 | 旧逻辑会在 preference / `user_provider_keys` 都为空时回退到最新启用 key，新建 Cubence key 后可能影响未灰度用户                                                                                                                              |
| 开发内容 | 修改 `resolveProviderKey`，只允许用户偏好 key 或显式绑定 key；无配置时返回 `PROVIDER_ERROR`                                                                                                                                                 |
| 交付物   | `server/src/lib/providerKeys.ts`、`server/src/db/schema.ts` 注释更新、回归测试                                                                                                                                                              |
| 验收     | 未绑定用户生成任务失败并提示未配置 provider key；不会因为 Cubence key 新建而切换服务商                                                                                                                                                      |
| 备注     | 2026-04-27 已完成。回顾检查：该改动符合灰度策略；需要运营确保每个可生成用户都有明确 key 绑定。`pnpm -F server typecheck`、`pnpm -F server test`、`pnpm lint`、`pnpm -F web typecheck`、`pnpm -F web build`、`pnpm -F server build` 已通过。 |

#### CUB-9.2 校验生成任务 sessionId 归属

| 字段     | 内容                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                           |
| 状态     | 已完成                                                                                                                       |
| 目标     | 用户复用已有会话时必须只能写入自己的会话                                                                                     |
| 当前现状 | `createGenerateTask` 只按 session id 查询未删除会话，未校验 `sessions.user_id`                                               |
| 开发内容 | 新增 `assertReusableGenerateSession`，对不存在会话返回 `NOT_FOUND`，对他人会话返回 `FORBIDDEN`，在插入 messages/tasks 前执行 |
| 交付物   | `server/src/lib/tasks.ts` 归属校验与回归测试                                                                                 |
| 验收     | 传入他人 sessionId 时不会写入对方 messages/tasks，也不会更新对方 provider/settings                                           |
| 备注     | 2026-04-27 已完成。回顾检查：校验发生在任务落库和配额扣减前；补充测试覆盖缺失 session 与跨用户 session。                     |

#### CUB-9.3 补齐米醋API内置 provider

| 字段     | 内容                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                                                                      |
| 状态     | 已完成                                                                                                                                  |
| 目标     | 服务商页面删除后，新环境仍能在密钥页选择“米醋API”和 Cubence 两个受支持服务商                                                            |
| 当前现状 | 内置目录只包含 Cubence，新环境没有既有米醋 provider 行时无法通过 UI 创建米醋 key                                                        |
| 开发内容 | 在 `BUILT_IN_PROVIDERS` 中新增 `prv_micu`，名称为“米醋API”，默认 `base_url = https://www.openclaudecode.cn`，协议为 `openai_compatible` |
| 交付物   | `server/src/providers/catalog.ts`、回归测试                                                                                             |
| 验收     | `/sysadmin/providers` 可自动补齐米醋API与 Cubence；密钥页创建新密钥时可选择两者                                                         |
| 备注     | 2026-04-27 已完成。回顾检查：不写入真实 key，不影响旧 provider/key 绑定；已有用户仍按显式绑定 key 解析。                                |

#### CUB-9.4 修复内置 provider 软删恢复与删除保护

| 字段     | 内容                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                                                                        |
| 状态     | 已完成                                                                                                                                    |
| 目标     | 内置 provider 被误软删后能恢复，同时后台隐藏 API 不应继续删除内置 provider                                                                |
| 当前现状 | `INSERT OR IGNORE` 遇到同 id 软删行不会恢复；`DELETE /providers/:id` 仍可软删 provider 与其 key                                           |
| 开发内容 | `ensureBuiltInProviders` 改为插入后执行恢复/校正 update；`DELETE /providers/:id` 对内置 id 返回校验错误                                   |
| 交付物   | `server/src/providers/catalog.ts`、`server/src/routes/sysadmin.ts`、回归测试                                                              |
| 验收     | 内置 provider 行 `deleted_at` 非空或 `enabled=0` 时，下次 ensure 会恢复；删除内置 provider 会被拒绝                                       |
| 备注     | 2026-04-27 已完成。回顾检查：恢复时不覆盖非空 `base_url`，保留生产受控切换备用上游域名的空间；名称、协议、默认模型和尺寸由 catalog 校正。 |

#### CUB-9.5 限制密钥页只能选择受支持服务商

| 字段     | 内容                                                                                                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                                                                                                                                                                                                                                                        |
| 状态     | 已完成                                                                                                                                                                                                                                                                                                                    |
| 目标     | 服务商页面删除后，新建或改绑密钥只能选择内置支持的米醋API/Cubence                                                                                                                                                                                                                                                         |
| 当前现状 | `/sysadmin/providers` 返回所有未软删 provider，前端创建下拉直接使用所有 enabled provider，旧测试/自定义 provider 仍可能被创建新 key                                                                                                                                                                                       |
| 开发内容 | provider 列表返回 `builtIn` 标识；前端创建/改绑下拉只使用 `builtIn && enabled` provider；后端 `POST/PATCH /provider-keys` 拒绝非内置 providerId                                                                                                                                                                           |
| 交付物   | `server/src/routes/sysadmin.ts`、`web/src/views/sysadmin/Keys.vue`                                                                                                                                                                                                                                                        |
| 验收     | 旧 provider 仍可用于历史 key 展示；新 key 和 key 改绑不能指向非内置 provider                                                                                                                                                                                                                                              |
| 备注     | 2026-04-27 已完成。回顾检查：前端编辑旧 key 时若未改 providerId，不会把历史 providerId 回传，避免阻断标签、模型、密钥本身的维护；后端仍强制拦截绕过 UI 的非内置 providerId。`pnpm -F server typecheck`、`pnpm -F web typecheck`、`pnpm -F server test`、`pnpm lint`、`pnpm -F web build`、`pnpm -F server build` 已通过。 |

#### CUB-9.6 限制旧 provider key 继续被分配

| 字段     | 内容                                                                                                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                                                                                                                                                                                                                                                              |
| 状态     | 已完成                                                                                                                                                                                                                                                                                                                          |
| 目标     | 旧 provider 下的历史 key 不能继续被分配给新管理员、用户或 sysadmin 偏好                                                                                                                                                                                                                                                         |
| 当前现状 | `/sysadmin/provider-keys` 曾返回所有未删除 key，创建/更新 admin/user 只校验 key 启用和未删除，未校验 key 所属 provider 是否为受支持内置项                                                                                                                                                                                       |
| 开发内容 | 新增统一 `assertAssignableProviderKey` / `getAssignableProviderKey`；候选 key 默认按内置 provider 过滤；所有 `providerKeyId` 写入路径复用该校验；密钥管理页通过 `includeUnsupported=1` 仅展示历史旧 key                                                                                                                         |
| 交付物   | `server/src/lib/providerKeys.ts`、`server/src/routes/sysadmin.ts`、`server/src/routes/admin.ts`、`web/src/views/sysadmin/Keys.vue`、回归测试                                                                                                                                                                                    |
| 验收     | 旧 provider key 可在密钥管理页审计展示，但不会出现在分配候选中；绕过前端提交旧 provider key 会被后端拒绝                                                                                                                                                                                                                        |
| 备注     | 2026-04-27 已完成。回顾检查：`PATCH /provider-keys/:id` 同时改 provider 与绑定 ownerAdminId 时按补丁后的最终状态校验，避免禁用 key 或旧 provider key 被写入 `user_provider_keys`。`pnpm -F server typecheck`、`pnpm -F server test`、`pnpm lint`、`pnpm -F web typecheck`、`pnpm -F web build`、`pnpm -F server build` 已通过。 |

#### CUB-9.7 标准化空 sessionId

| 字段     | 内容                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 优先级   | P3                                                                                                                                                                                                     |
| 状态     | 已完成                                                                                                                                                                                                 |
| 目标     | 空字符串 `sessionId` 不能插入为空主键的脏会话                                                                                                                                                          |
| 当前现状 | `sessionId` 只校验为 string，空串会跳过复用校验但又被当作新会话 id 写入                                                                                                                                |
| 开发内容 | `POST /generate` schema 对可选 `sessionId` 做 trim 预处理，空串视为 undefined；任务层继续只接收有效 sessionId 或新建 id                                                                                |
| 交付物   | `server/src/routes/generate.ts`、回归测试                                                                                                                                                              |
| 验收     | `sessionId: ""` 或纯空白等价于未传 sessionId，会生成新的 `ses_*`，不会创建空 id 会话                                                                                                                   |
| 备注     | 2026-04-27 已完成。回顾检查：该修复发生在路由 schema，能覆盖正常生成请求和重试参数解析；任务层已有归属校验兜底。`server/test/cubenceRegression.test.ts` 已覆盖空串、纯空白和 trim 后的合法 sessionId。 |

## 8. 建议实施顺序

1. `CUB-0.1`、`CUB-0.2`：确认真实配置和首版边界。
2. `CUB-1.1` 至 `CUB-1.6`：实现新 provider。
3. `CUB-2.1`：注册 request format。
4. `CUB-6.1` 至 `CUB-6.3`：先补协议单元测试。
5. `CUB-3.1` 至 `CUB-3.4`：补任务层能力校验。
6. `CUB-4.1` 至 `CUB-4.4`：改后台配置 UI。
7. `CUB-7.1` 至 `CUB-7.4`：补文档和发布 checklist。
8. `CUB-9.1` 至 `CUB-9.7`：完成接入审核修复与回归测试。
9. `CUB-6.5`、`CUB-8.1` 至 `CUB-8.3`：真实环境灰度和上线。

## 9. 发布前验收清单

| 检查项                                  | 状态   | 备注                                                             |
| --------------------------------------- | ------ | ---------------------------------------------------------------- |
| 新 provider 适配器已注册                | 已完成 | `openai_images`                                                  |
| 文生图调用 `/v1/images/generations`     | 已完成 | 单元测试覆盖                                                     |
| 图生图调用 `/v1/images/edits` multipart | 已完成 | 单元测试覆盖                                                     |
| `data[].b64_json` 能解析并落 R2         | 已完成 | 解析单元测试覆盖；落 R2 复用既有任务链路                         |
| Cubence chat 被明确禁用或隐藏           | 已完成 | 前端隐藏，后端任务创建前拦截                                     |
| Cubence 多参考图策略明确                | 已完成 | 首版单参考图，前后端均限制                                       |
| 后台能创建 Cubence provider             | 已完成 | 改为内置米醋API + Cubence provider，服务商页删除                 |
| 后台能创建 Cubence key                  | 已完成 | 密钥页选择 Cubence 并可做 health 测试                            |
| 未绑定用户不会自动切到 Cubence          | 已完成 | `resolveProviderKey` 已取消全局 key fallback                     |
| 生成任务不能跨用户复用 sessionId        | 已完成 | `createGenerateTask` 在落库前校验 session 归属                   |
| 内置 provider 可恢复且不可删除          | 已完成 | ensure 恢复软删行，DELETE 内置 provider 被拒绝                   |
| 密钥页只允许选择受支持 provider         | 已完成 | 创建/改绑只允许内置米醋API/Cubence；旧 provider 仅用于历史展示   |
| 旧 provider key 不可继续分配            | 已完成 | 候选接口默认过滤内置 provider，所有 `providerKeyId` 写入统一校验 |
| 空 sessionId 不会生成脏会话             | 已完成 | 路由 schema 将空串/空白标准化为未传                              |
| 运维文档说明 share group                | 已完成 | 需配置 `gpt-image-2`                                             |
| 真实文生图 smoke test 通过              | 阻塞   | 需要真实 Cubence key，会消耗额度                                 |
| 真实图生图 smoke test 通过              | 阻塞   | 需要真实 Cubence key，会消耗额度                                 |
| 回滚步骤已验证                          | 待验证 | 文档已完成，需真实环境演练                                       |

## 10. 风险与处理方案

| 风险                                                | 影响                                              | 处理方案                                                                     | 状态   |
| --------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| Cubence key 未配置 share group                      | 图片端点 400                                      | 运维文档明确配置步骤；key test 只作为基础鉴权                                | 已缓解 |
| `/v1/models` health 通过但图片端点失败              | 后台误判 key 可用                                 | 可选真实 smoke test，明确会扣费                                              | 待验证 |
| multipart `Content-Type` 手动设置导致 boundary 缺失 | 图生图请求失败                                    | 代码禁止手动设置 multipart Content-Type                                      | 已完成 |
| 多参考图不被 Cubence 支持                           | 图生图失败                                        | 首版限制 1 张参考图                                                          | 已完成 |
| Cubence chat 不支持                                 | 对话模式失败                                      | 首版禁用 Cubence chat                                                        | 已完成 |
| 尺寸不支持或上游静默降级                            | 结果与用户预期不一致                              | provider supportedSizes 校验；后续可读取图片尺寸记录告警                     | 已完成 |
| 新建 Cubence key 影响未绑定用户                     | 灰度策略失效，未绑定用户被动切换服务商            | 取消全局最新 key fallback，用户必须有偏好或显式绑定 key                      | 已完成 |
| 伪造他人 sessionId 写入会话                         | 跨用户消息和任务污染                              | 任务创建前校验 session 归属，不存在返回 404，他人会话返回 403                | 已完成 |
| 内置 provider 被软删后无法恢复                      | 密钥页缺少受支持服务商                            | ensure 对内置 id 执行恢复/校正，且删除 API 拒绝内置 provider                 | 已完成 |
| 旧 provider 继续出现在密钥创建入口                  | 新 key 可能指向不再受支持或配置不符合预期的服务商 | provider 列表返回 `builtIn`，前端仅展示内置可用项，后端拒绝非内置 providerId | 已完成 |
| 旧 provider key 继续被分配                          | 绕过服务商页删除后的产品边界                      | provider key 候选默认过滤内置支持项，所有分配写入复用 assignable key 校验    | 已完成 |
| 空字符串 sessionId 写入脏数据                       | 空 id 会话不可路由且后续可能主键冲突              | 路由 schema 将空串/空白标准化为 undefined                                    | 已完成 |
| 真实 smoke test 消耗额度                            | 运营成本不可控                                    | 只在人工确认后执行                                                           | 已记录 |

## 11. 代码触点索引

| 文件                                        | 作用                                        | 改造类型                                                 |
| ------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `server/src/providers/types.ts`             | provider 抽象定义                           | 可能扩展 capabilities                                    |
| `server/src/providers/registry.ts`          | request format 到 provider 的映射           | 必改                                                     |
| `server/src/providers/openai-compatible.ts` | 现有 Responses / legacy / chat 适配器       | 尽量不改，复用解析函数                                   |
| `server/src/providers/openai-images.ts`     | 新增 OpenAI Images API 适配器               | 新增                                                     |
| `server/src/providers/catalog.ts`           | 内置米醋API/Cubence provider 目录与恢复逻辑 | 新增                                                     |
| `server/src/lib/providerKeys.ts`            | 当前用户 provider key 解析与能力快照        | 新增；审核修复移除全局 fallback                          |
| `server/src/lib/tasks.ts`                   | 任务执行、provider 调用、图片落库           | 增加 provider capability 校验；审核修复 session 归属校验 |
| `server/src/routes/me.ts`                   | 当前用户信息 API                            | 返回 provider capabilities                               |
| `server/src/routes/auth.ts`                 | 登录/刷新响应                               | 返回 provider capabilities                               |
| `server/src/routes/generate.ts`             | 生图 HTTP 参数 schema                       | 可能补全局尺寸或模式约束                                 |
| `server/src/routes/sysadmin.ts`             | provider/key 管理 API                       | key 创建/改绑限制到内置 provider                         |
| `web/src/views/sysadmin/Providers.vue`      | provider 管理页面                           | 必改                                                     |
| `web/src/views/sysadmin/Keys.vue`           | provider key 管理页面                       | 创建/改绑下拉仅展示内置支持 provider                     |
| `web/src/views/workspace/Workspace.vue`     | 工作台模式与提交入口                        | 按 provider capabilities 过滤模式和尺寸                  |
| `web/src/stores/auth.ts`                    | 当前用户状态                                | 持久化 provider capabilities                             |
| `web/src/components/chat/ChatInput.vue`     | 生成参数输入                                | 支持动态尺寸与参考图上限                                 |
| `docs/ARCHITECTURE.md`                      | 架构说明                                    | 文档更新                                                 |
| `docs/OPERATIONS.md`                        | 运维说明                                    | 文档更新                                                 |
| `docs/USER_GUIDE.md`                        | 用户说明                                    | 文档更新                                                 |
| `server/test/provider.test.ts`              | provider 单元测试                           | 必改                                                     |
| `server/test/cubenceRegression.test.ts`     | Cubence 接入审核回归测试                    | 新增                                                     |

## 12. 开发记录

| 日期       | 记录                                                                                                                                                                                                                                                                                                                                                                                                                                               | 状态   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-04-27 | 完成 Cubence 文档与项目现状分析，生成可追踪任务清单                                                                                                                                                                                                                                                                                                                                                                                                | 已完成 |
| 2026-04-27 | CUB-0 完成。回顾检查：需求边界明确为 Cubence 文生图/图生图，chat 与多参考图不进入首版；基线测试和类型检查通过，未发现既有阻塞。                                                                                                                                                                                                                                                                                                                    | 已完成 |
| 2026-04-27 | CUB-1 完成。新增 `openai_images` provider，覆盖 Cubence generations/edits；回顾检查发现并修复 `BlobPart` 类型问题，server typecheck 通过。                                                                                                                                                                                                                                                                                                         | 已完成 |
| 2026-04-27 | CUB-2/CUB-3 完成。注册 `openai_images`，新增内置 Cubence provider 自动补齐；任务创建前校验模式、参考图数量和尺寸。回顾检查补充了密钥 providerId 存在性校验，server typecheck 通过。                                                                                                                                                                                                                                                                | 已完成 |
| 2026-04-27 | CUB-4 与 CUB-6.1-CUB-6.3 完成。服务商页面已移除，密钥页选择服务商；新增 Cubence provider 协议测试。回顾检查：server test 7 个文件 22 个用例通过，web typecheck 通过。                                                                                                                                                                                                                                                                              | 已完成 |
| 2026-04-27 | CUB-6.4 与 CUB-7 完成。新增 provider 能力校验测试，更新架构、运维、用户指南和验收文档。回顾检查：server test 8 个文件 26 个用例通过，server typecheck 通过。                                                                                                                                                                                                                                                                                       | 已完成 |
| 2026-04-27 | CUB-5 与 CUB-4.6 完成。前端按当前 provider 能力隐藏 Cubence 不支持模式、动态展示尺寸并限制参考图数量；密钥页增加 health 测试入口。回顾检查：补齐 `/api/me` 能力快照，避免前端只靠硬编码；`pnpm -F server typecheck`、`pnpm -F web typecheck`、`pnpm -F server test`、`pnpm lint`、`pnpm -F web build`、`pnpm -F server build` 均通过。                                                                                                             | 已完成 |
| 2026-04-27 | CUB-9 审核修复完成。移除未绑定用户全局 key fallback，补充生成任务 sessionId 归属校验，内置米醋API与 Cubence provider 可恢复且不可删除，并限制密钥页只能选择受支持 provider。回顾检查：新增 8 个回归用例；`pnpm -F server typecheck`、`pnpm -F server test`、`pnpm lint`、`pnpm -F web typecheck`、`pnpm -F web build`、`pnpm -F server build` 均通过。                                                                                             | 已完成 |
| 2026-04-27 | CUB-9.6/CUB-9.7 继续审核修复完成。旧 provider key 默认不再作为分配候选，所有 admin/user/preference/provider-key owner 绑定路径统一校验 assignable key；空 `sessionId` 标准化为新会话请求。回顾检查：新增回归覆盖旧 provider key、禁用/软删 key 与空 sessionId；`server test` 9 个文件 38 个用例通过，`pnpm -F server typecheck`、`pnpm -F server test`、`pnpm lint`、`pnpm -F web typecheck`、`pnpm -F web build`、`pnpm -F server build` 均通过。 | 已完成 |
