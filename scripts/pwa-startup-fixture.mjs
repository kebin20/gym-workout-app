// Production web assets + synthetic API only. Never contacts the private Site.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { routeFixture } from './route-test-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist/client');
const fixture = routeFixture();
const workouts = fixture.load('app/api/workouts/route.ts');
const documentResponse = await fetch('http://localhost:9350/');
if (!documentResponse.ok)
  throw Error('Start the local production worker on port 9350.');
const html = await documentResponse.text();
if (!html.includes('name="liftline-build"'))
  throw Error('Production build marker missing.');
const baseline = execFileSync(
  'git',
  ['show', 'e826da60ad5e5989c5f96751083298b9df164bc3:public/sw.js'],
  { cwd: root, encoding: 'utf8' },
);
const current = readFileSync(resolve(output, 'sw.js'), 'utf8');
const servers = [];
let failCritical = false;
for (const [port, worker] of [
  [9340, baseline],
  [9341, current],
]) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname === '/__test/fail-critical') {
        failCritical = url.searchParams.has('on');
        res.end('ok');
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
      if (url.pathname.startsWith('/api/')) {
        res.writeHead(404);
        res.end('{}');
        return;
      }
      if (url.pathname === '/sw.js') {
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-store',
        });
        res.end(worker);
        return;
      }
      if (url.pathname === '/') {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store',
        });
        res.end(html);
        return;
      }
      if (url.pathname === '/manifest.webmanifest') {
        res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
        res.end('{}');
        return;
      }
      if (
        failCritical &&
        url.pathname.startsWith('/_next/static/') &&
        url.pathname.includes('checkbox-')
      ) {
        res.writeHead(503);
        res.end('Test-only failed asset');
        return;
      }
      const file = resolve(output, '.' + url.pathname);
      if (!file.startsWith(output + '/')) throw Error('Invalid path');
      const types = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.ttf': 'font/ttf',
      };
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(readFileSync(file));
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  console.log(
    `${port === 9340 ? 'baseline v3.13.1' : 'current'}: http://127.0.0.1:${port}/`,
  );
  servers.push(server);
}
process.on('SIGINT', () => {
  servers.forEach((server) => server.close());
  fixture.close();
  process.exit(0);
});
