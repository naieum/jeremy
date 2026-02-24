-- Repo connections with GitHub verification
CREATE TABLE IF NOT EXISTS `repo_connections` (
  `id` text PRIMARY KEY NOT NULL,
  `library_id` text NOT NULL REFERENCES `libraries`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `user`(`id`),
  `repo_url` text NOT NULL,
  `repo_owner` text NOT NULL,
  `repo_name` text NOT NULL,
  `verification_method` text,
  `last_ingested_at` text,
  `verification_token` text,
  `verified_at` text,
  `github_user_id` text,
  `webhook_secret` text,
  `created_at` text DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_repo_conn_library_unique` ON `repo_connections` (`library_id`);
CREATE INDEX IF NOT EXISTS `idx_repo_conn_user` ON `repo_connections` (`user_id`);

-- User flags for accountability/banning
CREATE TABLE IF NOT EXISTS `user_flags` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`),
  `flag` text NOT NULL,
  `reason` text,
  `created_by` text,
  `created_at` text DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS `idx_user_flags_user` ON `user_flags` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_user_flags_flag` ON `user_flags` (`flag`);

-- Hosted doc sites
CREATE TABLE IF NOT EXISTS `doc_sites` (
  `id` text PRIMARY KEY NOT NULL,
  `library_id` text NOT NULL REFERENCES `libraries`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `user`(`id`),
  `subdomain` text NOT NULL,
  `custom_domain` text,
  `status` text DEFAULT 'pending',
  `build_error` text,
  `last_built_at` text,
  `created_at` text DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_doc_sites_subdomain` ON `doc_sites` (`subdomain`);
CREATE INDEX IF NOT EXISTS `idx_doc_sites_library` ON `doc_sites` (`library_id`);
