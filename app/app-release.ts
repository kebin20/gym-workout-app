import release from '../app-release.json';

export const appRelease = release;
export const appVersion = release.appVersion;
export const artworkRevision = release.artworkRevision;

export function withArtworkRevision(path: string) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}art=${artworkRevision}`;
}

export const installManifestHref = withArtworkRevision(release.manifestPath);
export const appleTouchIcons = release.appleTouchIcons.map((icon) => ({
  ...icon,
  href: withArtworkRevision(icon.src),
}));
export const appleTouchIcon180Href =
  appleTouchIcons.find((icon) => icon.sizes === '180x180')?.href ??
  withArtworkRevision('/apple-touch-icon.png');
export const brandMarkHref = withArtworkRevision(release.brandMarkPath);
export const notificationIconHref = withArtworkRevision(
  release.notificationIconPath,
);
