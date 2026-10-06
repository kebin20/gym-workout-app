CREATE INDEX `holiday_workout_server_revision_idx` ON `holiday_workout_entries` (`server_revision`);--> statement-breakpoint
CREATE INDEX `workout_entry_server_revision_idx` ON `workout_entries` (`server_revision`);
--> statement-breakpoint
CREATE TRIGGER workout_entries_revision_insert AFTER INSERT ON workout_entries
BEGIN
  INSERT INTO sync_clock (key, value) VALUES ('records', 1)
  ON CONFLICT(key) DO UPDATE SET value = value + 1;
  UPDATE workout_entries SET server_revision = (SELECT value FROM sync_clock WHERE key = 'records') WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER workout_entries_revision_update AFTER UPDATE ON workout_entries
WHEN NEW.server_revision = OLD.server_revision
BEGIN
  INSERT INTO sync_clock (key, value) VALUES ('records', 1)
  ON CONFLICT(key) DO UPDATE SET value = value + 1;
  UPDATE workout_entries SET server_revision = (SELECT value FROM sync_clock WHERE key = 'records') WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER holiday_workout_entries_revision_insert AFTER INSERT ON holiday_workout_entries
BEGIN
  INSERT INTO sync_clock (key, value) VALUES ('records', 1)
  ON CONFLICT(key) DO UPDATE SET value = value + 1;
  UPDATE holiday_workout_entries SET server_revision = (SELECT value FROM sync_clock WHERE key = 'records') WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER holiday_workout_entries_revision_update AFTER UPDATE ON holiday_workout_entries
WHEN NEW.server_revision = OLD.server_revision
BEGIN
  INSERT INTO sync_clock (key, value) VALUES ('records', 1)
  ON CONFLICT(key) DO UPDATE SET value = value + 1;
  UPDATE holiday_workout_entries SET server_revision = (SELECT value FROM sync_clock WHERE key = 'records') WHERE id = NEW.id;
END;
