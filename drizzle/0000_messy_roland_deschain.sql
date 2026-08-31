CREATE TABLE `workout_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week` integer NOT NULL,
	`day` text NOT NULL,
	`exercise_order` integer NOT NULL,
	`exercise` text NOT NULL,
	`target` text NOT NULL,
	`set1_weight` real,
	`set1_reps` real,
	`set2_weight` real,
	`set2_reps` real,
	`set3_weight` real,
	`set3_reps` real,
	`rir` integer,
	`notes` text,
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_entry_session_exercise_idx` ON `workout_entries` (`week`,`day`,`exercise_order`);