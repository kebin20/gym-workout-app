# Programme continuation and recovery — v3.15.0

Progress → Data contains full JSON backup/restore plus **Export device recovery** and **Programme history & restart**.

Download a full backup and sync queued saves on every device before explicitly confirming **Archive & start new programme**. This single transaction snapshots every main-workout field, session customization and programme date into an immutable archive, then starts Phase 1, Week 1 with a new programme ID and chosen date. Holiday logs and health records remain in place. Deployment and reaching Week 24 never trigger this action automatically.

Archives are read-only, with sets, per-set and legacy RIR, notes and dates. Day A/B/C PDFs use each archive's history and trends. Individual archive JSON downloads can be added with Restore backup without replacing active logs. Complete version-4 backups include archives, active records and shared data; versions 2 and 3 remain supported for the original programme. A backup belonging to an unrelated active cycle is rejected rather than merged accidentally.

The Google Sheet remains the original programme's secondary record, not a full backup of extra sets, per-set RIR, custom exercises or Phase 2. Later programmes intentionally do not overwrite its rows; use JSON backups and PDFs instead.

## Safety

- Original draft keys remain compatible; new programmes namespace their drafts and queued records. Old-client and old-programme saves are rejected before they can overwrite another cycle. A stale device may briefly display its cached old interface until refresh; its queued records remain recoverable.
- Restore and restart refuse queued saves, the current dirty draft and in-flight saves in the UI. Other devices must be synced separately; the app cannot prove their queues are empty.
- Device recovery exports only raw Liftline outbox/draft strings, including malformed records. It excludes cookies, tokens and unrelated storage, and changes nothing. Keep it private. It is not a database backup or blindly imported restore file; reviewed recovery avoids replacing newer data.
- Arbitrary 1,000-health/5,000-Holiday-row restore caps are removed. JSON-backed bounded statements restore larger datasets in one D1 transaction, so failure does not partially import chunks. Export preflights the same record budgets. Files retain an explicit 8 MB and atomic-query safety budget; oversized exports fail visibly, and individual archives are available separately. This is not an unlimited-scale claim.
- Restored Phase 2 and later-programme records stay `not_applicable` for Sheet sync. Programme identity checks prevent accidental cross-cycle restore and stale in-flight writes.

## Analytics and loading

PRs compare only earlier weeks of the same phase/day/slot and actual exercise identity, retaining the intentional Leg Extension alias. Substitutions and future weeks cannot distort the comparison. Charts and previous-session recall also separate substitutions. Effort insights use recorded working-set RIR, including zero, with legacy exercise RIR as a fallback only when no set effort exists. No values are copied or invented.

Programme insights and the programme manager mount only when opened. This improves optional Progress loading, not a claimed iPhone cold-launch time. More extensive history storage changes remain profiling-led.

## Verification and rollback

Run TypeScript, `npm run build`, then `npm run test:regression`; the GitHub workflow runs these on PRs and main. Synthetic SQLite tests cover growing backups, transaction rollback, immutable archives, stale saves, fresh-install restore, separate-archive import, device recovery, PR/effort correctness and draft isolation. Tests never use real workout records.

Real iPhone cold launches, offline reopen and lock-screen alerts still require device verification. iOS suspension behavior is unchanged.

The schema-only migration adds `programme_archives`; it does not alter or clear active data. After starting another programme, do not roll back to pre-v3.15.0 code without reviewing cycle identity: older clients do not understand it. Export a current full backup and individual archives first. A compatible forward fix is safer than resetting storage.
