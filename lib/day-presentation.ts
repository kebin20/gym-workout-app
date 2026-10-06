import type { TrainingDay } from './routine';

// Day identity is shared across Today, Plan and history. Completion stays green.
export const dayPresentation: Record<
  TrainingDay,
  { badge: string; ring: string }
> = {
  A: { badge: 'bg-blue-100 text-blue-700', ring: 'ring-blue-200' },
  B: { badge: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-200' },
  C: { badge: 'bg-violet-100 text-violet-700', ring: 'ring-violet-200' },
};
