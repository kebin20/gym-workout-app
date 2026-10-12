import {
  workoutSelectColumns,
  sessionExerciseSelectColumns,
} from './workout-types';

export const initialProgrammeId = 'initial';
export const programmeGuardSql =
  "COALESCE((SELECT value FROM app_settings WHERE key='programmeId'),'initial') = ?";
export async function activeProgrammeId(db: D1Database) {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE key='programmeId'")
    .first<{ value: string }>();
  return row?.value ?? initialProgrammeId;
}
export function programmeMatches(value: unknown, active: string) {
  return (value ?? initialProgrammeId) === active;
}
function jsonRows(table: string, columns: string) {
  const fields = columns.split(',').map((field) => {
    const [column, alias] = field.trim().split(/\s+AS\s+/i);
    return { column, name: alias ?? column };
  });
  // D1 SQL functions accept at most 32 arguments. Each json_object field
  // consumes two, so merge bounded objects rather than passing 62 at once.
  let object = `json_object(${fields
    .slice(0, 16)
    .map((field) => `'${field.name}',${field.column}`)
    .join(',')})`;
  // json_set retains nulls and leaves room for 15 pairs plus the base object.
  for (let i = 16; i < fields.length; i += 15)
    object = `json_set(${object},${fields
      .slice(i, i + 15)
      .map((field) => `'$.${field.name}',${field.column}`)
      .join(',')})`;
  return `json(COALESCE((SELECT json_group_array(${object}) FROM ${table}),'[]'))`;
}
export const programmeSnapshotSql = `json_object('version',3,'programmeId',?,'sourceProgrammeId',?,
  'entries',${jsonRows('workout_entries', workoutSelectColumns)},
  'sessionExercises',${jsonRows('session_exercises', sessionExerciseSelectColumns)},
  'settings',json(COALESCE((SELECT json_group_object(key,value) FROM app_settings WHERE key IN ('phase1StartDate','phase2StartDate')),'{}')))`;

export type ProgrammeArchive = {
  id: string;
  label: string;
  createdAt: string;
  snapshot: string;
};
export function validateArchive(value: unknown): ProgrammeArchive {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid programme archive.');
  const item = value as ProgrammeArchive;
  if (
    typeof item.id !== 'string' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) ||
    typeof item.label !== 'string' ||
    item.label.length > 100 ||
    typeof item.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(item.createdAt)) ||
    typeof item.snapshot !== 'string' ||
    new TextEncoder().encode(item.snapshot).length > 1_900_000
  )
    throw new Error('Invalid programme archive.');
  const snapshot = JSON.parse(item.snapshot);
  if (
    !Array.isArray(snapshot.entries) ||
    !Array.isArray(snapshot.sessionExercises) ||
    snapshot.programmeId !== item.id ||
    snapshot.archives !== undefined
  )
    throw new Error('Invalid programme archive snapshot.');
  return item;
}
