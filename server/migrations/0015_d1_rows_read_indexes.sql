CREATE INDEX IF NOT EXISTS idx_sessions_user_last
  ON sessions(user_id, deleted_at, last_message_at);

CREATE INDEX IF NOT EXISTS idx_tasks_session
  ON tasks(session_id);

CREATE INDEX IF NOT EXISTS idx_tasks_message
  ON tasks(message_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status_assigned
  ON tasks(status, assigned_at);

CREATE INDEX IF NOT EXISTS idx_tasks_status_finished
  ON tasks(status, finished_at);

CREATE INDEX IF NOT EXISTS idx_image_objects_task
  ON image_objects(task_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_image_objects_session
  ON image_objects(session_id, deleted_at, is_reference);

CREATE INDEX IF NOT EXISTS idx_image_objects_deleted
  ON image_objects(deleted_at);

CREATE INDEX IF NOT EXISTS idx_generation_events_created_preview
  ON generation_events(created_at, is_sysadmin_preview);
