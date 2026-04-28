CREATE TABLE IF NOT EXISTS prompt_cases (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  modes TEXT NOT NULL,
  recommended_size TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  prompt_template TEXT NOT NULL,
  prompt_summary TEXT NOT NULL,
  thumbnail_url TEXT,
  source_url TEXT,
  source_author TEXT,
  source_license TEXT NOT NULL DEFAULT 'internal' CHECK (source_license IN ('CC BY 4.0', 'original', 'internal')),
  source_repo TEXT,
  popularity TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden', 'archived')),
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  locale TEXT NOT NULL DEFAULT 'zh-CN' CHECK (locale IN ('zh-CN', 'en-US')),
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_case_imports (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'partial')),
  total_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  errors TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_cases_status_sort ON prompt_cases(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_prompt_cases_locale_status ON prompt_cases(locale, status);
CREATE INDEX IF NOT EXISTS idx_prompt_cases_category ON prompt_cases(category);
CREATE INDEX IF NOT EXISTS idx_prompt_cases_featured ON prompt_cases(featured);
CREATE INDEX IF NOT EXISTS idx_prompt_cases_source_url ON prompt_cases(source_url);
CREATE INDEX IF NOT EXISTS idx_prompt_case_imports_created ON prompt_case_imports(created_at);
CREATE INDEX IF NOT EXISTS idx_prompt_case_imports_source ON prompt_case_imports(source);

