DROP TABLE IF EXISTS experiment_events;
DROP TABLE IF EXISTS experiment_assignments;
DROP TABLE IF EXISTS experiments;

CREATE TABLE IF NOT EXISTS generation_entry_settings (
  key TEXT PRIMARY KEY NOT NULL,
  show_workspace INTEGER NOT NULL DEFAULT 1,
  show_ai_image INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id),
  route TEXT NOT NULL CHECK (route IN ('/workspace', '/ai-image')),
  event_name TEXT NOT NULL,
  case_id TEXT,
  task_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  is_sysadmin_preview INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_events_route_created
  ON generation_events(route, created_at);
CREATE INDEX IF NOT EXISTS idx_generation_events_name
  ON generation_events(event_name);
CREATE INDEX IF NOT EXISTS idx_generation_events_task_name
  ON generation_events(task_id, event_name);
