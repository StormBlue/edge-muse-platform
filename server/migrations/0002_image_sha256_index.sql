CREATE INDEX IF NOT EXISTS idx_image_objects_sha256_deleted
ON image_objects(sha256, deleted_at);
