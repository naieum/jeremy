CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`idToken` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`permissions` text DEFAULT 'read',
	`last_used_at` text,
	`created_at` text DEFAULT '(datetime(''now''))'
);
--> statement-breakpoint
CREATE INDEX `idx_api_keys_hash` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_user` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`title` text,
	`content` text NOT NULL,
	`url` text,
	`token_count` integer,
	`created_at` text DEFAULT '(datetime(''now''))',
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chunks_library` ON `chunks` (`library_id`);--> statement-breakpoint
CREATE TABLE `libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`source_url` text,
	`source_type` text DEFAULT 'llms_txt',
	`version` text,
	`chunk_count` integer DEFAULT 0,
	`owner_id` text NOT NULL,
	`is_public` integer DEFAULT 1,
	`created_at` text DEFAULT '(datetime(''now''))',
	`updated_at` text DEFAULT '(datetime(''now''))'
);
--> statement-breakpoint
CREATE INDEX `idx_libraries_name` ON `libraries` (`name`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`token` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
