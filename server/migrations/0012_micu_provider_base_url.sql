UPDATE providers
SET
  base_url = 'https://www.micuapi.ai',
  updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE id = 'prv_micu'
  AND base_url <> 'https://www.micuapi.ai';

UPDATE providers
SET
  base_url = 'https://www.micuapi.ai',
  updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE request_format IN ('micu_images', 'openai_compatible')
  AND base_url = 'https://www.openclaudecode.cn';
