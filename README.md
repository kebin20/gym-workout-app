# Liftline

Liftline is a mobile-friendly workout tracker for a 12-week, three-day strength program. It turns the original spreadsheet routine into a clean, touch-first web app for logging weight, reps, RIR, notes, volume, and weekly progress.

![Liftline workout tracker](public/og.png)

## Live app

The production URL is [liftline-strength-plan.ktanzyl.chatgpt.site](https://liftline-strength-plan.ktanzyl.chatgpt.site). The home page is a public, read-only preview using sample data. The real tracker lives at `/workout` and is restricted to the configured owner account.

## Features

- Complete 12-week plan with Day A, B, and C workouts
- Large mobile-friendly controls for entering weight, reps, and RIR
- Per-set completion tracking and exercise notes
- Automatic volume totals and next-session progression guidance
- Weekly session progress, workout history, and progress charts
- Routine guide with targets, rest periods, muscle groups, and alternatives
- Persistent workout data backed by Cloudflare D1
- Public read-only preview with isolated sample data
- ChatGPT sign-in plus server-side owner checks for the private tracker and API
- Responsive Material-inspired interface using Geist typography

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

Open [http://localhost:3000](http://localhost:3000). The local development environment uses the configured `DB` D1 binding and initializes the `workout_entries` table automatically on first use.

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
  api/workouts/route.ts  Workout history API and D1 initialization
  workout-app.tsx        Main responsive application interface
db/schema.ts             Drizzle schema
drizzle/                 Generated SQLite migrations
lib/routine.ts           12-week routine and exercise definitions
public/                   Liftline icons and sharing artwork
```

## Data behavior

Workout entries are keyed by week, day, and exercise. Saving an exercise creates or updates that entry, so a session can be resumed without duplicating records. The dashboard derives completion, session totals, training volume, and progression suggestions from the saved entries.

All `/api/workouts` reads and writes require the authenticated Sites user ID to match the `LIFTLINE_OWNER_USER_ID` production environment value. The public preview never requests the workout API and cannot read or modify the D1 records.

The initial Week 1 example entries mirror the source spreadsheet so the progress experience is visible immediately. New and updated entries are stored persistently in D1.
