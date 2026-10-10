import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Generated output only. Use the bundler's actual dependency graph, not every
// lazy chunk (PDF fonts, reports and secondary screens stay on demand).
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist/client');
const { appVersion } = JSON.parse(
  readFileSync(resolve(root, 'app-release.json'), 'utf8'),
);
const { default: graph } = await import(
  pathToFileURL(resolve(root, 'dist/server/vinext-client-assets.js')).href
);
const entries = [
  'virtual:vinext-app-browser-entry',
  'node_modules/vinext/dist/shims/layout-segment-context.js',
  'app/workout-app.tsx',
];
const assets = new Set(graph.appBootstrapPreinitModules);
for (const entry of entries) {
  if (!graph.dynamicPreloads[entry]?.length)
    throw Error(`Missing startup dependency graph: ${entry}`);
  for (const asset of graph.dynamicPreloads[entry])
    assets.add('/' + asset.replace(/^\//, ''));
}
for (const css of readdirSync(resolve(output, '_next/static/css'))) {
  if (css.endsWith('.css')) assets.add('/_next/static/css/' + css);
}
for (const asset of assets) {
  if (
    !asset.startsWith('/_next/static/') ||
    !existsSync(resolve(output, '.' + asset))
  )
    throw Error(`Invalid or missing startup asset: ${asset}`);
}
writeFileSync(
  resolve(output, 'startup-assets.json'),
  JSON.stringify({ version: appVersion, assets: [...assets].sort() }),
);
console.log(
  `Verified ${assets.size} startup assets for Liftline ${appVersion}.`,
);
