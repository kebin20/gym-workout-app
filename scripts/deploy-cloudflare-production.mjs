import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
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

const deploy = spawnSync(
  process.execPath,
  [wranglerCli, 'deploy', '--config', configPath],
  {
    cwd: projectRoot,
    env: {
      ...env,
      WRANGLER_WRITE_LOGS: process.env.WRANGLER_WRITE_LOGS ?? 'false',
    },
    stdio: 'inherit',
  },
);

if (deploy.error) throw deploy.error;
if (deploy.status !== 0) {
  throw new Error(
    `Cloudflare production deployment failed with exit code ${deploy.status ?? 'unknown'}.`,
  );
}
