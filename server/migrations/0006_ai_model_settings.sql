CREATE TABLE IF NOT EXISTS ai_model_settings (
  key TEXT PRIMARY KEY NOT NULL,
  model TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at INTEGER NOT NULL
);
