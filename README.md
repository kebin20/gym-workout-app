# Liftline Demo

This branch contains the public, sample-only version of Liftline: a mobile-friendly interface for exploring a 12-week, three-day strength program without exposing or changing the owner’s workout history.

Made with ChatGPT COdex

![Liftline workout tracker](public/og.png)

## Demo behavior

The demo is a fully static site. It ships with fictional Week 1 sample entries, makes no API requests, has no database binding, and does not persist values entered by visitors. The private tracker is maintained and deployed separately from the `main` branch.

## Features

- Complete 12-week plan with Day A, B, and C workouts
- Large mobile-friendly controls for entering weight, reps, and RIR
- Per-set completion tracking and exercise notes
- Automatic volume totals and next-session progression guidance
- Weekly session progress, workout history, and progress charts
- Routine guide with targets, rest periods, muscle groups, and alternatives
- Isolated sample workout data for two completed sessions
- Preview-only input controls with no persistence
- Responsive Material-inspired interface using Geist typography

## Technology

- React 19 and TypeScript
- vinext and Vite
- Tailwind CSS and shadcn components
- Recharts for progress visualizations
- Static export hosted with OpenAI Sites

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No database or account configuration is required.

## Useful commands

```bash
npm run dev          # Start the development server
npm run build        # Create the static production build
npm run lint         # Run oxlint
npm run format       # Format the project with oxfmt
```

## Project structure

```text
app/
  workout-app.tsx        Responsive sample application interface
lib/routine.ts           12-week routine and exercise definitions
public/                   Liftline icons and sharing artwork
```

## Data isolation

The sample entries are bundled in the browser code solely to demonstrate the progress experience. The demo has no route that can access the private tracker, and the preview button only explains that changes are not saved.
