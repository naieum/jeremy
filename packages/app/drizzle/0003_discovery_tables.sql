CREATE TABLE IF NOT EXISTS `discovery_sources` (
  `id` TEXT PRIMARY KEY,
  `type` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `config` TEXT NOT NULL DEFAULT '{}',
  `enabled` INTEGER NOT NULL DEFAULT 1,
  `schedule` TEXT NOT NULL DEFAULT 'weekly',
  `last_run_at` TEXT,
  `last_run_result` TEXT,
  `created_at` TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `discovery_queue` (
  `id` TEXT PRIMARY KEY,
  `source_id` TEXT NOT NULL,
  `identifier` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `website_url` TEXT,
  `docs_url` TEXT,
  `strategy` TEXT,
  `library_id` TEXT,
  `status` TEXT NOT NULL DEFAULT 'pending',
  `skip_reason` TEXT,
  `error_msg` TEXT,
  `metadata` TEXT DEFAULT '{}',
  `discovered_at` TEXT DEFAULT (datetime('now')),
  `processed_at` TEXT
);
CREATE INDEX IF NOT EXISTS `idx_dq_status` ON `discovery_queue` (`status`);
CREATE INDEX IF NOT EXISTS `idx_dq_source` ON `discovery_queue` (`source_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_dq_source_ident` ON `discovery_queue` (`source_id`, `identifier`);

-- Pre-seed sources
INSERT OR IGNORE INTO `discovery_sources` VALUES
  ('npm-top-100',    'npm_registry',  'npm Top 100',              '{"limit":100}',                          1, 'weekly', NULL, NULL, datetime('now')),
  ('pypi-top-100',   'pypi',          'PyPI Top 100',             '{"limit":100}',                          1, 'weekly', NULL, NULL, datetime('now')),
  ('cratesio-top-50','cratesio',      'crates.io Top 50',         '{"limit":50}',                           1, 'weekly', NULL, NULL, datetime('now')),
  ('github-js',      'github_search', 'GitHub JS/TS Libraries',   '{"topic":"javascript","limit":30}',      1, 'weekly', NULL, NULL, datetime('now')),
  ('github-ml',      'github_search', 'GitHub ML/AI Libraries',   '{"topic":"machine-learning","limit":30}',1, 'weekly', NULL, NULL, datetime('now'));
