ALTER TABLE provider_keys ADD COLUMN max_concurrency INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS provider_key_groups (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  name TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS provider_key_group_members (
  group_id TEXT NOT NULL REFERENCES provider_key_groups(id),
  provider_key_id TEXT NOT NULL REFERENCES provider_keys(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, provider_key_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_key_groups_provider
  ON provider_key_groups(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_key_groups_enabled
  ON provider_key_groups(enabled, deleted_at);
CREATE INDEX IF NOT EXISTS idx_provider_key_group_members_group_sort
  ON provider_key_group_members(group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_provider_key_group_members_key
  ON provider_key_group_members(provider_key_id);

ALTER TABLE users ADD COLUMN provider_key_group_id TEXT REFERENCES provider_key_groups(id);
ALTER TABLE users ADD COLUMN max_concurrent_tasks INTEGER;
ALTER TABLE sessions ADD COLUMN provider_key_group_id TEXT REFERENCES provider_key_groups(id);
ALTER TABLE tasks ADD COLUMN provider_key_group_id TEXT REFERENCES provider_key_groups(id);
ALTER TABLE tasks ADD COLUMN assigned_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_tasks_group_queued
  ON tasks(provider_key_group_id, status, queued_at);
CREATE INDEX IF NOT EXISTS idx_tasks_provider_key_status
  ON tasks(provider_key_id, status);

INSERT INTO provider_key_groups (
  id,
  provider_id,
  name,
  description,
  enabled,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  'pkg_' || provider_keys.id,
  provider_keys.provider_id,
  provider_keys.label || ' 默认分组',
  'Migrated from single provider key binding',
  provider_keys.enabled,
  provider_keys.owner_admin_id,
  provider_keys.owner_admin_id,
  provider_keys.created_at,
  provider_keys.updated_at,
  provider_keys.deleted_at
FROM provider_keys
WHERE NOT EXISTS (
  SELECT 1
  FROM provider_key_groups
  WHERE provider_key_groups.id = 'pkg_' || provider_keys.id
);

INSERT INTO provider_key_group_members (
  group_id,
  provider_key_id,
  sort_order,
  created_at,
  updated_at
)
SELECT
  'pkg_' || provider_keys.id,
  provider_keys.id,
  0,
  provider_keys.created_at,
  provider_keys.updated_at
FROM provider_keys
WHERE NOT EXISTS (
  SELECT 1
  FROM provider_key_group_members
  WHERE provider_key_group_members.group_id = 'pkg_' || provider_keys.id
    AND provider_key_group_members.provider_key_id = provider_keys.id
);

UPDATE users
SET
  provider_key_group_id = (
    SELECT 'pkg_' || user_provider_keys.provider_key_id
    FROM user_provider_keys
    WHERE user_provider_keys.user_id = users.id
  ),
  max_concurrent_tasks = CASE
    WHEN role = 'admin' THEN 10
    WHEN role = 'user' THEN 5
    ELSE NULL
  END
WHERE provider_key_group_id IS NULL;

UPDATE users
SET provider_key_group_id = 'pkg_' || preferred_provider_key_id
WHERE provider_key_group_id IS NULL
  AND preferred_provider_key_id IS NOT NULL;

UPDATE sessions
SET provider_key_group_id = 'pkg_' || provider_key_id
WHERE provider_key_group_id IS NULL
  AND provider_key_id IS NOT NULL;

UPDATE tasks
SET
  provider_key_group_id = 'pkg_' || provider_key_id,
  assigned_at = CASE
    WHEN status = 'queued' THEN NULL
    ELSE started_at
  END
WHERE provider_key_group_id IS NULL
  AND provider_key_id IS NOT NULL;
