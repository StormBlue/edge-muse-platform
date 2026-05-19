# 数据库（D1）

Edge Muse 使用 **Cloudflare D1**（SQLite）存储平台状态；Schema 以 **Drizzle ORM** 定义，迁移文件由 drizzle-kit 生成。

## 权威来源

- **表与字段**：[`server/src/db/schema.ts`](../server/src/db/schema.ts)（含中文注释说明关系与软删约定）
- **迁移 SQL**：[`server/db/migrations/`](../server/db/migrations/)
- **客户端**：[`server/src/db/client.ts`](../server/src/db/client.ts)

## 主要实体（概念层）

| 领域      | 表（见 schema 实名）                                | 说明                                                                                                                                               |
| --------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 账号      | `users`                                             | sysadmin / admin / user；新模型用 `provider_key_group_id` 与 `max_concurrent_tasks` 控制生成分配和用户级并发，`preferred_provider_key_id` 保留兼容 |
| 配额      | `quotas`                                            | 按用户张数配额与扣减                                                                                                                               |
| 服务商    | `providers`                                         | `request_format`、`supported_sizes`、内置 catalog 维护                                                                                             |
| 密钥      | `provider_keys`                                     | AES-GCM 密文；与 `providers` 外键；`max_concurrency` 为 key 级调度并发上限                                                                         |
| 密钥分组  | `provider_key_groups`, `provider_key_group_members` | sysadmin 将同一 provider 的多把 key 组成有序 group，生成调度按 group 成员顺序和 key 并发选择最终 key                                               |
| 旧绑定    | `user_provider_keys`                                | 旧用户与密钥行一对一绑定；新生成模型不再以它为权威来源，仅用于迁移兼容和历史回填                                                                   |
| 会话/消息 | `sessions`, `messages`                              | 工作台上下文与附件 JSON                                                                                                                            |
| 任务      | `tasks`                                             | 异步生图状态、provider 原始响应、`provider_key_group_id` 与调度器分配的最终 `provider_key_id`                                                      |
| 生成入口  | `generation_entry_settings`, `generation_events`    | 普通用户可见工作台/AI 图像页开关、漏斗与任务归因事件（最近 30 天用量摘要）                                                                         |
| 实验能力  | `generation_feature_grants`                         | 按 admin 用户授权实验生成目标；当前用于米醋 Grok 图像，sysadmin 永远不受该表限制                                                                   |
| 系统设置  | `ai_model_settings`, `captcha_settings`             | Prompt Assistant 模型、国内/国外登录验证码 provider 与 ALTCHA 难度                                                                                 |
| 图片      | `image_objects`                                     | R2 对象元数据                                                                                                                                      |
| 审计      | `audit_logs`                                        | 管理类写操作                                                                                                                                       |

## 迁移流程

```bash
pnpm -F server db:gen          # 改 schema 后生成 SQL
pnpm -F server db:migrate:local
pnpm -F server db:migrate:remote   # 线上，需 Wrangler 凭证
```

生成迁移后应 **人工审阅 SQL** 再提交；线上执行见 [`OPERATIONS.md`](./OPERATIONS.md)。

`captcha_settings` 当前保存一行 `key=login` 的全局登录验证码设置：`domestic_provider`、`overseas_provider` 可选 `tencent` / `turnstile` / `altcha` / `disabled`；`domestic_altcha_difficulty`、`overseas_altcha_difficulty` 分别控制国内/国外 ALTCHA 浏览器端 PoW 难度。`altcha_difficulty` 保留为旧字段兼容来源。新增字段迁移见 `server/migrations/0009_altcha_captcha.sql` 与 `0010_regional_altcha_difficulty.sql`。

`provider_key_groups` 是 0011 后的生成密钥分配权威模型。迁移会为每把旧 `provider_keys` 创建一个默认 group，并按旧 `user_provider_keys` / `preferred_provider_key_id` 回填 `users.provider_key_group_id`、`sessions.provider_key_group_id` 和 `tasks.provider_key_group_id`。这样不会把同一 provider 下的多把历史 key 自动合并给同一个管理员，避免扩大使用权限。旧 `user_provider_keys` 和 `users.preferred_provider_key_id` 暂不删除，供兼容、审计和回滚使用。

`generation_feature_grants` 由迁移 `0013_generation_feature_grants.sql` 创建，主键为 `(feature, user_id)`。当前唯一 feature 为 `micu_grok_image`，仅控制 admin 是否能看到和使用 `generationTargetId=micu_grok`；sysadmin 在业务逻辑中始终允许。

## 备份与清理

- 运维快照与表大小日志见 [`server/src/lib/operations.ts`](../server/src/lib/operations.ts) 及 cron 说明（[`RELIABILITY.md`](./RELIABILITY.md)）。
- 软删与 R2 清理见 [`server/src/lib/cleanup.ts`](../server/src/lib/cleanup.ts)。

## 相关文档

- [`EXPERIMENTS.md`](./EXPERIMENTS.md) — 生成实验与事件的代码入口
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — 数据流概览
- [`SECURITY.md`](./SECURITY.md) — 密钥加密与访问控制
- [`API.md`](./API.md) — 对外暴露的数据形状
