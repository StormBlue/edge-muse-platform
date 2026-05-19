CREATE TABLE `generation_feature_grants` (
  `feature` text NOT NULL,
  `user_id` text NOT NULL,
  `enabled` integer DEFAULT true NOT NULL,
  `created_by` text,
  `updated_by` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY(`feature`, `user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `idx_generation_feature_grants_feature_enabled`
  ON `generation_feature_grants` (`feature`, `enabled`);

CREATE INDEX `idx_generation_feature_grants_user`
  ON `generation_feature_grants` (`user_id`);
