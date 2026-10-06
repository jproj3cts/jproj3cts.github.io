import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(new URL('./migrations', import.meta.url).pathname);
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // the production values, whatever a local .dev.vars says
            APP_ORIGINS: 'https://jeksys.net',
            APP_URL: 'https://jeksys.net/jek/tools/jekray2d.html',
            API_URL: 'https://api.jeksys.net',
            GOOGLE_CLIENT_SECRET: 'test-google-secret',
            ORCID_CLIENT_SECRET: 'test-orcid-secret',
            MICROSOFT_CLIENT_ID: '11111111-2222-3333-4444-555555555555',
            MICROSOFT_CLIENT_SECRET: 'test-microsoft-secret',
            STRIPE_SECRET_KEY: 'rk_test_x',
            STRIPE_WEBHOOK_SECRET: 'whsec_test',
            ORCID_LEGACY_UNTIL: '2099-01-01T00:00:00Z',
            RESEND_API_KEY: 're_test_key',
            OPS_TOKEN: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.js'] },
  };
});
