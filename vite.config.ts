import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';
const isCloudflareDeploy =
  process.env.LIFTLINE_CLOUDFLARE_DEPLOY === 'true';
const cloudflareTarget =
  process.env.LIFTLINE_CLOUDFLARE_TARGET === 'production'
    ? 'production'
    : 'preview';
const cloudflareDatabaseId =
  (cloudflareTarget === 'production'
    ? process.env.LIFTLINE_CLOUDFLARE_PRODUCTION_D1_DATABASE_ID
    : process.env.LIFTLINE_CLOUDFLARE_D1_DATABASE_ID) ||
  SITE_CREATOR_PLACEHOLDER_DATABASE_ID;

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  ...(isCloudflareDeploy
    ? {
        // Keep the public preview and production environments isolated.
        name: `liftline-cloudflare-${cloudflareTarget}`,
        keep_vars: true,
        workers_dev: true,
        preview_urls: false,
      }
    : {}),
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: isCloudflareDeploy
            ? `liftline-cloudflare-${cloudflareTarget}`
            : 'site-creator-d1',
          database_id: isCloudflareDeploy
            ? cloudflareDatabaseId
            : SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          ...(isCloudflareDeploy ? { migrations_dir: '../../drizzle' } : {}),
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      ...(!isCloudflareDeploy ? [sites()] : []),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
