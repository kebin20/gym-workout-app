# Per-set RIR — v3.14.0

The main workout logger records optional RIR for each of its one to five sets. Blank means unrecorded, not zero. Values must be whole numbers from 0 to 10. Mobile uses a compact labeled field below the weight/reps controls; desktop aligns it in a third column. RIR does not mark a set complete or start a rest timer.

The additive migration `0008_pretty_epoch.sql` adds five nullable integers to `workout_entries`. No old data is modified. Historical exercise-level `rir` stays separately labeled; it is never guessed or copied into each set. Existing drafts gain blank per-set fields without discarding their other inputs. Recall copies load/reps but resets effort for the new session.

Per-set values travel through optimistic/offline saves, API responses/delta sync, history, previous-session summaries, backup/restore, undo and the complete-session section of the PDF. Volume calculations are unchanged. Progression uses the highest RIR only when every working set has an effort value; incomplete per-set effort asks for more input, rather than guessing. Legacy-only drafts retain the previous aggregate-based guidance.

Older clients and Google Sheet connectors that omit per-set fields cannot erase existing per-set RIR on a save/import. Explicit null from a capable client clears a value. The existing deployed Google Apps Script supports exercise-level RIR only; per-set values remain in Liftline's database, backups and PDFs, not that older spreadsheet format. Holiday logging retains its existing exercise-level RIR.

Checks:

```sh
npx tsc --noEmit --incremental false
npm run build
node --test scripts/test-set-rir.mjs scripts/test-workout-reliability.mjs scripts/test-day-report-alerts.mjs scripts/test-rest-alert-reliability.mjs scripts/test-startup-cache.mjs
```

Reverting UI/server code does not require dropping the new columns. Keep applied migration files and metadata immutable; retain the new columns to preserve per-set records.
