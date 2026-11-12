import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wranglerCli = resolve(projectRoot, 'node_modules/wrangler/bin/wrangler.js');
const configPath = 'dist/server/wrangler.json';
const env = {
  ...process.env,
  LIFTLINE_CLOUDFLARE_TARGET: 'production',
};

const configCheck = spawnSync(
  process.execPath,
  ['scripts/check-cloudflare-deploy-config.mjs'],
  { cwd: projectRoot, env, stdio: 'inherit' },
);

if (configCheck.error) throw configCheck.error;
if (configCheck.status !== 0) {
  throw new Error('Cloudflare production config check failed.');
}

const config = JSON.parse(readFileSync(resolve(projectRoot, configPath), 'utf8'));
if (config.route || config.routes?.length || config.triggers?.crons?.length) {
  throw new Error(
    'Production version promotion does not manage routes or cron triggers. Review those changes separately.',
  );
}

const outputDirectory = mkdtempSync(join(tmpdir(), 'liftline-deploy-'));
function runWrangler(args, outputFile) {
  const result = spawnSync(
    process.execPath,
    [wranglerCli, ...args, '--config', configPath],
    {
      cwd: projectRoot,
      env: {
        ...env,
        WRANGLER_OUTPUT_FILE_PATH: outputFile,
        WRANGLER_WRITE_LOGS: process.env.WRANGLER_WRITE_LOGS ?? 'false',
      },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Cloudflare production ${args.slice(0, 2).join(' ')} failed with exit code ${result.status ?? 'unknown'}.`,
    );
  }
}

try {
  // Version commands only update the existing Worker. They avoid the legacy
  // deploy command's account-wide dashboard/routes inspection and retain its
  // existing workers.dev route, dashboard variables, and secret bindings.
  const uploadOutput = join(outputDirectory, 'upload.jsonl');
  runWrangler(['versions', 'upload', '--keep-vars'], uploadOutput);
  const upload = readFileSync(uploadOutput, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .findLast((record) => record.type === 'version-upload');
  if (
    upload?.worker_name !== 'liftline-cloudflare-production' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(upload?.version_id ?? '')
  ) {
    throw new Error('Wrangler did not confirm a valid production Worker version; refusing to promote.');
  }
  runWrangler(
    ['versions', 'deploy', `${upload.version_id}@100%`, '--yes'],
    join(outputDirectory, 'deploy.jsonl'),
  );
  console.log(`Promoted production Worker version ${upload.version_id} to 100% of traffic.`);
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
