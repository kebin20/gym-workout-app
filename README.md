# Liftline

Liftline is a mobile-friendly workout tracker for a 12-week, three-day strength program. It turns the original spreadsheet routine into a clean, touch-first web app for logging weight, reps, RIR, notes, volume, and weekly progress.

Made with ChatGPT Codex

![Liftline workout tracker](public/og.png)

## Live app

The production app is hosted privately at [liftline-strength-plan.ktanzyl.chatgpt.site](https://liftline-strength-plan.ktanzyl.chatgpt.site). Access is restricted to the site owner.

## Features

- Complete 12-week plan with Day A, B, and C workouts
- Large mobile-friendly controls for entering weight, reps, and RIR
- Per-exercise set controls supporting one to five saved sets
- Exercise-aware rest timer with pause, resume, reset, and completion vibration where supported
- Automatic rest-timer start when a set is marked complete, with optional background notifications
- Per-set completion tracking and exercise notes
- Automatic volume totals and next-session progression guidance
- Personal-record detection for weight, reps, volume, and estimated strength
- Weekly session progress plus selectable per-exercise progress charts
- End-of-session summaries with volume, set count, duration, comparisons, and personal records
- Responsive day-by-day exercise history carousel and grid with dates, sets, RIR, and notes
- Automatically rotating training tips covering form, progression, rest, and recovery
- Routine guide with targets, rest periods, muscle groups, and alternatives
- Persistent workout data backed by Cloudflare D1
- Offline-safe workout logging with automatic retry when the connection returns
- Visible device-save and Google Sheet sync status with manual retry controls
- Review-first import from and automatic mirroring to the original Google Sheet layout
- Fast database-first saves with Google Sheet mirroring completed in the background
- Previous-session recall beside each exercise, including the logged date, weights, reps, and RIR
- Optional one-tap copying of previous-session weights and reps
- Fresh weight and rep inputs for each new week, without copying the previous workout into the new record
- Session-only exercise substitution, reordering, skipping, and custom exercise additions
- Downloadable JSON backups with preview-first, non-destructive restore
- Fast installed-app startup with a cached interface and immediate device-local display of the latest synced workouts
- Responsive Material-inspired interface using Geist typography

## Version history

### v2.0.2 — Unified Liftline identity (6 September 2026)

- Standardized the diagonal dumbbell mark across the in-app logo, favicon, Safari home-screen icon, and Chrome/PWA icons.
- Added a subtle blue-to-indigo gradient while retaining the original Liftline visual identity.
- Moved install-icon delivery to a public, cross-origin-safe source so private-site authentication does not prevent iOS Chrome from retrieving the artwork.

### v2.0.1 — Installed-app reliability (6 September 2026)

- Changed page navigation to network-first with an offline fallback, preventing an old app shell from requesting JavaScript files removed by a newer deployment.
- Retained recent versioned assets during upgrades and enabled navigation preloading for faster cold launches.
- Preserved all existing D1 workout records during the update.

### v2.0.0 — Offline training and workout insights (6 September 2026)

- Added offline-safe, optimistic workout saving with automatic retry and visible device/Google Sheet sync status.
- Added personal-record detection, per-exercise progress charts, and completed-session summaries.
- Added one-tap previous-session values and automatic exercise-aware rest timing with optional alerts.
- Added session-specific reordering, substitutions, skipping, custom exercises, and one-to-five-set controls.
- Added downloadable JSON backups and preview-first, non-destructive restore.

### v1.6.0 — Flexible sets and timing (4 September 2026)

- Added the rest timer and controls for adding or removing exercise sets.
- Improved save responsiveness by moving Google Sheet mirroring into the background.
- Corrected Google Sheet dates to use Liftline's Asia/Tokyo calendar day.

### v1.5.0 — History and progression (3 September 2026)

- Added previous-session values and dates beside the active exercise.
- Added the responsive exercise-history grid, weekly volume overview, and rotating training tips.
- Ensured new weeks start with empty weight and rep inputs while retaining earlier workouts for reference.
- Improved the installed-app startup cache.

### v1.4.0 — Google Sheet exchange (2 September 2026)

- Added background sending to the existing Google Sheet workout log.
- Added a separate import flow with a complete preview and protection for newer Liftline records.

### v1.3.0 — Mobile installation and public demo (1–2 September 2026)

- Added the Liftline home-screen name, install manifest, Safari/Chrome icons, and standalone display mode.
- Split the owner-only tracker from a read-only public sample and added exercise video-search links.

### v1.0.0 — Initial release (1 September 2026)

- Converted the 12-week, three-day spreadsheet routine into a responsive React workout tracker.
- Added weight, rep, RIR, notes, completion, weekly progress, and D1-backed persistence.

## Technology

- React 19 and TypeScript
- vinext and Vite
- Tailwind CSS and shadcn components
- Recharts for progress visualizations
- Drizzle ORM with Cloudflare D1/SQLite
- OpenAI Sites hosting on Cloudflare Workers

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The local development environment uses the configured `DB` D1 binding and applies the generated migrations.

## Useful commands

```bash
npm run dev          # Start the development server
npm run build        # Create a production build
npm run start        # Run the built Worker locally with Wrangler
npm run lint         # Run oxlint
npm run format       # Format the project with oxfmt
npm run db:generate  # Generate a Drizzle migration after schema changes
```

## Project structure

```text
app/
  api/workouts/route.ts  Workout history API
  api/workouts/sync-sheet/route.ts  Full Google Sheet backfill endpoint
  api/workouts/import-sheet/route.ts  Protected Google Sheet import preview and apply endpoint
  api/workouts/backup/route.ts  JSON backup and preview-first restore endpoint
  api/workouts/program/route.ts  Session-only programme customization endpoint
  workout-app.tsx        Main responsive application interface
db/schema.ts             Drizzle schema
drizzle/                 Generated SQLite migrations
lib/routine.ts           12-week routine and exercise definitions
public/                   Liftline icons and sharing artwork
```

## Data behavior

Workout entries are keyed by week, day, and exercise. Saving an exercise creates or updates that entry, so a session can be resumed without duplicating records. The dashboard derives completion, session totals, training volume, and progression suggestions from the saved entries.

If a workout is saved without a connection, Liftline keeps a temporary device queue and shows the workout immediately. The latest version of each queued exercise is sent to D1 automatically when the connection returns. The server rejects an older queued update when a newer version of the same exercise is already stored.

Each exercise can store between one and five sets. Removing a set clears that row from the saved record; adding it again starts with an empty row.

The initial Week 1 example entries mirror the source spreadsheet so the progress experience is visible immediately. New and updated entries are stored persistently in D1.

Session customizations are stored separately by week and day. Reordering, substituting, skipping, or adding an exercise changes only that selected session; the original 12-week routine remains available as the reset state.

## Google Sheet sync

Liftline can exchange completed entries with the existing `Workout Log` layout. Each normal save updates its matching Week/Day/Exercise row, and the Progress screen includes a **Send to Google Sheet** button for backfilling all completed Liftline entries.

Normal saves return as soon as Liftline's database has stored the workout, while Google Sheet mirroring continues in the background. Because the existing sheet layout contains three set pairs, sets 4–5 remain stored and visible in Liftline while the first three sets are mirrored to Google Sheets.

Custom exercises have no matching row in the original spreadsheet, so they remain fully tracked in Liftline and its JSON backups but are intentionally excluded from Google Sheet sends.

The separate **Import from Google Sheet** action always shows a preview first. New rows are selected automatically. When the same Week/Day/Exercise already exists in Liftline with different values, it is protected and stays unselected unless the owner explicitly chooses to replace it. The server reads the Sheet again when the import is confirmed, so a record created in Liftline after the preview is also protected.

The linked workbook is currently an Excel `.xlsm` file in Google Drive. Google requires an Office file to be converted before Apps Script can be attached. Use **File → Save as Google Sheets**; Google creates a separate native copy and leaves the `.xlsm` original unchanged.

1. Open the native Google Sheet copy and choose **Extensions → Apps Script**.
2. Paste `integrations/google-apps-script/Code.gs` into the script editor.
3. Replace `replace-with-a-long-random-token` with a long random token.
4. Choose **Deploy → New deployment → Web app**, run it as yourself, and allow anyone to invoke it. The token is still required for every write.
5. Configure the private Liftline Site with these production secrets and deploy again:

   - `GOOGLE_SHEETS_WEBHOOK_URL`: the Apps Script `/exec` URL
   - `GOOGLE_SHEETS_SYNC_TOKEN`: the same random token

The Apps Script reads completed rows and only writes Date, set weights/reps, RIR, Notes, and Logged status. It identifies rows by Week, Day, and Exercise number, preserving the workbook's existing formulas and formatting.

Workout dates use Liftline's Asia/Tokyo calendar day rather than the Google Sheet's timezone. This prevents an evening workout recorded on September 4 in Liftline from appearing as September 3 in a Sheet configured for a western timezone.
