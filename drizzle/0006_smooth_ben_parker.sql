CREATE TABLE `sync_clock` (
	`key` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `holiday_workout_entries` ADD `server_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_entries` ADD `server_revision` integer DEFAULT 0 NOT NULL;