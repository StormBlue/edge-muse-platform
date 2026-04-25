import { relations, type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    nickname: text("nickname").notNull(),
    role: text("role", { enum: ["sysadmin", "admin", "user"] }).notNull(),
    createdBy: text("created_by"),
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

export const passwordResets = sqliteTable("password_resets", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull()
});

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

export const userProviderKeys = sqliteTable("user_provider_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  providerKeyId: text("provider_key_id")
    .notNull()
    .references(() => providerKeys.id),
  assignedAt: integer("assigned_at").notNull()
});

export const quotas = sqliteTable("quotas", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  allocatedQuota: integer("allocated_quota"),
  usedQuota: integer("used_quota").notNull().default(0),
  updatedAt: integer("updated_at").notNull()
});

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
    ownerCreatedIdx: index("idx_image_objects_owner").on(table.ownerUserId, table.createdAt)
  })
);

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

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Provider = InferSelectModel<typeof providers>;
export type ProviderKey = InferSelectModel<typeof providerKeys>;
export type Session = InferSelectModel<typeof sessions>;
export type Message = InferSelectModel<typeof messages>;
export type Task = InferSelectModel<typeof tasks>;
export type ImageObject = InferSelectModel<typeof imageObjects>;
