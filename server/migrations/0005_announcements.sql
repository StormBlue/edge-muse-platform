CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'admins')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_announcements_status_published
  ON announcements(status, published_at);
CREATE INDEX IF NOT EXISTS idx_announcements_target_status
  ON announcements(target_audience, status);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id TEXT NOT NULL REFERENCES announcements(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  read_at INTEGER NOT NULL,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_user
  ON announcement_reads(user_id, read_at);
