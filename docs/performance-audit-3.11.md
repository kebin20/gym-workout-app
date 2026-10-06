# Liftline 3.11 performance and reliability verification

Baseline: v3.10.0, commit `92702338dc74e03ce8c6a73cd2c4ab26e6344e87`.

## Changes verified

- Input state is owned by `ExerciseDraftBoundary`; only dirty/persisted status changes notify the dashboard. Timer ticks remain isolated.
- Existing draft edits write one keyed payload, not the entire draft collection. Legacy drafts migrate without overwriting existing keyed drafts.
- Progress, its history carousel, charts, and insights load on demand. Holiday history loads 20 sessions per page with an active-session exception and subsequent revision-based refreshes.
- Server revision triggers cover inserts, record edits, restore, and Sheet status updates. The tests execute all actual Drizzle migrations in SQLite and exercise the real API handlers with a D1-compatible fixture.

## Reproducible draft benchmark

Run `node scripts/measure-draft-performance.mjs` with Node 22.13+ and the baseline Git history available. This uses 32 synthetic drafts and 1,000 edits, never user browser data.

Observed locally: baseline wrote 10,986,890 bytes; the keyed implementation wrote 317,890 bytes (about 97% less). Both persist all 1,000 edits immediately. A sample CPU run was 413 ms versus 5.6 ms; these are synthetic timings, not iPhone INP or real localStorage latency guarantees.

The audit baseline main-screen client chunk was 33,355 bytes gzipped. The first production verification build after splitting Progress was 21,519 bytes gzipped (about 35% smaller). This compares the main chunk, not the complete initial download; shared framework code and other assets are excluded, and optional chunks still download when opened.

## Limitations

Local browser navigation timed out, so this batch has not completed visual mobile/desktop QA or physical iPhone testing. Production compilation, TypeScript checks, migration/API regression tests, and the unchanged v9 brand-asset checks are verified separately. Background notifications remain browser-controlled and best-effort, not a guaranteed iOS alarm.
