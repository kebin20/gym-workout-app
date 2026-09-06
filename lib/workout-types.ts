import type { TrainingDay } from '@/lib/routine';

export type SyncStatus = 'pending' | 'synced' | 'failed' | 'not_applicable';

export type WorkoutEntry = {
  id?: number;
  week: number;
  day: TrainingDay;
  exerciseOrder: number;
  exercise: string;
  target: string;
  set1Weight: number | null;
  set1Reps: number | null;
  set2Weight: number | null;
  set2Reps: number | null;
  set3Weight: number | null;
  set3Reps: number | null;
  set4Weight?: number | null;
  set4Reps?: number | null;
  set5Weight?: number | null;
  set5Reps?: number | null;
  setCount?: number | null;
  rir: number | null;
  notes: string;
  completed: boolean | number;
  completedAt?: string | null;
  syncStatus?: SyncStatus;
  sheetSyncedAt?: string | null;
  syncError?: string | null;
  updatedAt?: string;
  offlinePending?: boolean;
};

export type SessionExercise = {
  id?: number;
  week: number;
  day: TrainingDay;
  exerciseOrder: number;
  displayOrder: number;
  name: string;
  targetSets: number;
  repRange: string;
  rest: string;
  muscles: string;
  alternative: string;
  skipped: boolean | number;
  custom: boolean | number;
  updatedAt?: string;
};

export const workoutSelectColumns = `id, week, day, exercise_order AS exerciseOrder, exercise, target,
  set1_weight AS set1Weight, set1_reps AS set1Reps, set2_weight AS set2Weight,
  set2_reps AS set2Reps, set3_weight AS set3Weight, set3_reps AS set3Reps,
  set4_weight AS set4Weight, set4_reps AS set4Reps, set5_weight AS set5Weight,
  set5_reps AS set5Reps, set_count AS setCount,
  rir, notes, completed, completed_at AS completedAt, sync_status AS syncStatus,
  sheet_synced_at AS sheetSyncedAt, sync_error AS syncError, updated_at AS updatedAt`;

export const sessionExerciseSelectColumns = `id, week, day, exercise_order AS exerciseOrder,
  display_order AS displayOrder, name, target_sets AS targetSets, rep_range AS repRange,
  rest, muscles, alternative, skipped, custom, updated_at AS updatedAt`;
