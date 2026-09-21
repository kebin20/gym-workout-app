import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const releasePath = resolve(projectRoot, 'app-release.json');
const packagePath = resolve(projectRoot, 'package.json');
const layoutPath = resolve(projectRoot, 'app/layout.tsx');
const routePath = resolve(projectRoot, 'app/manifest.webmanifest/route.ts');

const [release, packageJson, layoutSource, routeSource] = await Promise.all([
  readJson(releasePath),
  readJson(packagePath),
  readFile(layoutPath, 'utf8'),
  readFile(routePath, 'utf8'),
]);

const problems = [];

if (packageJson.version !== release.appVersion) {
  problems.push(
    `package.json version ${packageJson.version} does not match app-release.json ${release.appVersion}`,
  );
}

if (!/^v\d+$/.test(release.artworkRevision)) {
  problems.push('artworkRevision must use the form v1, v2, v3, and so on');
}

if (release.manifestPath !== '/manifest.webmanifest') {
  problems.push('manifestPath must remain /manifest.webmanifest');
}

if (!layoutSource.includes('crossOrigin="use-credentials"')) {
  problems.push(
    'the manifest link must retain crossOrigin="use-credentials" for the private Site',
  );
}

if (!layoutSource.includes('installManifestHref')) {
  problems.push('layout.tsx must use the shared installManifestHref');
}

if (!layoutSource.includes('appleTouchIconHref')) {
  problems.push('layout.tsx must use the shared appleTouchIconHref');
}

if (!routeSource.includes('appRelease.icons.map')) {
  problems.push('the manifest route must use the shared icon registry');
}

const expectedIcons = [
  {
    path: release.appleTouchIconPath,
    sizes: '180x180',
    label: 'Apple touch icon',
  },
  ...release.icons.map((icon) => ({
    path: icon.src,
    sizes: icon.sizes,
    label: `${icon.purpose} install icon`,
  })),
  {
    path: release.brandMarkPath,
    sizes: '192x192',
    label: 'in-app brand mark',
  },
  {
    path: release.notificationIconPath,
    sizes: '192x192',
    label: 'notification icon',
  },
  {
    path: release.favicon32Path,
    sizes: '32x32',
    label: '32px favicon',
  },
  {
    path: release.favicon64Path,
    sizes: '64x64',
    label: '64px favicon',
  },
];

const requiredArtworkPaths = [
  'appleTouchIconPath',
  'brandMarkPath',
  'notificationIconPath',
  'faviconSvgPath',
  'favicon32Path',
  'favicon64Path',
];

for (const key of requiredArtworkPaths) {
  if (typeof release[key] !== 'string' || !release[key].startsWith('/')) {
    problems.push(`${key} must be a root-relative artwork path`);
  }
}

try {
  await stat(resolve(projectRoot, 'public', release.faviconSvgPath.slice(1)));
} catch {
  problems.push(`SVG favicon is missing: ${release.faviconSvgPath}`);
}

for (const icon of expectedIcons) {
  const relativePath = icon.path.replace(/^\//, '').split('?')[0];
  const absolutePath = resolve(projectRoot, 'public', relativePath);

  try {
    await stat(absolutePath);
    const { width, height } = await readPngDimensions(absolutePath);
    const [expectedWidth, expectedHeight] = icon.sizes.split('x').map(Number);
    if (width !== expectedWidth || height !== expectedHeight) {
      problems.push(
        `${icon.label} ${relativePath} is ${width}x${height}; expected ${icon.sizes}`,
      );
    }
  } catch (error) {
    problems.push(`${icon.label} is missing or invalid: ${relativePath}`);
  }
}

if (problems.length > 0) {
  console.error('Brand asset verification failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(
  `Brand assets verified for Liftline ${release.appVersion} (${release.artworkRevision}).`,
);

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readPngDimensions(path) {
  const buffer = await readFile(path);
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error('not a PNG');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}
