CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `body_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`weight` real,
	`waist` real,
	`body_fat` real,
	`lean_mass` real,
	`source` text DEFAULT 'manual' NOT NULL,
	`notes` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_metric_date_source_idx` ON `body_metrics` (`date`,`source`);--> statement-breakpoint
CREATE INDEX `body_metric_date_idx` ON `body_metrics` (`date`);--> statement-breakpoint
CREATE TABLE `readiness_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`checked_at` text NOT NULL,
	`week` integer NOT NULL,
	`day` text NOT NULL,
	`sleep` integer NOT NULL,
	`energy` integer NOT NULL,
	`soreness` integer NOT NULL,
	`joint_comfort` integer NOT NULL,
	`recommendation` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `readiness_checked_at_idx` ON `readiness_checks` (`checked_at`);--> statement-breakpoint
PRAGMA optimize;
