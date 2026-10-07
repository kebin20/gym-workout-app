// Test-only server: real UI and API handlers, synthetic empty database. Never
// contacts the private Site and never reads production workout records.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { routeFixture } from './route-test-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const fixture = routeFixture();
const workouts = fixture.load('app/api/workouts/route.ts');
const originalWorker = execFileSync(
  'git',
  ['show', 'origin/main:public/sw.js'],
  { cwd: root, encoding: 'utf8' },
);
const updatedWorker = readFileSync(resolve(root, 'public/sw.js'), 'utf8');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
};
const servers = [];
for (const [port, mode] of [
  [9340, 'original'],
  [9341, 'updated'],
  [9342, 'bundle'],
]) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname === '/sw.js') {
        res.writeHead(200, {
          'Content-Type': 'text/javascript',
          'Cache-Control': 'no-store',
        });
        res.end(mode === 'original' ? originalWorker : updatedWorker);
        return;
      }
      if (url.pathname === '/api/workouts') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const response = await workouts[req.method](
          new Request(url, {
            method: req.method,
            ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
          }),
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (url.pathname === '/') {
        const html = readFileSync(
          resolve(root, 'dist-mobile/index.html'),
          'utf8',
        );
        // Same compiled UI in all three cases isolates shell strategy. Native
        // timing below measures the client bundle, not WKWebView/iOS startup.
        if (mode !== 'bundle') await new Promise((r) => setTimeout(r, 1500));
        const page =
          mode === 'bundle'
            ? html
            : html
                .replace(
                  '<meta name="liftline-runtime" content="bundled" />',
                  '',
                )
                .replaceAll('./assets/', '/_next/static/');
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store',
        });
        res.end(page);
        return;
      }
      if (url.pathname === '/manifest.webmanifest') {
        res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
        res.end('{}');
        return;
      }
      const asset = url.pathname.startsWith('/_next/static/')
        ? 'assets/' + url.pathname.slice('/_next/static/'.length)
        : url.pathname.slice(1);
      const file = resolve(root, 'dist-mobile', asset);
      if (!file.startsWith(resolve(root, 'dist-mobile') + '/'))
        throw Error('Invalid path');
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      });
      res.end(readFileSync(file));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  servers.push(server);
  console.log(`${mode}: http://127.0.0.1:${port}/`);
}
process.on('SIGINT', () => {
  servers.forEach((s) => s.close());
  fixture.close();
  process.exit(0);
});
