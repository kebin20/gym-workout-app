import { env } from 'cloudflare:workers';

type ReadinessPayload = {
  week?: number;
  day?: string;
  sleep?: number;
  energy?: number;
  soreness?: number;
  jointComfort?: number;
};

function database() {
  if (!env.DB) throw new Error('Workout database is unavailable.');
  return env.DB;
}

function score(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

function recommendation(
  values: Required<Omit<ReadinessPayload, 'week' | 'day'>>,
) {
  if (values.energy <= 2 || values.sleep <= 2 || values.jointComfort <= 2) {
    return 'Recovery day: reduce working load by 5–10%, keep 3–4 reps in reserve, and stop any movement that causes joint pain.';
  }
  if (values.soreness >= 4 || values.energy === 3 || values.sleep === 3) {
    return 'Modified session: keep the main lifts comfortable and remove one optional accessory set if performance drops.';
  }
  return 'Train as planned. Your recovery signals support the scheduled session—keep technique consistent and use the prescribed RIR.';
}

export async function GET() {
  try {
    const rows = await database()
      .prepare(
        'SELECT id, checked_at AS checkedAt, week, day, sleep, energy, soreness, joint_comfort AS jointComfort, recommendation FROM readiness_checks ORDER BY checked_at DESC LIMIT 20',
      )
      .all();
    return Response.json({ checks: rows.results });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load readiness checks.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReadinessPayload;
    const week = Number(body.week);
    const day = String(body.day ?? '');
    const sleep = score(body.sleep);
    const energy = score(body.energy);
    const soreness = score(body.soreness);
    const jointComfort = score(body.jointComfort);
    if (
      !Number.isInteger(week) ||
      week < 1 ||
      week > 24 ||
      !['A', 'B', 'C'].includes(day) ||
      sleep == null ||
      energy == null ||
      soreness == null ||
      jointComfort == null
    ) {
      return Response.json(
        { error: 'Complete every readiness score from 1 to 5.' },
        { status: 400 },
      );
    }
    const checkedAt = new Date().toISOString();
    const advice = recommendation({ sleep, energy, soreness, jointComfort });
    const result = await database()
      .prepare(
        'INSERT INTO readiness_checks (checked_at, week, day, sleep, energy, soreness, joint_comfort, recommendation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(checkedAt, week, day, sleep, energy, soreness, jointComfort, advice)
      .run();
    return Response.json({
      ok: true,
      check: {
        id: result.meta.last_row_id,
        checkedAt,
        week,
        day,
        sleep,
        energy,
        soreness,
        jointComfort,
        recommendation: advice,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to save readiness check.',
      },
      { status: 500 },
    );
  }
}
