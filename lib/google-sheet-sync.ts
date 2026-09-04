import { env } from 'cloudflare:workers';

export type WorkoutSheetEntry = {
  week: number;
  day: string;
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
  notes: string | null;
  completed: number | boolean;
  completedOn?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
};

export type SheetSyncResult = {
  ok: boolean;
  configured: boolean;
  synced: number;
  message?: string;
};

export type SheetReadResult = {
  ok: boolean;
  configured: boolean;
  entries: WorkoutSheetEntry[];
  message?: string;
};

function getSyncConfig() {
  const webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const token = env.GOOGLE_SHEETS_SYNC_TOKEN?.trim();
  if (!webhookUrl || !token) return null;

  try {
    const url = new URL(webhookUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !url.pathname.endsWith('/exec')) {
      return null;
    }
    return { webhookUrl: url.toString(), token };
  } catch {
    return null;
  }
}

const WORKOUT_TIME_ZONE = 'Asia/Tokyo';
const workoutDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: WORKOUT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function workoutCalendarDate(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(
    workoutDateFormatter
      .formatToParts(date)
      .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function prepareEntryForSheet(entry: WorkoutSheetEntry): WorkoutSheetEntry {
  const completedOn = workoutCalendarDate(entry.completedAt);
  if (!completedOn) return entry;

  return {
    ...entry,
    completedOn,
    // Noon UTC keeps the intended calendar day intact in older connector
    // deployments whose spreadsheet timezone differs from Liftline's.
    completedAt: `${completedOn}T12:00:00.000Z`,
  };
}

export async function syncWorkoutEntries(entries: WorkoutSheetEntry[]): Promise<SheetSyncResult> {
  const config = getSyncConfig();
  if (!config) {
    return {
      ok: false,
      configured: false,
      synced: 0,
      message: 'Google Sheet sync is not connected yet.',
    };
  }

  if (entries.length === 0) return { ok: true, configured: true, synced: 0 };

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        token: config.token,
        action: 'write',
        entries: entries.map(prepareEntryForSheet),
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    const responseText = await response.text();
    let result: { ok?: boolean; synced?: number; error?: string } = {};
    try {
      result = JSON.parse(responseText) as typeof result;
    } catch {
      // A non-JSON response is handled by the failure branch below.
    }

    if (!response.ok || !result.ok) {
      return {
        ok: false,
        configured: true,
        synced: Number(result.synced ?? 0),
        message: result.error ?? 'The Google Sheet did not accept the update.',
      };
    }

    return {
      ok: true,
      configured: true,
      synced: Number(result.synced ?? entries.length),
    };
  } catch {
    return {
      ok: false,
      configured: true,
      synced: 0,
      message: 'Liftline is saved, but the Google Sheet could not be reached.',
    };
  }
}

export async function readWorkoutEntriesFromSheet(): Promise<SheetReadResult> {
  const config = getSyncConfig();
  if (!config) {
    return { ok: false, configured: false, entries: [], message: 'Google Sheet sync is not connected yet.' };
  }

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ token: config.token, action: 'read' }),
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    const responseText = await response.text();
    let result: { ok?: boolean; entries?: WorkoutSheetEntry[]; error?: string } = {};
    try {
      result = JSON.parse(responseText) as typeof result;
    } catch {
      // A non-JSON response is handled by the failure branch below.
    }

    if (!response.ok || !result.ok || !Array.isArray(result.entries)) {
      return {
        ok: false, configured: true, entries: [],
        message: result.error ?? 'The Google Sheet import connector needs to be updated.',
      };
    }

    return { ok: true, configured: true, entries: result.entries };
  } catch {
    return { ok: false, configured: true, entries: [], message: 'The Google Sheet could not be reached.' };
  }
}
