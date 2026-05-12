CREATE TABLE IF NOT EXISTS captcha_settings (
  key TEXT PRIMARY KEY NOT NULL,
  domestic_provider TEXT NOT NULL DEFAULT 'tencent',
  overseas_provider TEXT NOT NULL DEFAULT 'turnstile',
  updated_by TEXT REFERENCES users(id),
  updated_at INTEGER NOT NULL
);

