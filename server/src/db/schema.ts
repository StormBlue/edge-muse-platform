/**
 * D1（SQLite）表定义与关系：
 * - 时间戳：统一毫秒级 Unix epoch（`Date.now()` 语义）。
 * - 软删：多数用 `deleted_at`；`image_objects` 等配合业务「清理任务图」会写删除时间。
 * - JSON 列：`settings`、`params`、`attachments`、`supported_sizes` 等由 `stringifyJson` / `parseJson` 与 TS 类型对齐。
 * 与产品文档数据模型一致，迁移由 drizzle-kit 生成到 `db/migrations`。
 */
import { relations, type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

/**
 * 用户主表：sysadmin / admin / user；普通用户由租户 admin 在后台创建，`createdBy` 指向创建者。
 * `preferredProviderKeyId` 为个人默认生图所用密钥行（可空，运行时还有 `user_provider_keys` 回退逻辑）。
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    nickname: text("nickname").notNull(),
    role: text("role", { enum: ["sysadmin", "admin", "user"] }).notNull(),
    /** 由哪位管理员创建；sysadmin 自注册可为空；用于 admin 仅管理「名下」用户 */
    createdBy: text("created_by"),
    /** 与 `resolveProviderKey` 的「偏好密钥」一致 */
    preferredProviderKeyId: text("preferred_provider_key_id"),
    locale: text("locale").notNull().default("zh-CN"),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastLoginAt: integer("last_login_at")
  },
  (table) => ({
    emailIdx: uniqueIndex("idx_users_email").on(table.email),
    usernameIdx: uniqueIndex("idx_users_username").on(table.username),
    createdByIdx: index("idx_users_created_by").on(table.createdBy)
  })
);

/**
 * 忘记密码/重置：邮件中的随机 token 一次性；`used_at` 或过期后不可复用（具体路由以 auth 实现为准）。
 */
export const passwordResets = sqliteTable("password_resets", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull()
});

/**
 * 上游 Provider 元数据（非密钥）：`baseUrl`、`requestFormat` 与 `providers/registry` 里适配器名对应；
 * `supported_sizes` 为 JSON 字符串数组；`deleted_at` 非空即逻辑下线。
 */
export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  defaultModel: text("default_model").notNull(),
  requestFormat: text("request_format").notNull().default("openai_compatible"),
  supportedSizes: text("supported_sizes").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at")
});

/**
 * 具体 API Key 行：密文 `encryptedKey` 由 `KEY_ENCRYPTION_KEY` 加解密；`keyHint` 仅展示后几位。
 * `allocatedQuota` / `usedQuota` 可为密钥维度的资源控制（与 `lib/quota` 用户配额并存时取业务规则）。
 * `ownerAdminId` 可选，标记「由哪位租户 admin 主要维护」、便于级联把下属绑到同一把 key。
 */
export const providerKeys = sqliteTable(
  "provider_keys",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    label: text("label").notNull(),
    model: text("model"),
    encryptedKey: text("encrypted_key").notNull(),
    keyHint: text("key_hint").notNull(),
    allocatedQuota: integer("allocated_quota"),
    usedQuota: integer("used_quota").notNull().default(0),
    ownerAdminId: text("owner_admin_id").references(() => users.id),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at")
  },
  (table) => ({
    providerIdx: index("idx_provider_keys_provider").on(table.providerId)
  })
);

/**
 * 用户与 provider key 的绑定表：主键为 `user_id`，每用户最多一行（改绑走 UPSERT/替换）。
 * 生图时 `resolveProviderKey` 只在 preference / 本行之间选择；未绑定用户不使用全局兜底 key。
 */
export const userProviderKeys = sqliteTable("user_provider_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  providerKeyId: text("provider_key_id")
    .notNull()
    .references(() => providerKeys.id),
  assignedAt: integer("assigned_at").notNull()
});

/**
 * 按「张」为单位的生图配额：`allocatedQuota` 为 null 表示不限；`usedQuota` 随 `tryConsumeQuota` / `refundQuota` 变。
 */
export const quotas = sqliteTable("quotas", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  allocatedQuota: integer("allocated_quota"),
  usedQuota: integer("used_quota").notNull().default(0),
  updatedAt: integer("updated_at").notNull()
});

/**
 * 配额流水：delta 可正可负；reason 区分管理员加量、任务预扣、失败退款等；`taskId` 便于按任务对账。
 */
export const quotaTransactions = sqliteTable(
  "quota_transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    delta: integer("delta").notNull(),
    reason: text("reason", { enum: ["admin_grant", "task_charge", "task_refund"] }).notNull(),
    operatorId: text("operator_id").references(() => users.id),
    taskId: text("task_id"),
    createdAt: integer("created_at").notNull()
  },
  (table) => ({
    userCreatedIdx: index("idx_quota_transactions_user_created").on(table.userId, table.createdAt)
  })
);

/**
 * 聊天/生图会话：`mode` 与 `tasks.mode` 对齐；`settings` 存 `size`/`n`/`model` JSON；
 * `lastMessageAt` 供列表排序；`archived` 为布尔；`deleted_at` 为软删。
 */
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  mode: text("mode", { enum: ["text2image", "image2image", "chat"] }).notNull(),
  providerKeyId: text("provider_key_id").references(() => providerKeys.id),
  settings: text("settings").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lastMessageAt: integer("last_message_at").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  deletedAt: integer("deleted_at")
});

/**
 * 单条消息：`referenceImageIds` / `attachments` 为 JSON 字符串数组；
 * assistant 生图时 `taskId` 联到 `tasks`，`status` 随任务 queued→running→终态 更新。
 */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    prompt: text("prompt"),
    referenceImageIds: text("reference_image_ids").notNull().default("[]"),
    attachments: text("attachments").notNull().default("[]"),
    taskId: text("task_id"),
    status: text("status").notNull().default("succeeded"),
    createdAt: integer("created_at").notNull(),
    deletedAt: integer("deleted_at")
  },
  (table) => ({
    sessionCreatedIdx: index("idx_messages_session_created").on(table.sessionId, table.createdAt)
  })
);

/**
 * 异步生图任务：`params` 为 `GenerateParams` JSON；`status` 与 `started_at` 构成执行租约，防并发覆盖。
 * `provider_raw_response` 可含多槽成功/失败、崩溃恢复等结构化数组；`retryOf` 指向重试的源任务 id。
 * `heartbeat_at` 供长跑观测与恢复扫描；`finished_at` 与终态同时写。
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    providerKeyId: text("provider_key_id")
      .notNull()
      .references(() => providerKeys.id),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed", "cancelled"]
    }).notNull(),
    mode: text("mode", { enum: ["text2image", "image2image", "chat"] }).notNull(),
    params: text("params").notNull(),
    errorCode: text("error_code"),
    errorMsg: text("error_msg"),
    providerRequestId: text("provider_request_id"),
    providerRawResponse: text("provider_raw_response"),
    queuedAt: integer("queued_at").notNull(),
    startedAt: integer("started_at"),
    heartbeatAt: integer("heartbeat_at"),
    finishedAt: integer("finished_at"),
    retryOf: text("retry_of")
  },
  (table) => ({
    userQueuedIdx: index("idx_tasks_user_queued").on(table.userId, table.queuedAt),
    statusIdx: index("idx_tasks_status").on(table.status),
    statusHeartbeatIdx: index("idx_tasks_status_heartbeat").on(table.status, table.heartbeatAt)
  })
);

/**
 * R2 上图片对象的 D1 索引：`r2Key` 唯一；`sha256` 与 `putImage` 去重；`is_reference=1` 为图生图用户上传参考图。
 * 任务生成图在 `tasks` 跑完后会出现在本表；软删用 `deleted_at`。
 */
export const imageObjects = sqliteTable(
  "image_objects",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => tasks.id),
    sessionId: text("session_id").references(() => sessions.id),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    r2Key: text("r2_key").notNull().unique(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    isReference: integer("is_reference", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    deletedAt: integer("deleted_at")
  },
  (table) => ({
    r2KeyIdx: index("idx_image_objects_r2_key").on(table.r2Key),
    ownerCreatedIdx: index("idx_image_objects_owner").on(table.ownerUserId, table.createdAt),
    shaDeletedIdx: index("idx_image_objects_sha256_deleted").on(table.sha256, table.deletedAt)
  })
);

/**
 * AI 图像生成案例库：由 sysadmin 维护，用户端只读取 `published` 案例。
 * `modes` / `tags` / `popularity` 存 JSON 文本，路由层统一解析后返回，避免前端接触数据库字符串。
 */
export const promptCases = sqliteTable(
  "prompt_cases",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    modes: text("modes").notNull(),
    recommendedSize: text("recommended_size").notNull(),
    tags: text("tags").notNull().default("[]"),
    promptTemplate: text("prompt_template").notNull(),
    promptSummary: text("prompt_summary").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    sourceUrl: text("source_url"),
    sourceAuthor: text("source_author"),
    sourceLicense: text("source_license", {
      enum: ["CC BY 4.0", "original", "internal"]
    })
      .notNull()
      .default("internal"),
    sourceRepo: text("source_repo"),
    popularity: text("popularity").notNull().default("{}"),
    status: text("status", { enum: ["draft", "published", "hidden", "archived"] })
      .notNull()
      .default("draft"),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    locale: text("locale", { enum: ["zh-CN", "en-US"] })
      .notNull()
      .default("zh-CN"),
    createdBy: text("created_by").references(() => users.id),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull()
  },
  (table) => ({
    statusSortIdx: index("idx_prompt_cases_status_sort").on(table.status, table.sortOrder),
    localeStatusIdx: index("idx_prompt_cases_locale_status").on(table.locale, table.status),
    categoryIdx: index("idx_prompt_cases_category").on(table.category),
    featuredIdx: index("idx_prompt_cases_featured").on(table.featured),
    sourceUrlIdx: index("idx_prompt_cases_source_url").on(table.sourceUrl)
  })
);

/**
 * 案例导入批次：外部 JSON / 开源项目导入后先进入 draft，导入结果在此留痕供 sysadmin 排查。
 */
export const promptCaseImports = sqliteTable(
  "prompt_case_imports",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    status: text("status", { enum: ["completed", "failed", "partial"] }).notNull(),
    totalCount: integer("total_count").notNull(),
    importedCount: integer("imported_count").notNull(),
    failedCount: integer("failed_count").notNull(),
    errors: text("errors").notNull().default("[]"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: integer("created_at").notNull()
  },
  (table) => ({
    createdIdx: index("idx_prompt_case_imports_created").on(table.createdAt),
    sourceIdx: index("idx_prompt_case_imports_source").on(table.source)
  })
);

/**
 * 生成入口设置：只控制普通用户是否看到旧版「图像生成」与新版「AI 图像生成」。
 * 单行 key 固定为 `default`；sysadmin 始终能看到两个入口，便于运维。
 */
export const generationEntrySettings = sqliteTable("generation_entry_settings", {
  key: text("key").primaryKey(),
  showWorkspace: integer("show_workspace", { mode: "boolean" }).notNull().default(true),
  showAiImage: integer("show_ai_image", { mode: "boolean" }).notNull().default(true),
  updatedBy: text("updated_by").references(() => users.id),
  updatedAt: integer("updated_at").notNull()
});

/**
 * AI 大模型运行配置：目前 key 固定为 `prompt_assistant`，用于系统管理员动态切换
 * AI Prompt 助手所调用的 Workers AI 文本模型。
 */
export const aiModelSettings = sqliteTable("ai_model_settings", {
  key: text("key").primaryKey(),
  model: text("model").notNull(),
  updatedBy: text("updated_by").references(() => users.id),
  updatedAt: integer("updated_at").notNull()
});

/** 生成入口用量事件：只保留页面、事件名、任务/案例引用和安全 metadata。 */
export const generationEvents = sqliteTable(
  "generation_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    route: text("route", { enum: ["/workspace", "/ai-image"] }).notNull(),
    eventName: text("event_name").notNull(),
    caseId: text("case_id"),
    taskId: text("task_id"),
    metadata: text("metadata").notNull().default("{}"),
    isSysadminPreview: integer("is_sysadmin_preview", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull()
  },
  (table) => ({
    routeCreatedIdx: index("idx_generation_events_route_created").on(table.route, table.createdAt),
    eventNameIdx: index("idx_generation_events_name").on(table.eventName),
    taskEventIdx: index("idx_generation_events_task_name").on(table.taskId, table.eventName)
  })
);

/**
 * 系统公告：sysadmin 发布，普通用户在右上角公告中心查看。
 * `targetAudience=admins` 面向 admin 与 sysadmin；`all` 面向所有角色。
 */
export const announcements = sqliteTable(
  "announcements",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    targetAudience: text("target_audience", { enum: ["all", "admins"] })
      .notNull()
      .default("all"),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    createdBy: text("created_by").references(() => users.id),
    updatedBy: text("updated_by").references(() => users.id),
    publishedAt: integer("published_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at")
  },
  (table) => ({
    statusPublishedIdx: index("idx_announcements_status_published").on(
      table.status,
      table.publishedAt
    ),
    targetStatusIdx: index("idx_announcements_target_status").on(table.targetAudience, table.status)
  })
);

/** 用户已读公告：用于右上角新消息红点和详情页已读状态。 */
export const announcementReads = sqliteTable(
  "announcement_reads",
  {
    announcementId: text("announcement_id")
      .notNull()
      .references(() => announcements.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    readAt: integer("read_at").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.announcementId, table.userId] }),
    userReadIdx: index("idx_announcement_reads_user").on(table.userId, table.readAt)
  })
);

/**
 * 管理操作审计：actor 可为空（系统任务）；`payload` 建议存 JSON 且敏感字段打码；`ip` 便于溯源。
 */
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  payload: text("payload").notNull().default("{}"),
  ip: text("ip"),
  createdAt: integer("created_at").notNull()
});

/** Drizzle 关系：用于 query API `with` 预加载，非外键替代 */
export const usersRelations = relations(users, ({ one, many }) => ({
  creator: one(users, {
    fields: [users.createdBy],
    references: [users.id],
    relationName: "createdUsers"
  }),
  createdUsers: many(users, { relationName: "createdUsers" }),
  quota: one(quotas),
  sessions: many(sessions)
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  messages: many(messages),
  tasks: many(tasks)
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, { fields: [messages.sessionId], references: [sessions.id] })
}));

/** 各表行类型与插入类型，供路由/领域函数标注返回值 */
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Provider = InferSelectModel<typeof providers>;
export type ProviderKey = InferSelectModel<typeof providerKeys>;
export type Session = InferSelectModel<typeof sessions>;
export type Message = InferSelectModel<typeof messages>;
export type Task = InferSelectModel<typeof tasks>;
export type ImageObject = InferSelectModel<typeof imageObjects>;
export type PromptCase = InferSelectModel<typeof promptCases>;
export type PromptCaseImport = InferSelectModel<typeof promptCaseImports>;
export type GenerationEntrySettings = InferSelectModel<typeof generationEntrySettings>;
export type AiModelSettings = InferSelectModel<typeof aiModelSettings>;
export type GenerationEvent = InferSelectModel<typeof generationEvents>;
export type Announcement = InferSelectModel<typeof announcements>;
export type AnnouncementRead = InferSelectModel<typeof announcementReads>;
