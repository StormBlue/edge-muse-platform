# 米醋 Grok 图像实验能力需求

## 背景

米醋当前平台主通道为 `gpt-image-2`，服务商包括米醋 API 与 Cubence。米醋新增 Grok 图像通道，`Subaru486desuwa/micu-image-mcp` 提供了可参考的 HTTP 参数形态，但本平台必须继续复用现有任务、会话、配额、R2、WebSocket、历史与 sysadmin 会话审核链路。

## 目标

- 将米醋 Grok 图像作为受控实验生成目标接入现有 `/api/generate` 管线。
- `sysadmin` 永远可见并可使用该能力。
- `sysadmin` 可仅对指定 `admin` 授权该能力。
- 未授权账号不能通过前端隐藏项或手写请求绕过。
- 生成历史、失败重试、会话审核、图片存储、配额扣减与现有生成保持一致。

## 非目标

- 不在 Worker 中运行 Python MCP server。
- 不为 Grok 新建独立历史、独立会话或独立审核系统。
- 第一版不向普通用户开放 Grok；不隐式扩散给 admin 创建的用户。
- 第一版不承诺 Grok 精确输出请求像素；不做 Pillow 式本地尺寸归一化。

## HTTP 与模型参考

来自 `micu-image-mcp` 的 Grok 参考形态：

- base URL 默认 `https://www.micuapi.ai`
- 文生图：`POST /v1/images/generations`
- 图生图：同 endpoint，附 `reference_image` data URL
- 多参考图：同 endpoint，附 `image_urls` data URL 数组
- 关键字段：`model`、`prompt`、`n`、`resolution`、`aspect_ratio`、`response_format`
- 参考模型：`grok-imagine-image-lite`、`grok-imagine-image`、`grok-imagine-image-pro`、`grok-imagine-image-edit`

本平台第一版使用独立内置 provider `prv_micu_grok`，默认模型 `grok-imagine-image-lite`，request format 为 `micu_grok_images`；需要 pro 时由对应 key 行显式配置模型。

## 功能需求

1. provider 与密钥
   - 系统启动/密钥页加载时补齐内置 provider「米醋 Grok 图像」。
   - sysadmin 可在现有密钥页为该 provider 创建 key、group。
   - 该 provider 的 key/group 使用现有密钥加密、并发、调度机制。

2. 实验授权
   - 新增实验能力 `micu_grok_image`。
   - `sysadmin` 不需要授权记录，永远可用。
   - `admin` 仅在存在启用授权记录时可用。
   - `user` 第一版不可用。
   - sysadmin 可查看 admin 列表及授权状态，可批量保存授权。

3. 生成目标
   - `/api/me` 与登录/刷新响应返回 `generationTargets`。
   - `generationTargets` 至少包含当前默认目标；授权用户额外包含 `micu_grok`。
   - 每个 target 带 provider 能力快照：模式、尺寸、参考图上限、模型、group/key 信息。
   - 前端保持兼容现有 `providerCapabilities`，默认目标仍沿用原字段。

4. 生成请求
   - `/api/generate` 新增 `generationTargetId`，缺省为 `default`。
   - 服务端按当前用户与目标解析 provider key group，不能信任客户端传入任意 `model`。
   - 未授权目标返回 `FORBIDDEN`。
   - target 的 provider/mode/size/reference 校验必须在扣配额和建任务前完成。
   - `tasks.params` 与 `sessions.settings` 保留 `generationTargetId`，供历史和审核可见。

5. Grok provider adapter
   - text-to-image 请求体使用 `resolution` 与 `aspect_ratio` 映射，不使用 image2 的 `size` 字段。
   - image-to-image 把第一张参考图作为 `reference_image` data URL。
   - 第一版最多 1 张参考图；多参考图后续单独做产品入口。
   - 只开放 1K/2K 常用尺寸。
   - 解析响应复用兼容图片提取逻辑。

6. 前端
   - 工作台与 AI 图像页在用户有多个 target 时显示目标选择控件。
   - 目标变化后，模式、尺寸、参考图上限和高分辨率限制按目标能力刷新。
   - sysadmin 设置页提供 Grok 实验授权管理。

## 非功能需求

- 安全：不在日志、响应、metadata 中输出 API key 明文；请求体日志只记录结构摘要。
- 兼容：老前端不传 `generationTargetId` 时仍使用 default。
- 可观测：生成日志、审计 payload 和 generation event metadata 可看到 target id。
- 测试：覆盖 provider adapter、授权解析、未授权拒绝、target 能力快照、前端 target 选择。

## 风险

- 米醋 Grok 真实模型名可能与口头名称不一致；第一版默认跟随 MCP 参考使用 `grok-imagine-image-lite`，也允许 key 行覆盖 model。
- Grok 返回尺寸不稳定；UI 不展示“精确输出”承诺。
- 若 Grok group 未配置 key，授权用户仍不会看到可用 target，避免提交后才失败。
