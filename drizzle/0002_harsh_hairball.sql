CREATE TABLE `session_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week` integer NOT NULL,
	`day` text NOT NULL,
	`exercise_order` integer NOT NULL,
	`display_order` integer NOT NULL,
	`name` text NOT NULL,
	`target_sets` integer NOT NULL,
	`rep_range` text NOT NULL,
	`rest` text NOT NULL,
	`muscles` text NOT NULL,
	`alternative` text NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	`custom` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_exercise_week_day_order_idx` ON `session_exercises` (`week`,`day`,`exercise_order`);--> statement-breakpoint
ALTER TABLE `workout_entries` ADD `sync_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_entries` ADD `sheet_synced_at` text;--> statement-breakpoint
ALTER TABLE `workout_entries` ADD `sync_error` text;--> statement-breakpoint
PRAGMA optimize;
