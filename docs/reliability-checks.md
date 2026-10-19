# Reliability checks — v3.18

Automated regressions use synthetic records and an in-memory database. They do
not write to the production app or Google Sheet. Run the production build before
`npm run test:regression`; the startup tests inspect that build's asset graph.

Covered scenarios include stale-tab saves, concurrent creation/update/deletion,
exact retry after a lost response, queued legacy input, dirty-draft refresh and
reopening, delayed acknowledgement, resume/reconnect coalescing, cache feedback,
Tokyo midnight dates, PDF labels, and Holiday session identity.

Lifecycle reads wait while a draft is dirty or a protected save/data operation
is active; a pending read resumes once safe. This prevents a remote session-plan
rename/reorder from switching the selected exercise underneath live inputs.
Normal-save conflict checks still protect input submitted before that refresh.

## Physical iPhone checks

Use a disposable local/test environment with synthetic records for save and
restore checks. Do not clear storage containing real drafts or pending workouts.

1. Open the Home Screen app, enter a draft, switch away and return. Verify the
   exact inputs, selected exercise and running timer remain unchanged.
2. Correct the same synthetic saved workout from another tab/device. Resume
   the first copy and attempt its old save. It must refuse the overwrite and
   retain the inputs. Review saved versus local values before explicitly saving.
3. Save while offline, reopen and reconnect. Verify the queue stays recoverable,
   an exact confirmed retry does not duplicate a workout, and conflicting input
   needs explicit review. Check blocked-queue review after reopening too.
4. Interrupt a background refresh. Cached logging should remain usable with a
   clear refresh warning; a successful retry should clear that warning.
5. Compare an after-midnight Tokyo workout date in Today, Progress, PDF and
   the Sheet. Reopen a synthetic Holiday session before saving any exercise;
   its session identity/date must not reset.
6. Export a synthetic full backup and restore it into a disposable test database;
   compare workouts, extra sets, RIR, notes, programme archives and Holiday data.

Browser simulation cannot establish iOS process cold-start timings, lock-screen
alert delivery or Apple Watch behaviour. Those require physical-device checks.
