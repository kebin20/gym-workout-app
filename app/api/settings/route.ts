import { env } from 'cloudflare:workers';

const defaultSchedule = {
  phase1StartDate: '2026-08-26',
  phase2StartDate: '2026-11-18',
};

function database() {
  if (!env.DB) throw new Error('Workout database is unavailable.');
  return env.DB;
}

function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  );
}

export async function GET() {
  try {
    const rows = await database()
      .prepare(
        "SELECT key, value FROM app_settings WHERE key IN ('phase1StartDate', 'phase2StartDate')",
      )
      .all<{ key: keyof typeof defaultSchedule; value: string }>();
    const schedule = { ...defaultSchedule };
    for (const row of rows.results) {
      if (row.key in schedule && validDate(row.value))
        schedule[row.key] = row.value;
    }
    return Response.json({ schedule });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to load settings.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<typeof defaultSchedule>;
    if (!validDate(body.phase1StartDate) || !validDate(body.phase2StartDate)) {
      return Response.json(
        { error: 'Choose valid programme start dates.' },
        { status: 400 },
      );
    }
    const phase1 = new Date(`${body.phase1StartDate}T00:00:00Z`).getTime();
    const phase2 = new Date(`${body.phase2StartDate}T00:00:00Z`).getTime();
    if (phase2 <= phase1) {
      return Response.json(
        { error: 'Phase 2 must begin after Phase 1.' },
        { status: 400 },
      );
    }
    const now = new Date().toISOString();
    const db = database();
    await db.batch([
      db
        .prepare(
          'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        )
        .bind('phase1StartDate', body.phase1StartDate, now),
      db
        .prepare(
          'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        )
        .bind('phase2StartDate', body.phase2StartDate, now),
    ]);
    return Response.json({ ok: true, schedule: body });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to save settings.',
      },
      { status: 500 },
    );
  }
}
