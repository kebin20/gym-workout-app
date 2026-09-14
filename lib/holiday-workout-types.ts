export type HolidaySessionType = 'A' | 'B';
export type HolidayMetric = 'reps' | 'seconds';

export type HolidayWorkoutEntry = {
  id?: number;
  sessionId: string;
  sessionDate: string;
  sessionType: HolidaySessionType;
  exerciseOrder: number;
  exercise: string;
  target: string;
  metric: HolidayMetric;
  set1Weight: number | null;
  set1Value: number | null;
  set2Weight: number | null;
  set2Value: number | null;
  set3Weight: number | null;
  set3Value: number | null;
  set4Weight: number | null;
  set4Value: number | null;
  set5Weight: number | null;
  set5Value: number | null;
  setCount: number;
  rir: number | null;
  notes: string;
  completed: boolean | number;
  completedAt: string | null;
  syncStatus?: 'pending' | 'synced' | 'failed';
  sheetSyncedAt?: string | null;
  syncError?: string | null;
  updatedAt: string;
};

export const holidayWorkoutSelectColumns = `id, session_id AS sessionId,
  session_date AS sessionDate, session_type AS sessionType,
  exercise_order AS exerciseOrder, exercise, target, metric,
  set1_weight AS set1Weight, set1_value AS set1Value,
  set2_weight AS set2Weight, set2_value AS set2Value,
  set3_weight AS set3Weight, set3_value AS set3Value,
  set4_weight AS set4Weight, set4_value AS set4Value,
  set5_weight AS set5Weight, set5_value AS set5Value,
  set_count AS setCount, rir, notes, completed,
  completed_at AS completedAt, sync_status AS syncStatus,
  sheet_synced_at AS sheetSyncedAt, sync_error AS syncError,
  updated_at AS updatedAt`;
