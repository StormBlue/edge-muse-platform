-- Development seed. Replace password_hash with a value produced by the app hash helper.
-- Recommended flow:
-- 1. pnpm -F server db:migrate:local
-- 2. Use /api/dev/seed only in a private local branch, or insert a real hash manually.

INSERT OR IGNORE INTO providers (
  id, name, base_url, default_model, request_format, supported_sizes, enabled, created_at, updated_at
) VALUES (
  'prv_mock', 'Local Mock Provider', 'mock:', 'gpt-image-2', 'openai_compatible',
  '["1024x1024","1024x1536","1536x1024","auto"]', 1, 0, 0
);
