CREATE INDEX IF NOT EXISTS idx_prompt_cases_public_sort
ON prompt_cases(status, locale, featured, sort_order, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_prompt_cases_public_category_sort
ON prompt_cases(status, locale, category, featured, sort_order, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_prompt_cases_public_size
ON prompt_cases(status, locale, recommended_size);
