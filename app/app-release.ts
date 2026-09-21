import release from '../app-release.json';

export const appRelease = release;
export const appVersion = release.appVersion;
export const artworkRevision = release.artworkRevision;

export function withArtworkRevision(path: string) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}art=${artworkRevision}`;
}

export const installManifestHref = withArtworkRevision(release.manifestPath);
export const appleTouchIconHref = withArtworkRevision(
  release.appleTouchIconPath,
);
export const brandMarkHref = withArtworkRevision(release.brandMarkPath);
export const notificationIconHref = withArtworkRevision(
  release.notificationIconPath,
);
