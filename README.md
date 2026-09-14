# Liftline

Liftline is a mobile-friendly workout tracker for two progressive 12-week, three-day strength phases. It turns the original spreadsheet routine and its specialized follow-up programme into a clean, touch-first web app for logging weight, reps, RIR, notes, volume, and weekly progress.

Made with ChatGPT Codex

![Liftline workout tracker](public/og.png)

## Live app

The production app is hosted privately at [liftline-strength-plan.ktanzyl.chatgpt.site](https://liftline-strength-plan.ktanzyl.chatgpt.site). Access is restricted to the site owner.

Current app version: **v3.3.0**

## Features

- Two complete 12-week plans with Day A, B, and C workouts
- Locked Phase 2 transition after all 36 Phase 1 sessions are complete
- Specialized Phase 2 programming with chest/quad, back/posterior-chain, and shoulders/arms emphasis
- Phase-specific progress, workout history, guidance, and rotating training tips
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
- In-app animated movement guides with exercise-specific form cues and alternate movement choices
- A mobile-friendly nutrition guide with daily targets, meal templates, practical restaurant choices, and progress rules
- A separate tropical-themed Holiday mode with alternating A/B bodyweight sessions, rep-or-time logging, optional travel-equipment loads, exercise history, and completion recaps
- A dedicated `Holiday Log` Google Sheet tab that keeps travel training separate from the 12-week programme
- Responsive Material-inspired interface using Geist typography

## Version history

Minor fixes, visual refinements, and deployment maintenance are grouped into the nearest feature release so this history focuses on meaningful product changes.

### v3.3 — Holiday training mode (14 September 2026)

- Added a compact palm-tree Holiday control beside the phase menu without crowding the main navigation.
- Added two alternating 25–35 minute travel sessions based on the holiday maintenance guide, covering legs, pushing, pulling, shoulders, posterior chain, and core.
- Added a distinct teal, turquoise, and warm-sand visual theme so Holiday mode is immediately recognizable while retaining Liftline's interaction patterns.
- Added one-to-five-set logging with optional load, reps or timed seconds, RIR, notes, previous-session recall, and recent holiday history.
- Added a holiday-session completion recap plus guidance for recovery days and activity-heavy trips.
- Kept all Holiday mode records in a separate D1 table so Phase 1 and Phase 2 history, progress, and unlock state remain untouched.
- Added a separate `Holiday Log` tab and connector action for holiday records in the workout Google Sheet.

### v3.2 — Training tools and programme insights (8 September 2026)

- Added editable Phase 1 and Phase 2 start dates so weekly schedule labels can follow real training dates without changing recorded history.
- Added a quick readiness check using sleep, energy, soreness, and joint comfort, with conservative train-as-planned, modified-session, or recovery-day guidance.
- Added working-weight warm-up suggestions and a per-side plate calculator.
- Added persistent weight, waist, body-fat, and lean-mass tracking with manual, Withings, InBody, and CSV source labels plus CSV import.
- Added a compact, collapsed programme-insights panel for strength trends, muscle-group set distribution, hard-effort signals, and possible recovery concerns.
- Extended JSON backups to include programme dates, body measurements, and readiness checks while retaining compatibility with earlier backups.
- Added a clear workout-complete celebration and session recap when the final exercise of a day is logged.
- Made the completion recap continue automatically to the next training day, or to Day A of the next week after Day C.
- Simplified the mobile session editor to a compact settings icon while retaining its full label on larger screens.
- Stabilized the consolidated Phase menu, kept active-phase selections on the current week, and removed a notification-button hydration error that could show an error page.
- Kept the session editor and previous/next exercise controls on one compact row on mobile.
- Made exercise navigation circular so moving past the final exercise returns to the first, and moving back from the first returns to the final exercise.
- Made startup calendar-aware so Liftline opens on the programme week containing today and selects its first unfinished training day instead of resetting to Week 1 or retaining an old day.

### v3.1 — Faster startup and quieter navigation (8 September 2026)

- Made the installed app reopen from its cached interface immediately, then refresh safely in the background.
- Added incremental workout refreshes and a database index so returning visits transfer and query only records that changed.
- Deferred movement-guide code and media until a guide is opened, reducing the main workout bundle by roughly one third.
- Consolidated programme progress, phase selection, and the training guide into a compact header menu.
- Replaced the large connection-status panel with a concise online and saved indicator in the header.

### v3.0 — Phase 2 progression (7 September 2026)

- Added a compact phase selector that unlocks Phase 2 after all 36 Phase 1 sessions are complete.
- Added a second 12-week specialized full-body programme with chest/quad, back/posterior-chain, and shoulders/arms training days based on the Phase 2 guide.
- Kept Phase 1 and Phase 2 workout records, charts, history, personal records, session edits, tips, and guidance separate while preserving all existing data.
- Added Phase 2 double-progression, free-weight transition, fatigue, deload, and cardio guidance.
- Kept the legacy Google Sheet exchange scoped to Phase 1 because its original layout does not contain Phase 2 rows.

### v2.3 — Scannable exercise history (7 September 2026)

- Grouped each exercise’s records into expandable weekly categories.
- Alternated week colours so adjacent records are easier to distinguish.
- Kept the latest three weeks expanded while placing older records inside a collapsed Earlier weeks group.

### v2.2 — Nutrition guide (7 September 2026)

- Added Nutrition as a fourth primary destination on mobile and desktop.
- Adapted the personal dietary guide into quick daily targets, breakfast and two-meal templates, protein guidance, restaurant choices, progress checks, and example days.
- Used collapsible, responsive sections so the full guide remains easy to scan on a phone.

### v2.1 — In-app movement guides (7 September 2026)

- Replaced external YouTube searches with an in-app animated exercise demonstration modal.
- Added movement choices for combined exercises, such as Bulgarian split squats and hack squats.
- Added concise form cues, mobile-friendly scrolling, source attribution, and connection-error handling.

### v2.0 series — Offline-ready training and deeper insights (6 September 2026)

- Made workout logging instant and offline-safe, with automatic retry and clear device/Google Sheet sync status.
- Added personal-record detection, per-exercise progress charts, and detailed end-of-session summaries.
- Added one-tap previous-session values, automatic rest timing, and optional completion alerts.
- Made individual sessions flexible with exercise reordering, substitutions, skipping, custom exercises, and one-to-five-set controls.
- Added downloadable backups with preview-first, non-destructive restore.
- Improved installed-app reliability and cold-start speed so updates no longer leave an outdated, non-interactive screen.
- Unified the Liftline diagonal dumbbell icon and blue-to-indigo gradient across the app, added a softer rounded favicon, and refreshed the Safari and Chrome/PWA install assets.

### v1.5 — Workout history and flexible session tools (3–4 September 2026)

- Added previous-session dates, weights, reps, and RIR beside each active exercise.
- Added the responsive exercise-history grid, weekly volume overview, and rotating training tips.
- Added the rest timer and the ability to add or remove exercise sets.
- Ensured each new week opens with empty inputs while earlier workouts remain available for reference.
- Improved save responsiveness and corrected Google Sheet dates to use Liftline's Asia/Tokyo calendar day.

### v1.4 — Google Sheet exchange (2 September 2026)

- Added background sending from Liftline to the existing Google Sheet workout log.
- Added a separate import flow with a full preview and protection against overwriting newer Liftline records.

### v1.1 — Installable app and public demo (1–2 September 2026)

- Added home-screen installation, standalone display mode, and mobile icon support.
- Split the owner-only workout tracker from a read-only public sample.
- Added exercise video-search links and the first installed-app startup improvements.

### v1.0 — Initial release (1 September 2026)

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

## Release workflow

Production stays on `main`. New fixes and features are developed on `codex/staging`, where they are formatted, linted, built, and functionally checked. Only a completed staging batch is merged into `main` and deployed, keeping the live tracker available while work is in progress.

## Project structure

```text
app/
  api/workouts/route.ts  Workout history API
  api/workouts/sync-sheet/route.ts  Full Google Sheet backfill endpoint
  api/workouts/import-sheet/route.ts  Protected Google Sheet import preview and apply endpoint
  api/workouts/backup/route.ts  JSON backup and preview-first restore endpoint
  api/workouts/program/route.ts  Session-only programme customization endpoint
  api/settings/route.ts  Programme schedule settings
  api/readiness/route.ts  Recovery readiness records and guidance
  api/body-metrics/route.ts  Body measurements and CSV-import storage
  api/holiday-workouts/route.ts  Separate Holiday mode workout history API
  workout-app.tsx        Main responsive application interface
  holiday-workout.tsx    Holiday A/B workout logger and history
db/schema.ts             Drizzle schema
drizzle/                 Generated SQLite migrations
lib/routine.ts           Phase 1 and Phase 2 routine definitions
lib/exercise-demos.ts    Animated movement-guide mapping and form cues
public/                   Liftline icons and sharing artwork
```

## Exercise demonstrations

Exercise GIFs are loaded only when a movement guide is opened. They are provided by the MIT-licensed [Exercise Library](https://github.com/mohamedatef90/exercise-library), which is credited inside each guide. Liftline keeps the exercise-specific cue text locally and sends no workout data to the media host.

## Data behavior

Workout entries are keyed by internal programme week, day, and exercise. Phase 1 uses internal weeks 1–12 and Phase 2 uses 13–24 while each phase displays its own Week 1–12 sequence. Saving an exercise creates or updates that entry, so a session can be resumed without duplicating records. The dashboard derives completion, session totals, training volume, and progression suggestions from the saved entries.

Phase 2 remains locked until all three sessions in every Phase 1 week are complete. Unlocking it never resets or replaces Phase 1 data; the phase selector can be used to revisit the original history at any time.

If a workout is saved without a connection, Liftline keeps a temporary device queue and shows the workout immediately. The latest version of each queued exercise is sent to D1 automatically when the connection returns. The server rejects an older queued update when a newer version of the same exercise is already stored.

Each exercise can store between one and five sets. Removing a set clears that row from the saved record; adding it again starts with an empty row.

Holiday mode uses its own persistent `holiday_workout_entries` table. Each trip session receives a unique session ID, so any number of Holiday A/B sessions can be recorded without consuming a programme week or changing the current Phase 1/2 workout. Timed core movements store seconds in the same per-set value field used for repetitions and are labelled by metric in the interface and Sheet.

The initial Week 1 example entries mirror the source spreadsheet so the progress experience is visible immediately. New and updated entries are stored persistently in D1.

Session customizations are stored separately by week and day. Reordering, substituting, skipping, or adding an exercise changes only that selected session; the original 12-week routine remains available as the reset state.

## Google Sheet sync

Liftline can exchange completed Phase 1 entries with the existing `Workout Log` layout. Each normal Phase 1 save updates its matching Week/Day/Exercise row, and the Phase 1 Progress screen includes a **Send to Google Sheet** button for backfilling completed Liftline entries. Phase 2 stays in Liftline and its downloadable backups because the original Sheet has no Phase 2 rows. Holiday mode writes to the separate `Holiday Log` tab by session ID and exercise number.

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

The Apps Script reads completed programme rows and only writes Date, set weights/reps, RIR, Notes, and Logged status. It identifies programme rows by Week, Day, and Exercise number. Holiday entries are appended or updated in `Holiday Log` using Session ID and Exercise number, including their reps-or-seconds metric and optional loads. After updating an existing Apps Script deployment for v3.3, create a new deployment version so the `writeHoliday` action becomes available at the existing `/exec` URL.

Workout dates use Liftline's Asia/Tokyo calendar day rather than the Google Sheet's timezone. This prevents an evening workout recorded on September 4 in Liftline from appearing as September 3 in a Sheet configured for a western timezone.
