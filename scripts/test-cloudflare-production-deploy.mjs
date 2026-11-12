import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const databaseId = '91038670-61a2-454c-b930-d79eceb1005c';
const versionId = '11111111-2222-4333-8444-555555555555';

function fixture(mode = '', routes = []) {
  const root = mkdtempSync(join(tmpdir(), 'liftline-deploy-test-'));
  for (const path of ['scripts', 'dist/server', 'node_modules/wrangler/bin'])
    mkdirSync(join(root, path), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'node_modules/wrangler/package.json'), '{"type":"module"}');
  for (const name of ['deploy-cloudflare-production.mjs', 'check-cloudflare-deploy-config.mjs'])
    copyFileSync(new URL(name, import.meta.url), join(root, 'scripts', name));
  writeFileSync(join(root, 'dist/server/wrangler.json'), JSON.stringify({
    name: 'liftline-cloudflare-production', workers_dev: true, preview_urls: false,
    routes,
    d1_databases: [{ binding: 'DB', database_name: 'liftline-cloudflare-production',
      database_id: databaseId, migrations_dir: '../../drizzle' }],
  }));
  writeFileSync(join(root, 'node_modules/wrangler/bin/wrangler.js'), `
    import { appendFileSync, writeFileSync } from 'node:fs';
    const args = process.argv.slice(2);
    appendFileSync('calls.jsonl', JSON.stringify({ args, output: process.env.WRANGLER_OUTPUT_FILE_PATH }) + '\\n');
    const mode = process.env.TEST_DEPLOY_MODE;
    if (args[1] === 'upload') {
      if (mode === 'upload-fail') process.exit(2);
      if (mode !== 'missing-output') writeFileSync(process.env.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({
        type: 'version-upload',
        worker_name: mode === 'wrong-worker' ? 'another-worker' : 'liftline-cloudflare-production',
        version_id: mode === 'invalid-version' ? 'latest' : '${versionId}',
      }) + '\\n');
    } else if (args[1] === 'deploy' && mode === 'deploy-fail') process.exit(3);
  `);
  return {
    run: () => spawnSync(process.execPath, ['scripts/deploy-cloudflare-production.mjs'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, TEST_DEPLOY_MODE: mode,
        CLOUDFLARE_API_TOKEN: 'test-only', CLOUDFLARE_ACCOUNT_ID: 'test-account',
        LIFTLINE_CLOUDFLARE_PRODUCTION_D1_DATABASE_ID: databaseId },
    }),
    calls: () => existsSync(join(root, 'calls.jsonl'))
      ? readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [],
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('production promotes only the uploaded Worker version and preserves dashboard variables', () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const calls = f.calls();
    assert.deepEqual(calls.map(({ args }) => args), [
      ['versions', 'upload', '--keep-vars', '--config', 'dist/server/wrangler.json'],
      ['versions', 'deploy', `${versionId}@100%`, '--yes', '--config', 'dist/server/wrangler.json'],
    ]);
    assert.ok(calls.every(({ output }) => !existsSync(output)), 'temporary output is removed');
  } finally { f.close(); }
});

for (const mode of ['upload-fail', 'missing-output', 'wrong-worker', 'invalid-version']) {
  test(`production refuses promotion after ${mode}`, () => {
    const f = fixture(mode);
    try {
      assert.notEqual(f.run().status, 0);
      assert.equal(f.calls().length, 1);
      assert.ok(f.calls().every(({ output }) => !existsSync(output)));
    } finally { f.close(); }
  });
}

test('production reports a failed promotion instead of reporting deployment success', () => {
  const f = fixture('deploy-fail');
  try {
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /Promoted production/);
    assert.equal(f.calls().length, 2);
  } finally { f.close(); }
});

test('route changes require review before the version-only production deployment', () => {
  const f = fixture('', ['example.com/*']);
  try {
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not manage routes/);
    assert.deepEqual(f.calls(), []);
  } finally { f.close(); }
});
