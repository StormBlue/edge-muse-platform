CREATE TABLE IF NOT EXISTS experiments (
  key TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'running', 'paused', 'archived')),
  strategy TEXT NOT NULL CHECK (strategy IN ('parallel', 'force_legacy', 'force_ai', 'ab_test')),
  traffic_percent INTEGER NOT NULL DEFAULT 50,
  salt TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  experiment_key TEXT NOT NULL REFERENCES experiments(key),
  user_id TEXT NOT NULL REFERENCES users(id),
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  manual_override INTEGER NOT NULL DEFAULT 0,
  assigned_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment_events (
  id TEXT PRIMARY KEY NOT NULL,
  experiment_key TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B', 'parallel', 'sysadmin')),
  event_name TEXT NOT NULL,
  route TEXT,
  case_id TEXT,
  task_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  is_sysadmin_preview INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_experiment_assignments_user_key
  ON experiment_assignments(user_id, experiment_key);
CREATE INDEX IF NOT EXISTS idx_experiment_assignments_variant
  ON experiment_assignments(experiment_key, variant);
CREATE INDEX IF NOT EXISTS idx_experiment_events_created
  ON experiment_events(experiment_key, created_at);
CREATE INDEX IF NOT EXISTS idx_experiment_events_name
  ON experiment_events(experiment_key, event_name);
CREATE INDEX IF NOT EXISTS idx_experiment_events_variant
  ON experiment_events(experiment_key, variant);

