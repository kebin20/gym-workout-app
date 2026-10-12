import { env } from 'cloudflare:workers';
import {
  activeProgrammeId,
  programmeGuardSql,
  programmeMatches,
  programmeSnapshotSql,
} from '@/lib/programme-storage';

export async function GET(request: Request) {
  try {
    if (!env.DB) throw new Error('Database unavailable.');
    const url = new URL(request.url),
      id = url.searchParams.get('id');
    if (id) {
      const archive = await env.DB.prepare(
        'SELECT id,label,created_at AS createdAt,snapshot FROM programme_archives WHERE id=?',
      )
        .bind(id)
        .first<{
          id: string;
          label: string;
          createdAt: string;
          snapshot: string;
        }>();
      return archive
        ? Response.json(
            {
              ...archive,
              rawSnapshot: archive.snapshot,
              snapshot: JSON.parse(archive.snapshot),
            },
            { headers: { 'Cache-Control': 'no-store' } },
          )
        : Response.json({ error: 'Archive not found.' }, { status: 404 });
    }
    const before = url.searchParams.get('before') ?? '9999';
    const rows = await env.DB.prepare(
      'SELECT id,label,created_at AS createdAt FROM programme_archives WHERE created_at < ? ORDER BY created_at DESC LIMIT 21',
    )
      .bind(before)
      .all<{ id: string; label: string; createdAt: string }>();
    return Response.json(
      {
        programmeId: await activeProgrammeId(env.DB),
        archives: rows.results.slice(0, 20),
        next: rows.results.length > 20 ? rows.results[19].createdAt : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Cannot load programmes.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!env.DB) throw new Error('Database unavailable.');
    const body = (await request.json()) as {
      programmeId?: string;
      startDate?: string;
      confirm?: string;
    };
    const id = await activeProgrammeId(env.DB);
    if (!programmeMatches(body.programmeId, id))
      return Response.json(
        {
          error:
            'The active programme changed. Reload before starting another.',
        },
        { status: 409 },
      );
    if (
      body.confirm !== 'ARCHIVE' ||
      typeof body.startDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ||
      !Number.isFinite(Date.parse(body.startDate)) ||
      new Date(body.startDate).toISOString().slice(0, 10) !== body.startDate
    )
      return Response.json(
        { error: 'Confirm archiving and choose a valid start date.' },
        { status: 400 },
      );
    const nextId = crypto.randomUUID(),
      now = new Date().toISOString();
    // An imported standalone archive may already use the old programme ID.
    // Never overwrite it or make restarting impossible: give the new snapshot
    // a separate immutable archive identity and preserve the source identity.
    const existing = await env.DB.prepare(
      'SELECT id FROM programme_archives WHERE id=?',
    )
      .bind(id)
      .first();
    const archiveId = existing
      ? `${id.slice(0, 40)}-${crypto.randomUUID()}`
      : id;
    const phase2 = new Date(Date.parse(body.startDate) + 84 * 86400000)
      .toISOString()
      .slice(0, 10);
    // Every statement is in the same D1 transaction. The snapshot is built in
    // SQL, not from an earlier JS read. A unique transition marker gates resets.
    const gate = `EXISTS (SELECT 1 FROM programme_archives WHERE id=? AND created_at=?) AND ${programmeGuardSql}`;
    const statements = [
      env.DB.prepare(
        `INSERT INTO programme_archives (id,label,created_at,snapshot) SELECT ?,?,?,${programmeSnapshotSql} WHERE ${programmeGuardSql} AND EXISTS(SELECT 1 FROM workout_entries) AND NOT EXISTS(SELECT 1 FROM programme_archives WHERE id=?)`,
      ).bind(
        archiveId,
        `Programme archived ${now.slice(0, 10)}`,
        now,
        archiveId,
        id,
        id,
        archiveId,
      ),
      env.DB.prepare(`DELETE FROM workout_entries WHERE ${gate}`).bind(
        archiveId,
        now,
        id,
      ),
      env.DB.prepare(`DELETE FROM session_exercises WHERE ${gate}`).bind(
        archiveId,
        now,
        id,
      ),
      ...[
        ['phase1StartDate', body.startDate],
        ['phase2StartDate', phase2],
        ['programmeId', nextId],
      ].map(([key, value]) =>
        env
          .DB!.prepare(
            `INSERT INTO app_settings (key,value,updated_at) SELECT ?,?,? WHERE ${gate} ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
          )
          .bind(key, value, now, archiveId, now, id),
      ),
    ];
    const result = await env.DB.batch(statements);
    if (result[0].meta.changes !== 1)
      return Response.json(
        {
          error:
            'No records to archive, or the programme was already changed. Reload and review.',
        },
        { status: 409 },
      );
    return Response.json({
      ok: true,
      programmeId: nextId,
      archivedId: archiveId,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Cannot start another programme.',
      },
      { status: 500 },
    );
  }
}
