CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('sysadmin', 'admin', 'user')),
  created_by TEXT REFERENCES users(id),
  preferred_provider_key_id TEXT,
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  default_model TEXT NOT NULL,
  request_format TEXT NOT NULL DEFAULT 'openai_compatible',
  supported_sizes TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_keys (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  label TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  allocated_quota INTEGER,
  used_quota INTEGER NOT NULL DEFAULT 0,
  owner_admin_id TEXT REFERENCES users(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_provider_keys (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  provider_key_id TEXT NOT NULL REFERENCES provider_keys(id),
  assigned_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quotas (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  allocated_quota INTEGER,
  used_quota INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quota_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('admin_grant', 'task_charge', 'task_refund')),
  operator_id TEXT REFERENCES users(id),
  task_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('text2image', 'image2image', 'chat')),
  provider_key_id TEXT REFERENCES provider_keys(id),
  settings TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  prompt TEXT,
  reference_image_ids TEXT NOT NULL DEFAULT '[]',
  attachments TEXT NOT NULL DEFAULT '[]',
  task_id TEXT,
  status TEXT NOT NULL DEFAULT 'succeeded',
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  message_id TEXT NOT NULL REFERENCES messages(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_key_id TEXT NOT NULL REFERENCES provider_keys(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  mode TEXT NOT NULL CHECK (mode IN ('text2image', 'image2image', 'chat')),
  params TEXT NOT NULL,
  error_code TEXT,
  error_msg TEXT,
  provider_request_id TEXT,
  provider_raw_response TEXT,
  queued_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  retry_of TEXT REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS image_objects (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT REFERENCES tasks(id),
  session_id TEXT REFERENCES sessions(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  r2_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  is_reference INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_user_queued ON tasks(user_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_image_objects_r2_key ON image_objects(r2_key);
CREATE INDEX IF NOT EXISTS idx_image_objects_owner ON image_objects(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_keys_provider ON provider_keys(provider_id);
CREATE INDEX IF NOT EXISTS idx_quota_transactions_user_created ON quota_transactions(user_id, created_at DESC);
