import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const workoutEntries = sqliteTable(
  'workout_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    week: integer('week').notNull(),
    day: text('day').notNull(),
    exerciseOrder: integer('exercise_order').notNull(),
    exercise: text('exercise').notNull(),
    target: text('target').notNull(),
    set1Weight: real('set1_weight'),
    set1Reps: real('set1_reps'),
    set2Weight: real('set2_weight'),
    set2Reps: real('set2_reps'),
    set3Weight: real('set3_weight'),
    set3Reps: real('set3_reps'),
    set4Weight: real('set4_weight'),
    set4Reps: real('set4_reps'),
    set5Weight: real('set5_weight'),
    set5Reps: real('set5_reps'),
    setCount: integer('set_count'),
    rir: integer('rir'),
    notes: text('notes'),
    completed: integer('completed', { mode: 'boolean' })
      .notNull()
      .default(false),
    completedAt: text('completed_at'),
    syncStatus: text('sync_status').notNull().default('pending'),
    sheetSyncedAt: text('sheet_synced_at'),
    syncError: text('sync_error'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('workout_entry_session_exercise_idx').on(
      table.week,
      table.day,
      table.exerciseOrder,
    ),
  ],
);

export const sessionExercises = sqliteTable(
  'session_exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    week: integer('week').notNull(),
    day: text('day').notNull(),
    exerciseOrder: integer('exercise_order').notNull(),
    displayOrder: integer('display_order').notNull(),
    name: text('name').notNull(),
    targetSets: integer('target_sets').notNull(),
    repRange: text('rep_range').notNull(),
    rest: text('rest').notNull(),
    muscles: text('muscles').notNull(),
    alternative: text('alternative').notNull(),
    skipped: integer('skipped', { mode: 'boolean' }).notNull().default(false),
    custom: integer('custom', { mode: 'boolean' }).notNull().default(false),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('session_exercise_week_day_order_idx').on(
      table.week,
      table.day,
      table.exerciseOrder,
    ),
  ],
);
