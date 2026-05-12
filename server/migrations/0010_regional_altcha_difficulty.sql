ALTER TABLE captcha_settings ADD COLUMN domestic_altcha_difficulty INTEGER NOT NULL DEFAULT 50000;
ALTER TABLE captcha_settings ADD COLUMN overseas_altcha_difficulty INTEGER NOT NULL DEFAULT 50000;

UPDATE captcha_settings
SET
  domestic_altcha_difficulty = altcha_difficulty,
  overseas_altcha_difficulty = altcha_difficulty
WHERE altcha_difficulty IS NOT NULL;
