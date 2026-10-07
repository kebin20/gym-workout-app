# v3.13.1 rollback points

Captured on 7 October 2026 before merging the cached-startup and guarded Capacitor foundation release.

## Source backup

- GitHub branch: [`codex/backup-main-before-capacitor-2026-10-07`](https://github.com/kebin20/gym-workout-app/tree/codex/backup-main-before-capacitor-2026-10-07).
- Exact pre-release `main` commit: `687f87e61d736c51b21dbafea00f44c65c5ee596` (v3.13.0).
- Preserve this branch. It is a source backup, not a backup of workout records.

For a source rollback, create a new branch from current `main`, revert the merge commit of PR #20 with `git revert -m 1 <merge-commit>`, test, and merge a rollback PR. Do not reset or force-push `main`. The backup branch also provides the exact original source for comparison or recovery.

## Hosted deployment rollback

The prior owner-private production deployment was verified as successful before release:

- Site project: `appgprj_6a960f4cd8e48191a0f0921debad3bbe`.
- Saved Site version 80: `appgprj_6a960f4cd8e48191a0f0921debad3bbe~appgver_00ec9e60f8e8819186769ffce8b924f2`.
- Deployment: `appgdep_6ac4cd270d048191b95326e4a1faac61`.
- Pushed source: `fec5e02bfda41acd13a595c37a8a425ce18b3b1c`.
- Runtime environment revision: 4.

For an immediate hosting rollback, redeploy that already-saved version using the Sites private-version deployment operation and verify its terminal deployment status. Preserve owner-only access and the existing runtime configuration. Align GitHub with the rollback afterward using the non-destructive revert workflow above.

This release does not migrate or reset the workout database. Rolling back code must not restore older workout data over newer sessions. Existing device-local drafts/outbox entries must also be preserved; do not clear browser storage as a routine rollback step.
