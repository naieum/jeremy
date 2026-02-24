ALTER TABLE `libraries` ADD COLUMN `category` text DEFAULT 'other';
CREATE INDEX IF NOT EXISTS `idx_libraries_category` ON `libraries` (`category`);
UPDATE `libraries` SET `category` = 'other' WHERE `category` IS NULL;
