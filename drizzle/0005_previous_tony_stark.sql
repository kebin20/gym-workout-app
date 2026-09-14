CREATE TABLE `holiday_workout_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`session_date` text NOT NULL,
	`session_type` text NOT NULL,
	`exercise_order` integer NOT NULL,
	`exercise` text NOT NULL,
	`target` text NOT NULL,
	`metric` text NOT NULL,
	`set1_weight` real,
	`set1_value` real,
	`set2_weight` real,
	`set2_value` real,
	`set3_weight` real,
	`set3_value` real,
	`set4_weight` real,
	`set4_value` real,
	`set5_weight` real,
	`set5_value` real,
	`set_count` integer NOT NULL,
	`rir` integer,
	`notes` text,
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`sheet_synced_at` text,
	`sync_error` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holiday_workout_session_exercise_idx` ON `holiday_workout_entries` (`session_id`,`exercise_order`);--> statement-breakpoint
CREATE INDEX `holiday_workout_date_idx` ON `holiday_workout_entries` (`session_date`);