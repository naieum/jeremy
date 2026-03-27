CREATE TABLE IF NOT EXISTS `deviceCode` (
  `id` text PRIMARY KEY NOT NULL,
  `deviceCode` text NOT NULL,
  `userCode` text NOT NULL,
  `userId` text,
  `clientId` text,
  `scope` text,
  `status` text NOT NULL DEFAULT 'pending',
  `expiresAt` integer NOT NULL,
  `lastPolledAt` integer,
  `pollingInterval` integer,
  `createdAt` integer,
  `updatedAt` integer
);
