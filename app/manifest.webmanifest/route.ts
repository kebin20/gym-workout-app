import { appRelease, withArtworkRevision } from '../app-release';

export function GET() {
  return Response.json(
    {
      name: 'Liftline',
      short_name: 'Liftline',
      id: '/',
      description:
        'A strength tracker for logging sets, reps, RIR, notes, volume, and weekly progress across two training phases.',
      start_url: `/?source=pwa&art=${appRelease.artworkRevision}`,
      scope: '/',
      display: 'standalone',
      background_color: '#F7F9FF',
      theme_color: '#2554E8',
      prefer_related_applications: false,
      icons: appRelease.icons.map((icon) => ({
        ...icon,
        src: withArtworkRevision(icon.src),
      })),
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'private, no-cache, max-age=0, must-revalidate',
      },
    },
  );
}
