import { env } from 'cloudflare:workers';

type MetricPayload = {
  date?: string;
  weight?: number | null;
  waist?: number | null;
  bodyFat?: number | null;
  leanMass?: number | null;
  source?: string;
  notes?: string;
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

function optionalNumber(value: unknown, max: number) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max
    ? parsed
    : undefined;
}

function cleanMetric(value: MetricPayload) {
  if (!validDate(value.date))
    throw new Error('Each measurement needs a valid date.');
  const weight = optionalNumber(value.weight, 500);
  const waist = optionalNumber(value.waist, 300);
  const bodyFat = optionalNumber(value.bodyFat, 100);
  const leanMass = optionalNumber(value.leanMass, 300);
  if ([weight, waist, bodyFat, leanMass].some((item) => item === undefined))
    throw new Error('One or more measurements are outside the allowed range.');
  if ([weight, waist, bodyFat, leanMass].every((item) => item == null))
    throw new Error('Add at least one measurement.');
  const source = ['manual', 'withings', 'inbody', 'csv'].includes(
    String(value.source),
  )
    ? String(value.source)
    : 'manual';
  return {
    date: value.date,
    weight,
    waist,
    bodyFat,
    leanMass,
    source,
    notes: String(value.notes ?? '').slice(0, 500),
  };
}

export async function GET() {
  try {
    const rows = await database()
      .prepare(
        'SELECT id, date, weight, waist, body_fat AS bodyFat, lean_mass AS leanMass, source, notes, updated_at AS updatedAt FROM body_metrics ORDER BY date DESC, updated_at DESC LIMIT 100',
      )
      .all();
    return Response.json({ metrics: rows.results });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load body metrics.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as
      | MetricPayload
      | { metrics?: MetricPayload[] };
    const raw =
      'metrics' in body && Array.isArray(body.metrics)
        ? body.metrics.slice(0, 100)
        : [body as MetricPayload];
    const metrics = raw.map(cleanMetric);
    const now = new Date().toISOString();
    const db = database();
    await db.batch(
      metrics.map((metric) =>
        db
          .prepare(
            'INSERT INTO body_metrics (date, weight, waist, body_fat, lean_mass, source, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(date, source) DO UPDATE SET weight = excluded.weight, waist = excluded.waist, body_fat = excluded.body_fat, lean_mass = excluded.lean_mass, notes = excluded.notes, updated_at = excluded.updated_at',
          )
          .bind(
            metric.date,
            metric.weight,
            metric.waist,
            metric.bodyFat,
            metric.leanMass,
            metric.source,
            metric.notes,
            now,
          ),
      ),
    );
    return Response.json({ ok: true, saved: metrics.length });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to save body metrics.',
      },
      { status: 400 },
    );
  }
}
