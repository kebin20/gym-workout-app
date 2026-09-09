import { WorkoutApp } from './workout-app';

// The initial document is an app shell; workout data is loaded client-side.
// Cache the shell at the edge so opening Liftline does not require a fresh
// server render on every visit.
export const dynamic = 'force-static';
export const revalidate = 3600;

export default function HomePage() {
  return <WorkoutApp />;
}
