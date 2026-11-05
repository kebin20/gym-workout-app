# Cloudflare migration

Liftline is being prepared for a separate Cloudflare Workers deployment on the
`codex/cloudflare-migration` branch. The existing private OpenAI Site remains
the production app. Nothing in this branch changes or deploys that Site.

## Current migration work

- The regular Vite build still loads the OpenAI Sites plugin and uses the
  existing host configuration.
- `npm run build:cloudflare` selects a separate Cloudflare build target and
  omits the Sites plugin.
- The target is fixed to the separate `liftline-cloudflare-preview` Worker and
  D1 database. The generated config enables its public `workers.dev` URL and
  keeps per-version preview URLs disabled.
- The manual GitHub Actions workflow builds the Worker, checks the target,
  applies the existing Drizzle migrations to the preview D1 database, then
  deploys a version to that preview Worker. It never targets `main` or a
  production Worker.

## Preview setup

The separate D1 database `liftline-cloudflare-preview` has been created in
APAC. The public preview Worker is deployed at
<https://liftline-cloudflare-preview.kaikei-app.workers.dev>. Its `workers.dev`
URL is public and has no app sign-in. The old private Site remains production.

All ten Drizzle migrations have been applied to the preview database. The
read-only workout API responds, and the new database currently contains no
saved workout entries or session customizations. No production data has been
copied.

To use the manual GitHub Actions workflow later, configure an environment named
`cloudflare-preview` with these values:

- Variable `CLOUDFLARE_ACCOUNT_ID`
- Variable `LIFTLINE_CLOUDFLARE_D1_DATABASE_ID` for the preview database
- Secret `CLOUDFLARE_API_TOKEN`, scoped to this Worker and D1 database

The preview's `workers.dev` URL is public by design. Do not store sensitive
personal information in this public preview. The workflow is manual only; it
has not been run from GitHub.

Google Sheets sync is not configured on this Worker yet. Set the integration
values as Worker secrets to enable it:

- `GOOGLE_SHEETS_WEBHOOK_URL`
- `GOOGLE_SHEETS_SYNC_TOKEN`

Do not put secret values in the repository or GitHub workflow logs.

## Copying existing workout data

The Site-managed D1 database is not configured as a database in the user's
Cloudflare account, so the preview deployment must not try to bind to or export
that database directly. Before switching the installed app, sync any queued
offline workouts and download a fresh JSON backup in Liftline. After the
Cloudflare preview is protected and reachable, use its normal backup restore
flow to import that file. The backup includes server-saved workout, programme,
readiness, and body-metric records; device-only unsynced drafts need to sync
before exporting.

The Cloudflare URL will have a different origin. Install that URL separately on
iOS after the private preview is available. Keep the current Site available
until saved records, Google Sheets sync, backups, and the workout flows have
been checked on Cloudflare.

## Current boundary

The public preview is deployed separately from production. The production Site
has not changed. The remaining migration work is to restore the saved workout
backup, configure Google Sheets secrets, verify those flows, and then decide
whether to cut over the home-screen app to this Worker.
